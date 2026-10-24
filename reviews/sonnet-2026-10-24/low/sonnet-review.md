# 獨立程式碼審查報告（commit 677b5cb）

**結論：** 確認 3 項問題，全為中低嚴重度。沒有發現已確認的「長錄音檔案遺失」或「舊版本被接受」路徑。

## 已確認問題

### 1. [中] 錄音失敗後 `recordingQuestion` 不清除，學生卡在已關閉的舊題
- **位置：** `main.tsx` 1250（`onRecording` 設定）；只有 1252–1260 的 `onDiscard` / `onSubmitted` 會清除。失敗路徑 1478–1483（`rec.onerror`）和 1523–1526（`onstop` catch，例如 1492 的「太短」）只把 phase 設回 `idle`。`recordingSelection.ts:8` 讓 `recordingQuestion` 優先於其他所有選項。
- **事件序列：**
  1. 學生按開始，`start` 成功，`rec.start()` 後呼叫 `onRecording()`，`recordingQuestion = Q1`。
  2. 學生太早停止（WAV 小於 8044 bytes）或麥克風出錯，phase 回到 `idle`。
  3. 老師關閉 Q1 並開啟 Q2。
  4. `selectRecordingQuestion` 仍回傳 Q1。再按錄音時，`index.ts:824` 回「老師尚未開放這一題」。
  5. 學生看不到 Q2，直到整頁重新載入。
- **已考慮的防護：** 輪詢會更新 `state`，但選題函式不會忽略 `recordingQuestion`。重新載入可恢復，所以不會遺失資料。但 10/20 秒題在課堂中會錯過整題。
- **最小修正：** `Recorder` 新增 `onIdle` callback，在 1478 和 1523 的失敗分支呼叫 `setRecordingQuestion(null)`。另一個做法是 selection 在 `recordingQuestion.status !== 'active'`、沒有本機暫存、且不在 recording 階段時忽略它。
- **回歸測試：** 對 `selectRecordingQuestion` 做單元測試：`recordingQuestion` 已關閉、無暫存、無已提交回應時，回傳 Q2。再加元件測試：太短錄音後，Q2 開啟時 UI 切到 Q2。

### 2. [中低] `delete_class` 在確認能刪除前，就把未提交錄音改成 failed
- **位置：** `index.ts` 318–353。先把課堂設為 ended、題目設為 closed，並把 `recording` 回應改為 `failed`（331–340）。之後才檢查是否仍有 `queued` / `processing`，有則丟錯（351–352）。
- **事件序列：**
  1. 老師按刪除課堂；有一筆長錄音仍在處理。
  2. 學生 B 剛錄完 120 秒，音檔在 IndexedDB，還沒呼叫 `submit_saved`。
  3. 伺服器先把 B 的回應改為 `failed`（path 為 null），再因處理中的錄音回傳「請待評分完成後再刪除」。課堂沒被刪除。
  4. B 的 `upload_ticket` / `submit_saved` 走到 `index.ts:951`，回「錄音已取消」。本機音檔無法再提交，只能捨棄。
- **已考慮的防護：** 刪除失敗後學生仍可 `discard_recording`，但 `r.status !== "recording"` 已回 409 ALREADY_RECEIVED，無法恢復提交。老師重試刪除也不會還原這筆狀態。
- **最小修正：** 先查 `queued` / `processing`，有就直接回錯，不做任何破壞性更新。通過後再把課堂設為 ended 並取消 recording 回應。更好的做法是放進單一 SQL RPC 交易。
- **回歸測試：** 資料庫整合測試：一筆 `processing` 加一筆 `recording`，呼叫 `delete_class` 回錯後，`recording` 那筆仍可 `submit_saved`。

### 3. [低] 兩分頁共用同一 recording_version，第二份音檔被靜默當成已送出
- **位置：** `index.ts` 836–850（`start` 對舊 row 回傳同一版本）、959–968（`upload_ticket` 檔案存在即回 `uploaded`）；`main.tsx` 1412–1428（PUT 409/400 視為成功，且完成後刪除本機檔）；`recordingStore.ts:9-10`（key 只含 responseId 與 version）。
- **事件序列：**
  1. 同一學生用兩個分頁，兩者都閒置，各自呼叫 `start`，取得同一個 `vA`。
  2. 分頁 1 錄 blob1 並上傳、`submit_saved`，伺服器接受 blob1。
  3. 分頁 2 錄 blob2（可能是較好的版本）。`upload_ticket` 見檔案已存在；或 PUT 回 409。
  4. 接著 `submit_saved` 回 `received:true`，分頁 2 刪除 blob2 並顯示「已收到」。實際評分的是 blob1。
- **已考慮的防護：** 檔名不可覆寫，避免了覆蓋。IndexedDB key 在兩分頁同版本時也會互相覆蓋。伺服器 CAS 只綁版本，不綁內容。
- **影響：** 只影響同一學生自己的兩次錄音，不是跨學生資料外洩。但第二份音檔會被丟棄而不通知。
- **最小修正：** `submit_saved` 與 `upload_ticket` 加送 blob 的 SHA-256。伺服器驗證下載檔雜湊，不符就回 STALE/CONFLICT，讓客戶端保留本機檔並提示。另可用 `navigator.locks` 對 `scope+questionId` 加鎖，避免兩分頁同時錄音。
- **回歸測試：** 兩個 blob 用同一版本，先後提交。第二次必須回衝突，且本機檔不得被刪。

## 已檢查、未發現問題的路徑
- **ACK 遺失：** 長錄音 PUT、`submit_saved` 與