**結論:發現 2 個具體問題(皆在所提修正範圍內),另有已驗證通過的部分。**

## 問題

**1. `onstop` 的 catch 在已進入上傳後仍會呼叫 `onCaptureFailed`(src/main.tsx 1519–1538)**
- `upload()` 內部已自行 catch,所以上傳失敗不會往外拋。
- 但 `await upload(saved)` / `await upload(audio)` 之後,`upload` 內的 `await onSubmitted()` 仍在 try 內,若它拋錯,會落入 `upload` 自己的 catch,並把 phase 設為 "retry"。這部分是安全的。
- 真正的風險是 `saveRecording`、`setPending` 之後若 `audioDigest(wav)` 之外的步驟拋錯。例如短答題的 `btoa` 或 `sessionStorage` 若拋出非預期錯誤,錄音已存在 pending,卻被當成擷取失敗,將 phase 設為 "idle" 並釋放題目。
- 對 120 秒題,`digest` 計算發生在 `setPending` 之前,所以風險有限。
- 對短答題,`setPending(audio)` 之後若 `upload` 以外的步驟拋錯,pending 會與 "idle" 狀態並存。建議只在 `wav` 轉換與長度檢查失敗時呼叫 `onCaptureFailed`,其餘錯誤進入 retry。
- 嚴重度:低。

**2. `rec.onerror` 之後的 `onstop` 與 `captureFailed` 競態(src/main.tsx 1486–1495)**
- `onerror` 沒有停止 recorder。MediaRecorder 規範在錯誤後通常會自行觸發 stop,此時 `captureFailed` 擋住後續處理,這是對的。
- 但若瀏覽器在 `onerror` 後不觸發 `onstop`,`rec.state` 可能仍是 "recording"。`onerror` 只清除 timer 並停止 tracks,沒有保證狀態收斂,元件卸載時的 cleanup 也不會處理 inactive 以外的情況。
- 實務上,tracks 都已停止,影響是 UI 已回 idle,風險很小。
- 嚴重度:低。

## 已驗證沒問題

- **delete_class**:`ts_prepare_class_delete` 在單一 plpgsql 函式交易內,`raise exception` 會回滾先前的 ended、closed、failed 更新。service_role 限定與 revoke 正確。
- **內容摘要**:已接受回應 (`r.status !== "recording"`)、`upload_ticket` 已存在檔案、`submit_saved` 三條路徑皆經 `verifyContent`。不一致時拒絕,本機保留。
- **IDB 鍵**:含 digest,同版本兩份 blob 互不覆蓋。`loadRecording` 接受長度 4 或 5,`deleteRecording` 以含 digest 的 key 精準刪除。

## 限制

- 我只看到摘錄,沒有執行測試,也沒看到 `matchVersion`、`recordingVersion` 與測試檔本身。
- `loadRecording` 在同版本有兩份 blob 時,以 `matches.at(-1)` 挑選,順序取決於 key 排序而非建立時間。這是行為上的不確定性,但不會造成資料遺失。