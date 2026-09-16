以下逐項對照附檔行號。未附上的 `scripts/retry-verification.py`、`scripts/smoke-site.mjs`、`playwright.config.ts`、`package.json`、`style.css` 不在本次審查範圍。

## 先說結論

資料隔離與 WAV 驗證這兩塊做得紮實（token hash、`unique(question_id,member_id)`、伺服器端解析真實 PCM 標頭、claim-then-process 的原子更新、上傳失敗即刪檔），沒有發現跨學生或跨課堂讀取的路徑。真正會在課堂上出事的是**「老師切題/收題的那一秒」**與 **AI 輸出格式**這兩條路徑。

---

## P0

### 1. 老師切題或收題時，進行中的錄音會被靜默截斷並送去評分
`src/main.tsx:806-815`（`<Recorder key={q.id}>`）+ `src/main.tsx:879-887`（unmount cleanup 呼叫 `recorder.current.stop()`）+ `src/main.tsx:935-953`（`onstop` 無條件走 `upload()`）。

重現：學生按下開始錄音，說到第 3 秒時老師按「開放」下一題或按「收題」。3 秒後學生端輪詢（`src/main.tsx:737-740`）取得新的 active question → `q` 改變 → Recorder 因 `key` 改變而 unmount → cleanup 停止錄音 → `onstop` 把 3 秒的半句話包成 WAV，送到**舊題**的 response（伺服器端 `supabase/functions/ten-second/index.ts:458-469` 只檢查 `status==='recording'` 與 120 秒，不檢查題目是否已 closed，所以會收下）→ Gemini 給這半句話打分。

後果有兩種，都不可接受：
- 截斷片段 ≥0.25 秒：被當成該生的正式作答評分，學生畫面已切到新題，**完全看不到自己被打了幾分**。
- 截斷片段 <0.25 秒：`src/main.tsx:942` 丟出「請至少說一句再送出」，但元件已卸載，`setError` 沒有任何畫面承接 → 靜默丟失，row 永遠停在 `recording`，老師端列為「本題未答」。

這跟 README 承諾的「已經開始的錄音可完成上傳」不一致——伺服器確實允許 120 秒內補交，是前端自己把錄音砍掉的。

建議（貼合既有設計、改動小）：在 `Student` 裡把顯示中的題目 id 放進 state，只有當 Recorder 不在 `recording`/`sending` 階段時才推進；Recorder 透過 callback 回報 phase。老師收題後讓該生把自己的 10 秒錄完再送出，伺服器端已經支援。

### 2. Gemini 結構化輸出設定與解析都沒有退路
`supabase/functions/ten-second/index.ts:69-96` 用的是 `generationConfig.responseFormat.text.mimeType = "APPLICATION_JSON"` + `schema`；Gemini 結構化輸出的文件慣例是 `responseMimeType: "application/json"` + `responseSchema`，大小寫也不同。你現在正在等的三段合成音訊重試，實際上就是在賭這個欄位名。

