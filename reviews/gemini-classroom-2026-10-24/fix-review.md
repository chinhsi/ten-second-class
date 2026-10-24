Here are 3 concrete correctness bugs found in the snippet:

### 1. `loadRecording` selects arbitrary stale blobs when `preferredVersion` is not found or omitted
* **Trigger:** Because the IndexedDB key (`[scope, id, responseId, version]`) includes `version` (a random UUID), multiple entries for the same `(scope, id)` can coexist in the store (e.g., if a previous tab or failed cleanup left an older version's blob, or during multi-tab/retry races). `getAllKeys()` returns keys in **lexicographical order** of their JSON strings—meaning they are ordered by random UUID (`responseId`, then `version`), not chronologically.
  1. If `preferredVersion` is omitted (`undefined`), `JSON.parse(String(k))[3] === undefined` is always `false` (since `null` or string UUIDs never equal `undefined`), so it falls back to `matches.at(-1)`, picking whichever recording has the lexicographically largest UUID.
  2. If the server already rotated `recording_version` to `nextVersion` on a prior discard attempt before the client deleted the local blob (or in another tab), `preferredVersion` (the server's new version) won't match `k[3]` (the old version), and `matches.at(-1)` will load the stale/discarded recording instead of returning `undefined` or matching `nextVersion`.
* **Fix:** Match against `nextVersion` as well when recovering a pending discard, or do not fall back to an arbitrary `.at(-1)` key when an explicit `preferredVersion` was requested and not found (or delete prior versions for the same `[scope, id]` upon saving/discarding).
  ```ts
  const selected =
    preferredVersion !== undefined
      ? matches.find((k) => JSON.parse(String(k))[3] === preferredVersion)
      : matches.at(-1);
  ```
  *(And if recovering an interrupted discard where the server already rotated to `nextVersion`, check `current.nextVersion === preferredVersion` on the loaded record or clean up old keys under `[scope, id]` when writing a new one.)*

---

### 2. Concurrent `discard_recording` race returns `409 STALE_RECORDING` instead of idempotent success

<truncated 400 bytes>
ersion: next })` CAS and returns `{ discarded: true, version: next }`.
  3. Request B's `update` matches 0 rows (`!rotated.length`) and immediately returns `stale()` (`409 STALE_RECORDING`), even though the database is now at `next` (the exact state Request B wanted).
* **Fix:** When `!rotated.length`, re-query `r.recording_version` (just like the submission confirmation path does below it): if `current.recording_version === next`, return `reply({ discarded: true, version: next })`; if `current.status !== "recording"`, return `ALREADY_RECEIVED`; otherwise return `stale()`.
  ```ts
  if (!rotated.length) {
    const current = check(
      await db
        .from("ts_responses")
        .select("status,recording_version")
        .eq("id", r.id)
        .single(),
    );
    if (current.recording_version === next)
      return reply({ discarded: true, version: next });
    if (current.status !== "recording")
      return reply(
        { error: "錄音已收件，未捨棄；請查看處理結果。", code: "ALREADY_RECEIVED" },
        409,
      );
    return stale();
  }
  ```

---

### 3. Discard retry after the initial attempt's storage cleanup was dropped leaves orphaned audio in storage
* **Trigger:** On the first `discard_recording` request, the DB update rotating `recording_version` to `next` succeeds, and `EdgeRuntime.waitUntil(db.storage...remove(...))` is scheduled. If that storage removal fails (transient storage error or worker termination) or the client retries `discard_recording` after a network drop, the retry hits the early return:
  ```ts
  if (r.recording_version === next)
    return reply({ discarded: true, version: next });
  ```
  This skips the `db.storage.from("ten-second-audio").remove(...)` call completely, leaving the retired version's audio file in storage until class deletion.
* **Fix:** Also trigger the idempotent storage `.remove([`${cls.id}/${q.id}/${member.id}/${recordingFile(r.id, version)}`])` inside the `if (r.recording_version === next)` idempotent retry branch before returning.