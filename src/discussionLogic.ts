export type ResponseRow = {
  id: string;
  member_id: string;
  question_id?: string;
  status: string;
  path?: string;
  result?: {
    level?: string;
    score?: number | null;
    transcript?: string;
    feedback?: string;
    issue?: string;
  };
};
export function responseStats(responses: ResponseRow[], total: number) {
  const submitted = responses.filter(
    (r) => r.status !== "recording" && (r.status !== "failed" || !!r.path),
  );
  const done = submitted.filter((r) => r.status === "done");
  const assessed = done.filter((r) =>
    ["understood", "partial", "not_yet"].includes(r.result?.level || ""),
  );
  const understood = assessed.filter(
    (r) => r.result?.level === "understood",
  ).length;
  return {
    total,
    submitted: submitted.length,
    missing: Math.max(0, total - submitted.length),
    processing: submitted.filter((r) => r.status === "processing").length,
    failed: submitted.filter((r) => r.status === "failed").length,
    unscorable: done.filter((r) => r.result?.level === "unscorable").length,
    transcribed: done.filter((r) => r.result?.level === "transcribed").length,
    assessed: assessed.length,
    understood,
    partial: assessed.filter((r) => r.result?.level === "partial").length,
    notYet: assessed.filter((r) => r.result?.level === "not_yet").length,
    percent: assessed.length
      ? Math.round((understood / assessed.length) * 100)
      : null,
    settled:
      submitted.length > 0 &&
      submitted.every((r) => ["done", "failed"].includes(r.status)),
  };
}
export function discussionCandidates(
  responses: ResponseRow[],
  filter: string,
  seen: string[] = [],
  noRepeat = true,
) {
  return responses.filter(
    (r) =>
      r.status === "done" &&
      r.result?.transcript?.trim() &&
      (filter === "all" ||
        (filter === "followup"
          ? ["partial", "not_yet"].includes(r.result?.level || "")
          : r.result?.level === filter)) &&
      (!noRepeat || !seen.includes(r.id)),
  );
}
export function pickRandom<T>(items: T[], random = Math.random): T | undefined {
  return items.length
    ? items[Math.min(items.length - 1, Math.floor(random() * items.length))]
    : undefined;
}
