import { useEffect, useRef, useState } from "react";
import {
  responseStats,
  discussionCandidates,
  pickRandom,
  type ResponseRow,
} from "./discussionLogic";
type Props = {
  question: any;
  members: any[];
  responses: ResponseRow[];
  summaries: any[];
  lang: "en" | "zh";
  call: (action: string, data?: any) => Promise<any>;
  stopAudio: () => void;
};
const snapshot = (rows: ResponseRow[]) =>
  JSON.stringify(
    [...rows]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((r) => [
        r.id,
        r.status,
        r.path || "",
        r.result?.level,
        r.result?.transcript,
        r.result?.feedback,
        r.result?.issue,
        r.result?.score,
      ]),
  );
export function Discussion({
  question,
  members,
  responses,
  summaries,
  lang,
  call,
  stopAudio,
}: Props) {
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const stats = responseStats(responses, members.length);
  const scoring =
    question.mode !== "answer" || question.feedback_enabled !== false;
  const [automatic, setAutomatic] = useState(
    () => localStorage.getItem("ts-auto-summary") !== "false",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [localSummary, setLocalSummary] = useState<any>(null);
  const attempts = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const saved = summaries.find(
    (s) => s.question_id === question.id && s.language === lang,
  );
  const summary =
    localSummary?.language === lang &&
    (!saved ||
      Date.parse(localSummary.started_at) > Date.parse(saved.started_at) ||
      (localSummary.started_at === saved.started_at &&
        localSummary.status !== "processing" &&
        saved.status === "processing"))
      ? localSummary
      : saved;
  const currentSnapshot = snapshot(responses);
  const result = summary?.result;
  const stale =
    result &&
    (snapshot(result.snapshot || []) !== currentSnapshot ||
      result.member_count !== members.length);
  const signature = `${lang}:${members.length}:${currentSnapshot}`;
  const readable = discussionCandidates(responses, "all", [], false).filter(
    (r) => r.result?.level !== "unscorable",
  );
  const processing =
    summary?.status === "processing" &&
    Date.now() - Date.parse(summary.started_at) < 90000;
  async function summarize() {
    attempts.current.add(signature);
    setBusy(true);
    setError("");
    try {
      const next = await call("summarize", { id: question.id, language: lang });
      if (mounted.current) setLocalSummary(next);
    } catch (e) {
      if (mounted.current) setError((e as Error).message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (
      automatic &&
      members.length > 0 &&
      stats.missing === 0 &&
      stats.settled &&
      readable.length &&
      !busy &&
      !processing &&
      (!result || stale) &&
      !attempts.current.has(signature) &&
      summary?.status !== "failed"
    )
      void summarize();
  }, [
    automatic,
    signature,
    busy,
    processing,
    summary?.status,
    !!result,
    stale,
  ]);
  const [pool, setPool] = useState("all");
  const [noRepeat, setNoRepeat] = useState(true);
  const [names, setNames] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const [seen, setSeen] = useState<string[]>([]);
  const [choice, setChoice] = useState("");
  const [shown, setShown] = useState<ResponseRow | null>(null);
  const [evidence, setEvidence] = useState<string[] | null>(null);
  const [audio, setAudio] = useState("");
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const audioVersion = useRef(0);
  const candidates = discussionCandidates(responses, pool, seen, noRepeat);
  const manual = discussionCandidates(responses, pool, [], false);
  const memberName = (r: ResponseRow) =>
    members.find((m) => m.id === r.member_id)?.name || t("Student", "學生");
  const label = (r: ResponseRow) =>
    names
      ? memberName(r)
      : `${t("Response", "回答")} ${members.findIndex((m) => m.id === r.member_id) + 1}`;
  function exhibit(r: ResponseRow | undefined) {
    if (!r) return;
    stopAudio();
    audioVersion.current++;
    setAudio("");
    setAudioError("");
    setAudioBusy(false);
    setShown(r);
    setSeen((previous) =>
      previous.includes(r.id) ? previous : [...previous, r.id],
    );
    dialog.current?.showModal();
  }
  function close() {
    audioVersion.current++;
    setAudio("");
    setShown(null);
    dialog.current?.close();
  }
  useEffect(() => {
    const old = document.body.style.overflow;
    if (shown) document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [!!shown]);
  async function play() {
    if (!shown) return;
    const version = ++audioVersion.current;
    setAudioBusy(true);
    setAudioError("");
    try {
      const a = await call("audio", { id: shown.id });
      if (mounted.current && version === audioVersion.current)
        setAudio(a.signedUrl);
    } catch {
      if (mounted.current && version === audioVersion.current)
        setAudioError(t("Could not play. Try again.", "播放失敗，請重試。"));
    } finally {
      if (mounted.current && version === audioVersion.current)
        setAudioBusy(false);
    }
  }
  return (
    <div className="discussion">
      <div className="completion-banner" role="status">
        <strong>
          {members.length && stats.missing === 0
            ? t("Everyone who joined has submitted", "已加入的學生全部交齊")
            : t(
                `${stats.submitted} of ${stats.total} students submitted`,
                `${stats.total} 位已加入學生中，${stats.submitted} 位已提交`,
              )}
        </strong>
        <span>
          {t(
            `${stats.processing} processing · ${stats.failed} need retry · ${stats.unscorable} unclear`,
            `${stats.processing} 份處理中 · ${stats.failed} 份需重試 · ${stats.unscorable} 份無法判讀`,
          )}
        </span>
      </div>
      {scoring ? (
        <div className="understanding-line">
          <strong>{stats.percent === null ? "—" : `${stats.percent}%`}</strong>
          <div>
            {t(
              `${stats.understood} of ${stats.assessed} assessed responses meet the answer points`,
              `${stats.assessed} 份可評答案中，${stats.understood} 份達標`,
            )}
            <small>
              {t(
                `${stats.partial} partly met · ${stats.notYet} not yet met. Unclear, pending and unsubmitted answers are excluded. AI judgment for teacher review.`,
                `${stats.partial} 份部分達標 · ${stats.notYet} 份尚未達標。不含無法判讀、處理中及未交答案；AI 初判供老師覆核。`,
              )}
            </small>
          </div>
        </div>
      ) : (
        <p className="muted">
          {t(
            "Scoring is off. Summaries describe viewpoints and places to clarify; no correctness rate is calculated.",
            "本題已關閉評分：摘要只整理觀點與可釐清的地方，不計算答對率。",
          )}
        </p>
      )}
      <div className="section-title">
        <h3>{t("Class summary", "全班摘要")}</h3>
        <button
          className="secondary"
          disabled={!readable.length || busy || processing}
          onClick={() => void summarize()}
        >
          {busy || processing
            ? t("Summarizing…", "正在整理…")
            : result
              ? t("Update summary", "更新摘要")
              : t("Summarize now", "立即整理")}
        </button>
      </div>
      <label className="check-row">
        <input
          type="checkbox"
          checked={automatic}
          onChange={(e) => {
            setAutomatic(e.target.checked);
            localStorage.setItem("ts-auto-summary", String(e.target.checked));
          }}
        />
        <span>
          {t(
            "Summarize automatically when everyone has submitted and processing has finished",
            "全部交齊且處理完成後，自動整理",
          )}
        </span>
      </label>
      <p className="muted">
        {t(
          "You can summarize the responses received so far without waiting for everyone. The roster includes only students who joined.",
          "不必等齊全班，也可以先整理目前的回答；人數以已加入名單為準。",
        )}
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!error && summary?.status === "failed" && (
        <p className="error">
          {t(
            "Summary failed. Select Summarize now to retry.",
            "摘要未能完成，請按「立即整理」重試。",
          )}
        </p>
      )}
      {result && (
        <div className="summary-content">
          {stale && (
            <p className="stale" role="status">
              {t(
                "New or changed responses: update this summary before discussing it.",
                "有新增或更新的答案，請更新摘要後再討論。",
              )}
            </p>
          )}
          <p className="muted">
            {t(
              `Based on ${result.response_ids?.length || 0} transcripts · themes may overlap`,
              `依據 ${result.response_ids?.length || 0} 份逐字稿 · 同一回答可含多個觀點`,
            )}
          </p>
          <p className="summary-overview">{result.overview}</p>
          <div className="summary-columns">
            <section>
              <h4>{t("Main ideas", "主要觀點")}</h4>
              {result.themes?.map((g: any, i: number) => (
                <article key={i}>
                  <strong>
                    {g.title}{" "}
                    <span className="pill">
                      {g.count} {t("responses", "份")}
                    </span>
                  </strong>
                  <p>{g.detail}</p>
                  <button
                    className="quiet"
                    onClick={() => setEvidence(g.response_ids)}
                  >
                    {t("View supporting answers", "查看相關原話")}
                  </button>
                </article>
              ))}
            </section>
            <section>
              <h4>{t("Make the answers more specific", "可以再說具體一點")}</h4>
              {result.gaps?.length ? (
                result.gaps.map((g: any, i: number) => (
                  <article key={i}>
                    <strong>
                      {g.title}{" "}
                      <span className="pill">
                        {g.count} {t("responses", "份")}
                      </span>
                    </strong>
                    <p>{g.detail}</p>
                    <p className="follow-up">{g.follow_up}</p>
                    <button
                      className="quiet"
                      onClick={() => setEvidence(g.response_ids)}
                    >
                      {t("View supporting answers", "查看相關原話")}
                    </button>
                  </article>
                ))
              ) : (
                <p className="muted">
                  {t(
                    "No shared gap supported by these responses.",
                    "這批回答未顯示有證據支持的共同缺漏。",
                  )}
                </p>
              )}
            </section>
          </div>
          <div className="next-question">
            <small>{t("Ask the class next", "下一句可以這樣問")}</small>
            <strong>{result.next_question}</strong>
          </div>
        </div>
      )}
      {evidence && (
        <section className="evidence-list">
          <div className="section-title">
            <h4>{t("Supporting answers", "相關原話")}</h4>
            <button className="quiet" onClick={() => setEvidence(null)}>
              {t("Close list", "收起")}
            </button>
          </div>
          {responses
            .filter((r) => evidence.includes(r.id))
            .map((r) => (
              <article key={r.id}>
                <strong>{label(r)}</strong>
                <p>{r.result?.transcript}</p>
                <button className="secondary" onClick={() => exhibit(r)}>
                  {t("Present this answer", "展示這個回答")}
                </button>
              </article>
            ))}
        </section>
      )}
      <section className="showcase-controls">
        <h3>
          {t("Bring an answer into the discussion", "選一個回答，一起討論")}
        </h3>
        <p className="muted">
          {t(
            "Presentation shows only the selected answer. Names and AI feedback stay hidden unless enabled below. Audio may identify the speaker.",
            "展示畫面只放選中的答案。姓名及 AI 回饋預設隱藏，可在下方開啟；播放錄音仍可能辨認出說話者。",
          )}
        </p>
        <div className="showcase-settings">
          <label>
            {t("Answer pool", "選取範圍")}
            <select
              value={pool}
              onChange={(e) => {
                setPool(e.target.value);
                setChoice("");
              }}
            >
              <option value="all">
                {t("All readable answers", "所有有逐字稿的回答")}
              </option>
              {scoring && (
                <>
                  <option value="understood">
                    {t("Met answer points", "達標")}
                  </option>
                  <option value="followup">
                    {t("Needs follow-up", "部分／尚未達標")}
                  </option>
                </>
              )}
            </select>
          </label>
          <label>
            {t("Choose an answer", "老師選回答")}
            <select value={choice} onChange={(e) => setChoice(e.target.value)}>
              <option value="">{t("Select a response…", "選擇回答…")}</option>
              {manual.map((r) => (
                <option key={r.id} value={r.id}>
                  {memberName(r)} — {r.result?.transcript?.slice(0, 55)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="showcase-settings">
          <label className="check-row">
            <input
              type="checkbox"
              checked={noRepeat}
              onChange={(e) => setNoRepeat(e.target.checked)}
            />
            {t("Do not draw the same answer twice", "隨機不重複抽選")}
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={names}
              onChange={(e) => setNames(e.target.checked)}
            />
            {t("Show student name", "展示姓名")}
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={feedback}
              onChange={(e) => setFeedback(e.target.checked)}
            />
            {t("Show AI feedback", "展示 AI 回饋")}
          </label>
        </div>
        <div className="actions">
          <button
            disabled={!manual.some((r) => r.id === choice)}
            onClick={() => exhibit(manual.find((r) => r.id === choice))}
          >
            {t("Present selected", "展示所選回答")}
          </button>
          <button
            className="secondary"
            disabled={!candidates.length}
            onClick={() => exhibit(pickRandom(candidates))}
          >
            {t("Draw & present", "隨機抽選並展示")} ({candidates.length})
          </button>
          <button
            className="quiet"
            disabled={!seen.length}
            onClick={() => setSeen([])}
          >
            {t("Reset draw history", "重設抽選紀錄")}
          </button>
        </div>
        {!candidates.length && !!manual.length && (
          <p className="muted">
            {t(
              "Every eligible answer has been shown. Reset the draw history to start again.",
              "這個範圍的回答都已展示過，可重設抽選紀錄再抽。",
            )}
          </p>
        )}
      </section>
      <dialog
        ref={dialog}
        className="presentation"
        aria-label={t("Answer presentation", "答案展示")}
        onCancel={close}
        onClose={() => {
          audioVersion.current++;
          setShown(null);
          setAudio("");
        }}
      >
        {shown && (
          <>
            <div className="presentation-toolbar">
              <span>{t("CLASS DISCUSSION", "全班討論")}</span>
              <div className="actions">
                <button
                  className="secondary"
                  disabled={!candidates.length}
                  onClick={() => exhibit(pickRandom(candidates))}
                >
                  {t("Draw next", "再抽一位")}
                </button>
                <button className="secondary" onClick={close}>
                  {t("Close presentation", "結束展示")} · Esc
                </button>
              </div>
            </div>
            <div className="presentation-body">
              <p className="presentation-question">{question.prompt}</p>
              <div className="eyebrow">{label(shown)}</div>
              <blockquote>{shown.result?.transcript}</blockquote>
              {feedback && shown.result?.feedback && (
                <p className="presentation-feedback">
                  {t("AI feedback", "AI 回饋")}：{shown.result.feedback}
                </p>
              )}
              {shown.path && (
                <button
                  className="secondary"
                  disabled={audioBusy}
                  onClick={() => void play()}
                >
                  {t("Play recording", "播放錄音")}
                </button>
              )}
              {audioError && <p role="alert">{audioError}</p>}
              {audio && (
                <audio
                  key={audio}
                  autoPlay
                  controls
                  src={audio}
                  onError={() =>
                    setAudioError(
                      t(
                        "Link expired. Press Play recording again.",
                        "連結已失效，請再按播放錄音。",
                      ),
                    )
                  }
                />
              )}
              <p className="presentation-prompt">
                {t(
                  "What is clear? What could be explained with an example?",
                  "哪一點說清楚了？哪裡可以加一個例子？",
                )}
              </p>
            </div>
          </>
        )}
      </dialog>
    </div>
  );
}
