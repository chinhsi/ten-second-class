// Binary recordings belong in IndexedDB, not the ~5 MB Web Storage quota.
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("ten-second-recordings", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("pending");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
async function transact<T>(
  mode: IDBTransactionMode,
  operation: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending", mode);
    const request = operation(tx.objectStore("pending"));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error || request.error);
    };
  });
}
export const saveRecording = (id: string, blob: Blob) =>
  transact("readwrite", (s) => s.put(blob, id));
export const loadRecording = (id: string) =>
  transact<Blob | undefined>("readonly", (s) => s.get(id));
export const deleteRecording = (id: string) =>
  transact("readwrite", (s) => s.delete(id));
