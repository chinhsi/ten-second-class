# 全班摘要與答案展示驗證（2026-09-24）

## 已驗證

- `npm run build`：TypeScript與正式建置通過。
- `node --experimental-strip-types scripts/test-discussion.mjs`：統計分母、未交／失敗區分、不重複抽選、空範圍、AI引用ID與去重計數通過。
- `npx playwright test`：7/7通過（Chrome，沙盒外）。涵蓋雙模式備課、10秒錄音、混合狀態與CSV、斷線補交、捨棄錄音、自動摘要等候處理完成、只生成一次、遲交更新、匿名／具名展示、不重複抽選、Esc、停用評分及摘要重試。
- 目視摘要頁與大字展示畫面，確認選中答案之外沒有名單／學號／成績暴露。
- `supabase db query --linked --project-ref <ref> --file scripts/test-summary-lock.sql`：第一個請求可claim、同時與同版本請求不重複、完成後新版本可claim、anon無table讀取／RPC執行權限。測試交易最後rollback。
- 資料表及Edge Function部署成功。

## 尚未驗證

- 真實Gemini全班摘要：本機Keychain中的管理key失效，建立測試課時被拒絕，沒有產生AI呼叫或測試資料。`scripts/verify-summary.py`可用當前`INTERACT_OWNER_KEY`環境變數重跑；最多兩個摘要任務，包含計分中文／不計分英文、快取、登入隔離與最後清除。
- 真實全班並發、iPhone／Android麥克風，仍沿用既有待驗狀態。這次展示流程的Chrome測試不能代替它们。

## 限制與操作

- 全班以已掃碼加入的人數為準；未知未加入者不會阻擋自動摘要。
- 自動摘要須老師工作台開著，失敗可手動重試。
- 隨機抽選紀錄目前只保留當前題目頁面；重整／切題會重設，手選不受不重複限制。
- 匿名隱藏名字，不會刪除學生原話中的自我介紹；播放原音也可能辨認說話者。
- AI摘要不是校準過的評分；程式只核驗引用存在及人數，語意歸納仍須教師覆核。
