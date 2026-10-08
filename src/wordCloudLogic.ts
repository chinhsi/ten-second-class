import type { ResponseRow } from "./discussionLogic";
export type CloudWord = { text: string; count: number; responseIds: string[] };
// Only validated, contextual AI themes are visualized. Never fall back to raw tokens.
export function buildWordCloud(rows: ResponseRow[], result: any) {
  const valid = new Set(
    rows
      .filter(
        (r) =>
          r.status === "done" &&
          r.result?.level !== "unscorable" &&
          r.result?.transcript?.trim(),
      )
      .map((r) => r.id),
  );
  const words: CloudWord[] = [];
  if (result?.concept_version === 1 && Array.isArray(result.themes)) {
    for (const theme of result.themes) {
      if (
        typeof theme.title !== "string" ||
        !theme.title.trim() ||
        !Array.isArray(theme.response_ids)
      )
        continue;
      const responseIds = [
        ...new Set<string>(
          theme.response_ids.filter((id: string) => valid.has(id)),
        ),
      ];
      if (responseIds.length)
        words.push({
          text: theme.title.trim(),
          count: responseIds.length,
          responseIds,
        });
    }
  }
  words.sort((a, b) => b.count - a.count);
  return {
    words,
    responses: new Set<string>(
      (result?.response_ids || []).filter((id: string) => valid.has(id)),
    ).size,
  };
}
