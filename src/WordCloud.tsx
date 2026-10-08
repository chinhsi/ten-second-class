import { useMemo, useRef } from "react";
import { buildWordCloud, type CloudWord } from "./wordCloudLogic";
import type { ResponseRow } from "./discussionLogic";
export function WordCloud({
  responses,
  summaryLanguage,
  onLanguage,
  result,
  busy,
  canSummarize,
  onSummarize,
  prompt,
  lang,
  onEvidence,
  stopAudio,
}: {
  responses: ResponseRow[];
  summaryLanguage: "en" | "zh";
  onLanguage: (language: "en" | "zh") => void;
  result: any;
  busy: boolean;
  canSummarize: boolean;
  onSummarize: () => void;
  prompt: string;
  lang: "en" | "zh";
  onEvidence: (ids: string[]) => void;
  stopAudio: () => void;
}) {
  const cloud = useMemo(
    () => buildWordCloud(responses, result),
    [responses, result],
  );
  const dialog = useRef<HTMLDialogElement>(null);
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const max = cloud.words[0]?.count || 1;
  const description = t(
    `AI groups concepts from ${cloud.responses} transcripts in the context of the question. Larger concepts have more supporting responses.`,
    `AI 根據題目與 ${cloud.responses} 份逐字稿歸納概念。字越大，代表相關回答越多；同一回答在每個概念只計一次。`,
  );
  function renderWords(projected = false) {
    return (
      <div
        className="word-cloud"
        aria-label={t("Response concept cloud", "作答概念雲")}
      >
        {cloud.words.map((word: CloudWord, i: number) => {
          const style = {
            fontSize: `${1 + 2.2 * Math.sqrt(word.count / max)}em`,
            color: ["#173f39", "#955629", "#3e637d", "#6b5479", "#53672d"][
              i % 5
            ],
          };
          const label = t(
            `${word.text}: ${word.count} responses`,
            `${word.text}：${word.count} 份回答`,
          );
          return projected ? (
            <span key={word.text} style={style} title={label}>
              {word.text}
            </span>
          ) : (
            <button
              key={word.text}
              type="button"
              style={style}
              aria-label={label}
              title={label}
              onClick={() => onEvidence(word.responseIds)}
            >
              {word.text}
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <section
      className="word-cloud-section"
      aria-label={t("Concept cloud summary", "概念雲總結")}
    >
      <div className="section-title">
        <h3>{t("Concept cloud", "概念雲")}</h3>
        <button
          className="secondary"
          disabled={!cloud.words.length}
          onClick={() => {
            stopAudio();
            dialog.current?.showModal();
          }}
        >
          {t("Present concept cloud", "投影概念雲")}
        </button>
      </div>
      <label>
        {t("Concept language", "概念呈現語言")}
        <select
          value={summaryLanguage}
          onChange={(e) => onLanguage(e.target.value as "en" | "zh")}
        >
          <option value="zh">中文</option>
          <option value="en">English</option>
        </select>
      </label>
      <p className="muted">
        {cloud.words.length
          ? description
          : t(
              "First group the ideas in context, then visualize them.",
              "先依題目與原話歸納關鍵概念，再作圖。",
            )}
      </p>
      <button
        className="secondary"
        disabled={!canSummarize || busy}
        onClick={onSummarize}
      >
        {busy
          ? t("Summarizing…", "正在歸納…")
          : t("Summarize concepts", "歸納關鍵概念")}
      </button>
      {cloud.words.length ? (
        renderWords()
      ) : (
        <p className="word-cloud-empty">
          {t(
            result
              ? "No clear concepts could be supported. Review the original responses or the clarification questions below."
              : "Select Summarize concepts to use the responses received so far. The cloud shares one AI summary with Class summary below.",
            result
              ? "目前原話不足以歸納清楚的概念，請查看原話或下方釐清問題。"
              : "按「歸納關鍵概念」整理目前的回答；概念雲與下方全班摘要共用同一次 AI 整理。",
          )}
        </p>
      )}
      <p className="muted">
        {t(
          "Click a concept to check anonymous source responses. AI groups equivalent ideas; different viewpoints stay distinct. Counts do not mean agreement or correctness.",
          "點概念可核對匿名原話。AI 合併同義說法，保留不同觀點；歸納供老師覆核，人數不代表贊同或正確。",
        )}
      </p>
      <dialog
        ref={dialog}
        className="presentation cloud-presentation"
        aria-label={t("Concept cloud presentation", "概念雲投影")}
      >
        <div className="presentation-toolbar">
          <span>{t("CLASS VOICES", "全班的聲音")}</span>
          <button className="secondary" onClick={() => dialog.current?.close()}>
            {t("Close concept cloud", "結束概念雲投影")} · Esc
          </button>
        </div>
        <div className="cloud-presentation-body">
          <h2>{prompt}</h2>
          {renderWords(true)}
          <p>{description}</p>
          <small>
            {t(
              "AI concept grouping, not correctness or agreement.",
              "AI 歸納概念，不代表對錯或贊同程度。",
            )}
          </small>
        </div>
      </dialog>
    </section>
  );
}
