import type { ResponseRow } from "./discussionLogic";
export type CloudWord = { text: string; count: number; responseIds: string[] };
const stop = new Set(
  `a an the and or but so because of to in on at for from with as by is am are was were be been being it its this that these those i me my we our you your he she they them their have has had do does did can could will would should may might must not no yes very really just also more most some all any about into how what which who when where why then than uh um oh well own think learned learn learning today class lesson use using used useful
的 了 到了 是 在 和 與 与 及 或 也 都 就 很 更 最 有 沒有 没有 不 沒 没 我 我們 我们 你 你們 你们 他 她 他們 他们 它 自己 一個 一个 這 这 那 這個 这个 那個 那个 這些 这些 那些 可以 可能 能 會 会 要 去 來 来 讓 让 被 把 對 对 從 从 因為 因为 所以 但是 然後 然后 如果 雖然 虽然 還 还 已經 已经 就是 其實 其实 覺得 觉得 知道 學到 学到 學到了 学到了 學習 学习 今天 今晚 晚上 這次 这次 這節 这节 課 课 課堂 课堂 收穫 收获 最大 最大的 最有 比較 比较 非常 真的 什麼 什么 怎麼 怎么 如何 進行 进行 使用 用 一些 一點 一点 一下 一種 一种 方面 東西 东西 嗯 啊 呃 哦 咁 嘅 喺 係 啲 嘢 唔 我哋 佢 佢哋 呢 即係 多謝 謝謝 谢谢 拜拜`.split(
    /\s+/,
  ),
);
const segmenter = new Intl.Segmenter("zh-Hant", { granularity: "word" });
const phrases =
  /\b(google\s+sheets?|google\s+docs|google\s+forms|generative\s+ai)\b/gi;
function words(text: string): string[] {
  return text
    .normalize("NFKC")
    .split(phrases)
    .flatMap((part, i) => {
      if (i % 2)
        return [
          part
            .toLowerCase()
            .replace(/\s+/g, " ")
            .replace(/^google sheets?$/, "google sheets"),
        ];
      return Array.from(segmenter.segment(part), (x) =>
        x.isWordLike ? x.segment.toLowerCase() : "",
      );
    })
    .filter(
      (x) =>
        !stop.has(x) &&
        /\p{L}/u.test(x) &&
        [...x].length >= 2 &&
        [...x].length <= 32,
    );
}
export function buildWordCloud(rows: ResponseRow[]) {
  const terms = new Map<string, Set<string>>();
  const included = new Set<string>();
  for (const row of rows) {
    if (
      row.status !== "done" ||
      row.result?.level === "unscorable" ||
      !row.result?.transcript?.trim() ||
      included.has(row.id)
    )
      continue;
    included.add(row.id);
    for (const word of new Set(words(row.result.transcript))) {
      if (!terms.has(word)) terms.set(word, new Set());
      terms.get(word)!.add(row.id);
    }
  }
  const labels: Record<string, string> = {
    ai: "AI",
    "google sheets": "Google Sheets",
    "google docs": "Google Docs",
    "google forms": "Google Forms",
    chatgpt: "ChatGPT",
    gemini: "Gemini",
  };
  const all: CloudWord[] = [...terms]
    .map(([word, ids]) => ({
      text: labels[word] || word,
      count: ids.size,
      responseIds: [...ids],
    }))
    .sort(
      (a, b) => b.count - a.count || a.text.localeCompare(b.text, "zh-Hant"),
    );
  return {
    words: all.slice(0, 36),
    responses: included.size,
    totalWords: all.length,
  };
}
