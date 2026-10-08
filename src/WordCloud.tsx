import { useMemo, useRef } from "react";
import { buildWordCloud, type CloudWord } from "./wordCloudLogic";
import type { ResponseRow } from "./discussionLogic";
export function WordCloud({
  responses,
  prompt,
  lang,
  onEvidence,
  stopAudio,
}: {
  responses: ResponseRow[];
  prompt: string;
  lang: "en" | "zh";
  onEvidence: (ids: string[]) => void;
  stopAudio: () => void;
}) {
  const cloud = useMemo(() => buildWordCloud(responses), [responses]);
  const dialog = useRef<HTMLDialogElement>(null);
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const max = cloud.words[0]?.count || 1;
  const description = t(
    `Based on ${cloud.responses} completed transcripts. Larger words appear in more responses; each response counts once per word.`,
    `依據 ${cloud.responses} 份已完成逐字稿。字越大，代表越多份回答提到；每份回答對同一個詞只計一次。`,
  );
  function renderWords(projected = false) {
    return (
      <div
        className="word-cloud"
        aria-label={t("Response word cloud", "作答文字雲")}
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
      aria-label={t("Word cloud summary", "文字雲總結")}
    >
      <div className="section-title">
        <h3>{t("Word cloud", "文字雲")}</h3>
        <button
          className="secondary"
          disabled={!cloud.words.length}
          onClick={() => {
            stopAudio();
            dialog.current?.showModal();
          }}
        >
          {t("Present word cloud", "投影文字雲")}
        </button>
      </div>
      <p className="muted">{description}</p>
      {cloud.words.length ? (
        renderWords()
      ) : (
        <p className="word-cloud-empty">
          {t(
            "The word cloud appears when usable words are available in completed transcripts.",
            "有可用的逐字稿詞語後，文字雲會自動出現。",
          )}
        </p>
      )}
      <p className="muted">
        {t(
          "Click a word to see anonymous source responses. Shows up to 36 terms; common filler words are removed. Similar meanings and different languages are not merged. Frequency does not mean agreement or correctness.",
          "點詞可查看匿名原話。最多顯示 36 個詞，已去除常見語助詞；同義詞、不同語言與簡繁用字不自動合併。出現較多不代表贊同或正確。",
        )}
      </p>
      <dialog
        ref={dialog}
        className="presentation cloud-presentation"
        aria-label={t("Word cloud presentation", "文字雲投影")}
      >
        <div className="presentation-toolbar">
          <span>{t("CLASS VOICES", "全班的聲音")}</span>
          <button className="secondary" onClick={() => dialog.current?.close()}>
            {t("Close word cloud", "結束文字雲投影")} · Esc
          </button>
        </div>
        <div className="cloud-presentation-body">
          <h2>{prompt}</h2>
          {renderWords(true)}
          <p>{description}</p>
          <small>
            {t(
              "Word frequency, not correctness or agreement.",
              "詞語出現頻率，不代表對錯或贊同程度。",
            )}
          </small>
        </div>
      </dialog>
    </section>
  );
}
