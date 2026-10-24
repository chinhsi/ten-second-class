# Sonnet 錄音恢復審查與裁決 — 2026-10-24

基線677b5cb。本次使用OpenRouter anthropic/claude-sonnet-5.5，Anthropic端點、第二key、固定openrouter-task.py、累計上限USD1。沒有傳入先前Gemini結論。原始來源、request SHA與逐次回覆保存在本資料夾。

## 費用與交付
- initial medium：USD0.163464，10000全為推理，content空，length，未交付。
- direct 關推理：mandatory模型拒絕；共用入口當時未保留HTTP狀態，因此沒有聲稱拿到逐筆拒絕帳單。兩次UTC日總額與所有已知同key費用精確對帳，差額零，人工記零；保留鎖及原錯誤，不改其他任務。
- low 全流程：USD0.223464，三項完整發現但末尾截斷，整份報告未完成。
- verification：USD0.037946，11.7秒，stop且正文完整；request gen-1792815221-dtAFxCcCmnZdpTsQ1uuI，13023輸入／1190輸出。此輪只複核三項修正，不代表全專案審查。
- **合計USD0.424874，剩餘USD0.575126；不再追加付費呼叫。**

## 原發現與實作
1. 錄音太短／麥克風失敗會留下pinned question：確認。新增onCaptureFailed釋放選題，錯誤後忽略stop事件。真實Recorder元件無瀏覽器測試涵蓋兩種錯誤。
2. delete_class在busy拒絕前取消recording：確認。改服務角色專用SQL交易，busy時整筆rollback，保留課堂、題目和錄音狀態。後端P0001轉安全明確提示；第一輪驗收因泛用錯誤提示不符而中止，已保留失敗紀錄並清除測試fixture。
3. 兩分頁共用版本卻錄不同內容被靜默接受：確認。新客戶端送SHA256；後端在既有上傳、提交和已收件三條路徑驗證內容。IDB鍵含digest，刪一份不影響另一份；已收件但本機仍有待核內容時仍提供恢復入口。rolling部署舊客戶端可不帶digest，新頁面必帶，使用前重新整理。

## 完整複核的兩項疑慮
- 「setPending後btoa/sessionStorage錯誤觸發onCaptureFailed」：不採納。btoa實際在setPending之前；sessionStorage有局部catch；upload自行catch全部提交與onSubmitted錯誤，不往外拋。模型本身也指出upload不外拋，未提供剩餘可觸發路徑。
- 「rec.onerror後cleanup不處理recording」：不採納。cleanup明確在state===recording呼叫stop並停止tracks；onerror立即停止tracks、清timer、釋放題目，captureFailed阻擋後續stop事件處理。真實元件測試包含error後stop，未確認資源仍持續錄製的路徑。

## 驗證範圍
本機TypeScript/build、IDB、真實React Recorder無瀏覽器回歸；正式後端使用隔離靜音檔驗證，結果見live-verification.json。不啟動Chrome、不重跑付費轉寫。不是實體手機／現場Wi-Fi／自然三語準確率驗證。同版本多份本機殘留仍按鍵序逐份清理，沒有聲稱按時間排序。

## 共用制度
共用入口新增能力相容性及HTTP status/request header保存；沿用新delivery_plan/recovery防重送檢查與17項離線測試。SOP新增完整停用範例、總輸出與推理額度區別、間接帳務證據限制，以及縮小完整流程而非盲砍token的規則。
