// Scope to classroom + browser student identity. Never infer ownership of old,
// unscoped blobs created by an earlier app version.
export type SavedRecording = {
  blob: Blob;
  version: string | null;
  responseId: string;
  nextVersion?: string;
};
const key = (scope: string, id: string, value: SavedRecording) =>
  JSON.stringify([scope, id, value.responseId, value.version]);
const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open("ten-second-recordings", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("pending");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error("請關閉其他舊版課堂分頁後重試"));
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
export const saveRecording = (
  scope: string,
  id: string,
  value: SavedRecording,
) => transact("readwrite", (s) => s.put(value, key(scope, id, value)));
export async function loadRecording(
  scope: string,
  id: string,
  preferredVersion?: string | null,
): Promise<SavedRecording | undefined> {
  const keys = await transact("readonly", (s) => s.getAllKeys());
  const matches = keys.filter((k) => {
    try {
      const p = JSON.parse(String(k));
      return (
        Array.isArray(p) && p.length === 4 && p[0] === scope && p[1] === id
      );
    } catch {
      return false;
    }
  });
  const selected =
    matches.find((k) => JSON.parse(String(k))[3] === preferredVersion) ??
    matches.at(-1);
  return selected === undefined
    ? undefined
    : transact("readonly", (s) => s.get(selected));
}
export async function pendingRecordings(scope: string): Promise<string[]> {
  const keys = await transact("readonly", (s) => s.getAllKeys());
  return keys.flatMap((k) => {
    try {
      const pair = JSON.parse(String(k));
      return Array.isArray(pair) &&
        pair.length === 4 &&
        pair[0] === scope &&
        typeof pair[1] === "string"
        ? [pair[1]]
        : [];
    } catch {
      return [];
    }
  });
}
// A late acknowledgement from another tab must not erase a newer recording.
export async function deleteRecording(
  scope: string,
  id: string,
  expected: SavedRecording,
): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("pending", "readwrite");
    const s = tx.objectStore("pending");
    const r = s.get(key(scope, id, expected));
    r.onsuccess = () => {
      const current = r.result as SavedRecording | undefined;
      if (
        current?.version === expected.version &&
        current?.responseId === expected.responseId
      )
        s.delete(key(scope, id, expected));
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error);
    };
  });
}