而 `index.ts:108-113` 沒有任何容錯：`raw` 若是被 ```json 圍欄包住、或前後帶一句說明文字，`JSON.parse(raw)` 直接丟例外 → 進 `catch` → **全班所有人都變 `failed`**，老師只能一個一個按「重試評分」，而重試會走同一條必然失敗的路。

無論待驗結果如何，都該補上：`raw.trim()` 去圍欄 + 取第一個 `{...}` 區塊再 parse；`index.ts:123-129` 目前 `level` 非 unscorable 但 `score` 為 null 時直接丟「分數無效」判 failed，模型這樣回其實很常見，建議降級為 `score=null` 保留 level，而不是整筆作廢。另外 `thinkingConfig.thinkingLevel`（`index.ts:70`）綁定 Gemini 3 系列語法，`TEN_SECOND_MODEL` 若被設成 2.5 系列會直接 400。

若線上重試通過，本項降為 P1，但退路仍要補。

---

## P1

### 3. 上傳失敗的學生會被永久鎖死在該題
`index.ts:468-469`（submit 超過 `started_at` 120 秒即拒收）+ `index.ts:436-447`（`start` 對既有 `recording` row 直接回傳舊的 `started_at`，不重置）+ `src/main.tsx:914-916`（前端 110 秒前置檢查）。

重現：學生在校園 wifi 不穩時送出失敗 → 畫面停在「重新上傳這段錄音」（`src/main.tsx:897`）→ 學生等了兩分鐘才恢復連線再按重送 → 「錄音上傳已逾時，請老師另開一題」。此時重整頁面也沒用，`start` 回傳的還是舊 ticket，前端直接丟「本題錄音已逾時，請告知老師」。老師端**沒有任何補救動作**（沒有重置 response 的 action，`delete_question` 只對 draft 有效）。

建議：`start` 在 `old.status === 'recording'` 且題目仍 active 時更新 `started_at` 後回傳；或把時限改成以題目開放時間為基準。

### 4. 全班同時提交時卡在 processing，只能逐筆手動重試
`index.ts:510` 用 `EdgeRuntime.waitUntil` 背景跑 `assess`，單次 Gemini 呼叫 timeout 設到 55 秒（`index.ts:45`）。一個班 30 人在同一分鐘內提交，若有數個 isolate 被回收，那些 response 會永遠停在 `processing`；`src/main.tsx:674-690` 要等 90 秒後才出現「重試評分」，而且是**一列一個按鈕**。上課中逐一點 8 個學生重試不可行，也沒有任何 cron/掃描把過期的 processing 撿回來。

建議：老師端加一個「重試全部未完成」按鈕（後端 `retry` 已有 claim 保護，批次呼叫是安全的），這是幾行的事；另外把 `debug_error`（已在 dashboard payload 裡，`index.ts:301` select `*`）顯示出來，否則老師只看到「評分需重試」卻不知道是配額用盡還是格式錯。

### 5. AI 成本與暴力破解都沒有上限
- `index.ts:367-393`：`join` 對每個 class 的人數、對每個來源的頻率都沒有任何上限。拿到課堂碼（QR 投影在螢幕上、學生會互傳連結）的人可以腳本化建立任意數量 member，每人每題各觸發一次 Gemini 呼叫。目前唯一的天然上限是題目 active 的那段時間。
- `index.ts:157-175`：owner key 比對沒有節流、沒有鎖定，端點是 `--no-verify-jwt` 的公開 URL，可無限速率對 `classes` 撞密碼；而這把 key 一旦破解可讀全部學生姓名、學號與錄音。

務實做法：`join` 時檢查該 class 的 member 數，超過（例如）150 就拒絕；對 owner 驗證失敗加固定 1 秒延遲；每個 class 的 response 總數設上限。不需要完整的 rate limit 基礎建設。

### 6. `check()` 把所有錯誤壓成同一句誤導訊息
`index.ts:21-24`。`.single()` 找不到資料也會被轉成「資料儲存失敗，請重試」。重現：學生開 `#join=ZZZZZZZZZZ`（打錯或舊碼）→ `index.ts:358-364` 的 peek 拿不到 class → 學生看到「資料儲存失敗，請重試」，會一直重按。同樣地 `index.ts:395-402` token 對不上時也是這句。

至少把 class 查無此碼、member 查無此人這兩個高頻情境分開給明確訊息。順帶：`src/main.tsx:722-724` 的 `ts-joined-<code>` 若與 token 不同步（member 查不到），學生會卡在錯誤畫面且無法回到加入表單，應在這個特定錯誤時清掉 joined flag。

### 7. 錄音與個資完全沒有刪除路徑
`supabase/schema.sql` 與 `index.ts` 的 `teacherActions`（`index.ts:162-173`）都沒有 `delete_class` / `delete_response`。學生姓名、學號與語音錄音永久留存，老師連刪一筆測試資料都做不到，`verify-live.py` 每跑一次就留一個測試課堂與三段錄音在 bucket 裡。README 已經誠實揭露「沒有自動到期刪除」，但目前是**連手動刪除都不存在**。這不是 SaaS 功能，是收未成年人語音的基本責任。一個 `delete_class`（cascade + `storage.remove` 該 class prefix）就夠。

