# Sonnet 精簡複核 — 2026-10-24

**確認缺陷：1 項。** 第 (2)、(3) 項經檢查未發現確認缺陷。

## 缺陷 1：收件後 refresh 失敗，父層仍卡在原題，沒有解除釘選

**位置：** `src/main.tsx` 1259–1262 的 `onSubmitted`，另有 1253–1258 的 `onDiscard`；refresh 在 1135–1154。

**交錯情境：**
1. 學生上傳成功，`submit_saved` 成功，`upload()` 在第 1437 行設 `phase="sent"`。
2. 第 1443 行呼叫 `onSubmitted`，其中 `await refresh()` 因離線或 `call("state")` 失敗而 throw。
3. 第 1261 行的 `setRecordingQuestion(null)` 被跳過。
4. Recorder 的 catch（1444–1448）只顯示「已收件」，不會通知父層解除釘選。
5. `refresh` 不會清除 `recordingQuestion`，所以之後輪詢成功也無法解除。

**影響：**
- 錄音雖已收件，學生仍被釘在原題。
- 老師開下一題時，學生可能看不到。
- 實際上只有重新整理頁面才能解除。
- 本機錄音已刪除，所以使用者也無法從畫面自行補救。

**既有防護為何無效：**
- 新的修正只保證 Recorder 內顯示「已收件」，沒有處理父層的釘選狀態。
- 測試 `test-recorder-lifecycle` 的 `onSubmitted` 是自製 stub，沒有涵蓋父層 `setRecordingQuestion` 的行為。
- `onDiscard` 有同樣的順序問題。refresh 失敗後，`setRecordingQuestion(null)` 與 `setState` 都不會執行。

**限制：** 這個判斷只依據所提供的程式片段。未提供的程式碼若另有解除釘選的路徑，請再核對。

**最小修正：** 先解除釘選，再嘗試 refresh，並讓 refresh 的錯誤仍向上傳。

```ts
onSubmitted={async () => {
  setRecordingQuestion(null);
  await refresh();
}}
```

`onDiscard` 同理，用 `try { await refresh(); } finally { setRecordingQuestion(null); setState(c=>({...c})); }`。

## (2) 刪課準備與並行 start INSERT：無確認缺陷

我逐一推演了兩個方向的交錯。

**INSERT 先取得鎖：**
- trigger 持有 class 的 SHARE 鎖。
- `ts_prepare_class_delete` 第 8 行的 UPDATE 會等到 INSERT 提交。
- 之後第 11–12 行的新語句快照會看到該 recording 列並取消它，或在第 13 行把它偵測為處理中。

**prepare 先取得鎖：**
- INSERT 的 trigger 會卡在 class 的 `FOR SHARE`。
- 在 READ COMMITTED 下，鎖釋放後會重新檢查更新後的列，讀到 `ended`，因此 raise。

**鎖順序與死結：**
- 兩邊都是 class → question。
- INSERT 之後的 FK 檢查才對 question 取 KEY SHARE，這與 prepare 的順序不衝突，沒有環。

## (3) 儲存 offset 位移與有界重掃：無確認缺陷

- 每次 `collect` 完整結束後才刪除。
- 位移造成的漏列會在下一輪從 0 重掃時補上。
- 第 5 輪仍有檔案時，會在刪除 metadata 前丟錯，不會留下孤兒 metadata 而被誤判為已清完。
- 這是設計上的有界失敗，不是缺陷。
- 簽名 URL 造成的晚到孤兒檔屬已知限制，我未重複列為新缺陷。

## 主控核對

確認一項缺陷：src/main.tsx 的 onSubmitted／onDiscard 在 await refresh() 後才解除 recordingQuestion；refresh 失敗會跳過解除。src/recordingSelection.ts 優先回傳 recordingQuestion，因此後續輪詢即使成功並取得新題也仍選舊題。已核對所有 setRecordingQuestion 呼叫，未見輪詢解除路徑。此輪只複核，尚未修改或部署修正。

另兩項無新增確認缺陷；不代表已做真實雙交易競態測試或全專案安全驗證。

## 執行證據

固定 openrouter-task.py 入口，原 post-gemini 請求，無新增批准提示，單次送出、無重試。
- 模型：anthropic/claude-sonnet-5.5
- Request ID：gen-1792825205-QIRoPwrm6nWrVeZhhKrz
- finish_reason：stop；正文完整
- 本次費用：US$0.047186；歷史累計 US$0.472060
- Request SHA256：101c3e6c24cc9238cde549c94e7baf961e931d6f46fba3814885cd6a6a2020ef
- Source SHA256：5e260c166ce2b1e80340f3f7758f52d0e8a291afa41395b84ffdf3f09c468837
- 原始回覆、端點快照及單次鎖保留於本目錄。

## 修正與驗收

使用者授權修正後，onSubmitted 在 finally 解除釘選；onDiscard 亦在 finally 解除並重新渲染，refresh 失敗只顯示課堂更新提示，不回拋成已捨棄錄音的上傳重試。新增真實 Student 元件回歸，涵蓋收件／捨棄、更新成功／失敗，以及老師換題是否已經輪詢到兩種時序；舊版先重現失敗，修正後通過。既有 Recorder lifecycle、IndexedDB recording recovery 與 TypeScript／正式 build 通過。沒有使用瀏覽器或追加付費審查。
