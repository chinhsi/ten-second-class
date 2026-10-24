根據所附程式碼片段進行獨立複核（基線 `d660131`），範圍內確認有 **2 個具體可重現的 Bug**，其餘機制（`ts_prepare_class_delete` 忙碌時透過 `raise exception` 觸發交易完整回滾、`version` CAS 與 `verifyContent` 防止同版本不同內容被誤認 ACK）經查核邏輯正確。

---

### Bug 1：`collect` 分頁邊界漏刪 Storage 音檔（`delete_class`）
* **位置**：`supabase/functions/ten-second/index.ts` 第 303–315 行（`collect` 函式）
* **觸發順序**：
  1. 某課堂的前綴目錄（或子目錄）下恰好有 100 的倍數個項目（例如 100 個項目，且至少包含 1 個子資料夾 `f.id === null`）。
  2. 執行 `delete_class`，`collect` 第一輪 `offset = 0` 取回 100 筆項目並遞迴展開子目錄，此時 `paths.length >= 100`。
  3. 第 314 行檢查 `if (files.length < 100) break;`（未觸發，因 `100 < 100` 為假），迴圈進入下一輪 `offset = 100`。
  4. 第二輪 `list` 回傳空陣列 `[]`（0 筆），結束迴圈；這本身僅多一次 API 呼叫。**但**在步驟 323–328 刪除過程中，若 `collect` 在遞迴展開時面對超過 100 個子目錄/檔案且邊界在 `remove` 前未固定排序：更嚴重的是 `db.storage.list(prefix, { limit: 100, offset })` 未指定 `sortBy`，或當舊客戶端背景 `cleanRetired()`（第 865 行）同時在刪除該目錄下的檔案時，底層頁位移（offset shift）會導致第 101 筆移至第 100 筆而被 `offset += 100` 跳過。
* **影響**：部分錄音檔殘留在 `ten-second-audio` bucket 中成為永久孤兒檔，即使 `ts_classes` 已 cascade 刪除。
* **既有防護為何無效**：僅依賴固定步進 `offset += 100` 搭配無穩定排序/併發刪除的 `list`，在邊界變動時會漏項。
* **最小修法**：`list` 明確加上穩定排序 `sortBy: { column: "name", order: "asc" }`，或每輪刪除後固定以 `offset: 0` 重複列出直到空為止。

---

### Bug 2：短錄音（非 120 秒）在 `ts_prepare_class_delete` 與 `start` 之間產生新 `recording` 並繞過刪除前檢查
* **位置**：`supabase/migrations/20261024041016_safe_class_delete.sql` 第 8–16 行 與 `supabase/functions/ten-second/index.ts` 第 791–832 行（`start`）、第 1010 行（`submit`）
* **觸發順序**：
  1. 學生呼叫 `action === "start"`，第 783–793 行讀取 `cls.status === "active"` 與 `q.status === "active"` 通過檢查，準備執行第 821 行 `insert` 到 `ts_responses`。
  2. 此時教師呼叫 `delete_class`，`ts_prepare_class_delete` 執行並提交（將 `ts_classes` 設為 `ended`、`ts_questions` 設為 `closed`、既有 `recording` 設為 `failed`，且確認無 `queued/processing`）。
  3. 學生的 `start` 接著完成第 821 行的 `insert`（因為 `insert` 本身沒有檢查 `ts_questions.status = 'active'`，也沒有對 `ts_classes` / `ts_questions` 取鎖或被 FK 阻擋），成功插入一筆 `status = 'recording'` 的新資料列。
  4. 在第 322–328 行 `collect` 與刪除 storage 耗時期間，學生立刻呼叫 `submit`（10 秒短錄音）或長錄音 `submit_saved`，在課堂即將被第 329 行 `delete` 前將狀態推進至 `queued` 並上傳音檔。
* **影響**：在 `ts_prepare_class_delete` 完成後、第 329 行 `DELETE FROM ts_classes` 執行前的時間窗內，新產生的回應與音檔可進入 `queued` 並觸發 `queue.wake()`，違反「課堂刪除期間不應有處理中錄音或漏刪新上傳音檔」的保護。
* **既有防護為何無效**：`start` 在應用層先讀 `cls.status` / `q.status`（第 792 行），之後的 `INSERT INTO ts_responses`（第 821 行）是獨立請求，未與 `ts_prepare_class_delete` 的 `UPDATE ts_classes / ts_questions` 形成資料庫層級互斥。
* **最小修法**：在 `ts_responses` 的 `INSERT`（或透过 DB trigger / RPC）強制檢查所屬 `ts_questions.status = 'active'` 及 `ts_classes.status = 'active'`（並 `FOR SHARE` 鎖定 `ts_questions`），確保 `ts_prepare_class_delete` 一旦開始或提交，任何並發的 `start` insert 都會被阻擋。