### 8. 真機路徑零驗證（測試缺口，最高優先）
兩個 Playwright 測試都跑 Chromium，而學生 100% 用手機。iOS Safari 的 `MediaRecorder` 產出 `audio/mp4`（`src/main.tsx:918`），接著要靠 `decodeAudioData`（`src/audio.ts:20`）解碼**被中途 stop 的 mp4**——這條路徑完全沒被任何測試或人工驗證覆蓋，失敗的話整堂課學生都送不出錄音。這是課前唯一必須用真 iPhone + 真 Android 各跑一次的項目，優先於本清單其他所有事。

### 9. 其他測試缺口
- 老師端 dashboard 的表格、三個篩選（`src/main.tsx:612-623`）、CSV 下載、播放簽章網址、重試按鈕的出現條件（`src/main.tsx:674-677`）**全部沒有測試**——`tests/browser.spec.ts:10-12` 的 mock 永遠回傳空的 members/responses。至少補一個 mock 出 5 名學生 × 混合狀態的渲染測試。
- `verify-live.py:38` 驗證了「closed question blocks new recording」，但沒驗證 README 承諾的「收題前已開始的錄音仍可上傳」。
- 沒有測試 120 秒逾時、`retry` 的 claim 競態、以及 P0-1 的切題截斷情境。
- 沒有併發測試：script 同時 20 個 submit，確認 20 筆都變 done。

---

## P2

- `src/audio.ts:8-22`：`sourceRate < 16000` 時 `ratio < 1`，`start === end` 使 `end - start === 0`，`result[index] = 0 / 1 = 0` → **整段輸出全靜音**，學生完全無感，AI 一律回「無法判讀」。部分 Android 接藍牙耳機時 AudioContext 預設 rate 會低於 16k。一行修法：`new AudioContext({ sampleRate: 16000 })`，`decodeAudioData` 會代為重取樣，`downsample` 自然變成 no-op。
- `index.ts:236-245` 的 `delete_question` 後端存在但前端沒有任何按鈕。備課打錯字的題目一旦開過就永遠留在下拉選單和 CSV 裡。
- `index.ts:289` / `index.ts:410` 的 `order("position")` 沒有次要排序鍵，position 相同時每次輪詢的題號可能跳動。加 `.order("id")`。
- `src/main.tsx:91-102` 的輪詢用 `setError` 但從不清除：一次網路抖動會讓紅色錯誤條掛在畫面上直到老師做下一個動作。輪詢成功時應 `setError("")`。同一個輪詢也會與 `run()` 的動作競態，最多 4 秒把剛改的狀態顯示回舊值。
- `src/main.tsx:874, 947`：`pending` 只在記憶體，學生在「重新上傳」狀態下重整頁面錄音就沒了。存 sessionStorage 可救。
- `src/main.tsx:599`：簽章網址 120 秒到期（`index.ts:320`），老師暫停後過兩分鐘再播會失敗且無錯誤提示。
- `src/main.tsx:145` 的 CSV 注入防護只擋 `^[=+@-]`，不含前導 tab/CR；`src/main.tsx:157` 用 `cls.title` 直接當檔名未淨化。
- `src/main.tsx:181` 把 InterAct 管理密碼明文放 sessionStorage，且每 4 秒隨輪詢送出一次。單教師工具可接受，但值得知道。
- `index.ts:7` CORS `*` 搭配 body 帶密碼是可接受的（無 cookie，無法被 CSRF 利用），僅記錄。
- 學生可冒用他人姓名/學號加入（`index.ts:381-392` 只有 `unique(class_id, student_id)` 擋重複）。README 已聲明名單僅代表已加入者，屬已知取捨。

---

## 做對了的部分

`index.ts:477-491` 逐欄位驗證真實 WAV 標頭並用 `data chunk size === bytes.length - 44` 鎖死長度，是本專案最好的一段；`index.ts:498-511` 的 claim-then-process 加上失敗即刪檔、`index.ts:331-342` 用 `submitted_at` 當 CAS 條件防重複重試、`schema.sql` 的 `ts_one_active` 部分唯一索引搭配 `ts_open_question` 的 `for update`、以及 `state` 只回傳 `id,mode,prompt,status,position`（不含 rubric）——這幾處的隔離與競態處理都正確。

修 P0-1 與 P0-2 之後，這個工具可以進真實課堂；P1-3、P1-4、P1-8 建議在第一次上課前處理完。