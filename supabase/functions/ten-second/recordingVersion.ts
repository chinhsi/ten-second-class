export function recordingVersion(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    return value.toLowerCase();
  throw Error(
    "錄音版本無效，請重新整理頁面 / Refresh this page to update recording support",
  );
}
export function recordingFile(id: string, version: string | null) {
  return `${id}${version ? `-${version}` : ""}.wav`;
}
export function matchVersion(query: any, version: string | null) {
  return version === null
    ? query.is("recording_version", null)
    : query.eq("recording_version", version);
}
