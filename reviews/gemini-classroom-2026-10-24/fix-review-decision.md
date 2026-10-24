# 2026-10-24 修正複核

模型 gemini-4-argon-low，effort low，本機 AGY；conversation b73dbbff-3a0f-40a6-91f2-bb1d66e34acd，SUCCESS／完整非空報告。

輸入 SHA256：9a18911a1e308f528c8ed3931961bd169a36412daaf3d07cff46a9538b1ae2fa

1. 舊版本 fallback：保留可見清理入口。正式 UI 傳入伺服器版本並優先選取；找不到時顯示殘留錄音供捨棄。不可直接隱藏，否則 pendingIds 會持續選中該題但無法清理。舊版本由後端拒收；持久 discard intent 禁止上傳。多份殘留時清理順序非時間順序屬已知 UX 限制，並非舊錄音可提交。
2. 並行相同 discard：採納，CAS 未更新後重讀版本，相同 nextVersion 回成功。
3. 清理重試：採納，已完成 rotation 的重試也再次清理舊檔。舊 signed PUT 仍可能在清理後產生私有孤檔，不能提交，刪除整堂時清除。

此複核涵蓋所附後端與儲存選題片段，不代表瀏覽器／所有 UI 已測試。
