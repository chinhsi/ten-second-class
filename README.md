# 十秒課堂

一個給課堂用的限時錄音工具。學生掃碼加入，說一句話；老師即時查看全班回應與誰尚未提交。

**網站：https://chinhsi.github.io/ten-second-class/**

## 老師怎麼用

1. 用原本的 InterAct 管理密碼進入老師工作台。
2. 建立課堂，預先存好題目。選「概念作答」時填問題及答案要點；選「朗讀發音」時填句子及目標語言／發音重點。評分要點不會顯示給學生。
3. 分享 QR code 或加入連結。學生可先進入等待，不必安裝 App。
4. 上課按 **啟用課堂（Enable class）**，再按題目旁的「開放」。
5. 看即時回應、分數和回饋；可播放錄音、篩選未答學生、下載中文 CSV 紀錄。
6. 「收題」停止接受新的錄音；已經開始的錄音可完成上傳。「結束課堂」停止開新錄音。

## 學生怎麼用

掃碼 → 填姓名與學號 → 等老師開題 → 按開始錄音 → 說一句話。

**每次最多 10 秒，時間到自動停止並送出，也可提前送出。** 錄音只交給老師與 AI 評測，學生只能看自己的回饋。每題一次；上傳失敗可重送同一段錄音，不會重複計分。保持原本的瀏覽器，重新開頁仍能回到同一身分。

## 評分與邊界

- 發音：看指定文本的讀音、漏讀與流暢度。
- 作答：看是否符合答案要點，接受同義表達，不因口音扣分。
- 0–5 分、一句建議及原話轉寫；無聲或聽不清楚標為「無法判讀」，不給零分。
- AI 是形成性評量的初步回饋，教師可聽原錄音覆核。這不是經校準的標準化發音測驗。
- 名單以已掃碼加入的人為準；第一版沒有匯入修課名單，因此不知道誰尚未進入網站。
- 每人有完整 10 秒錄音，沒有全班共用倒數。上傳可在開始錄音後 120 秒內重試。
- 第一版採定時更新：學生約 3 秒、老師約 4 秒刷新。AI 完成時間視供應商而定。AI 失敗仍保留錄音，老師可重試評分。
- 目前已驗證 Chrome 桌面及模擬手機視窗；真實 iPhone／Android 麥克風權限及全班同時提交仍需課前試用。

## 開發與部署

本機 `npm ci`、`npm run dev`；建置 `npm run build`。

GitHub Actions 在推送 main 後自動部署 GitHub Pages。Supabase 使用現有 InterAct 專案中的獨立 `ts_*` 資料表與 `ten-second-audio` 私有儲存空間；沒有變更原本 InterAct 資料表。

```sh
supabase db query --linked --project-ref YOUR_PROJECT_REF --file supabase/schema.sql
supabase functions deploy ten-second --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

Edge Function 使用 Supabase 的服務端金鑰、`INTERACT_OWNER_KEY` 和 `GEMINI_API_KEY`；均不可放進前端或 GitHub。`TEN_SECOND_MODEL` 可指定 Gemini 模型。前端只包含公開的後端網址。

所有資料表啟用 RLS 並撤銷匿名／一般登入角色的直接存取；Edge Function 驗證教師密碼或學生隨機憑證。錄音私有，老師取得的播放連結 120 秒後失效。伺服器檢查實際 WAV 的格式及長度，不信任客戶端秒數。沒有自動到期刪除錄音，正式收集前應由老師決定保存期限。

## 驗證

- `npm test`：Chrome 瀏覽器測試（需先 `npm run dev -- --port 5179`）。含課前雙模式備題、啟用課堂、10 秒自動停止和 WAV 上限。
- `python3 scripts/verify-live.py`：有副作用的線上整合驗證，只限部署者執行。從 macOS Keychain 讀取教師密碼，建立測試課堂、使用三段合成／靜音錄音，會呼叫 AI；不顯示金鑰。
- AI 介面依據 [Gemini 結構化輸出文件](https://ai.google.dev/gemini-api/docs/generate-content/structured-output)；音訊處理依據 [音訊理解文件](https://ai.google.dev/gemini-api/docs/audio)。

## 來源與授權

錄音轉 WAV 程式改編自 [Yujen Lien 的 InterAct](https://github.com/lienyujen/InterAct)。本專案保留其 Required Notice，採用隨附的 [PolyForm Noncommercial 授權](LICENSE)。其餘課堂介面及獨立後端為本專案實作。
