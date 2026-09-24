import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { QRCodeSVG } from "qrcode.react";
import { recordingToWav } from "./audio";
import "./style.css";
import { Discussion } from "./Discussion";
const ENDPOINT =
  "https://fdfhyekuehybjkfyatjn.supabase.co/functions/v1/ten-second";
async function api(action: string, data: any = {}) {
  const r = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...data }),
  });
  const j = await r.json();
  if (!r.ok || j.error)
    throw Object.assign(Error(j.error || "Connection failed"), {
      code: j.code,
    });
  return j;
}
const pendingKey = (id: string) => "ts-recording-" + id;
function savedRecording(id: string): string | null {
  try {
    return sessionStorage.getItem(pendingKey(id));
  } catch {
    return null;
  }
}
const labels: Record<string, string> = {
  draft: "Preparing",
  active: "Live",
  ended: "Ended",
  closed: "Closed",
  recording: "Not submitted",
  processing: "Assessing",
  done: "Complete",
  failed: "Retry needed",
  understood: "Understood",
  partial: "Partly understood",
  not_yet: "Not yet understood",
  unscorable: "Could not assess",
  transcribed: "Transcript only",
};
const labelsZh: Record<string, string> = {
  draft: "備課中",
  active: "進行中",
  ended: "已結束",
  closed: "已收題",
  recording: "尚未提交",
  processing: "評分中",
  done: "已完成",
  failed: "需要重試",
  understood: "達標",
  partial: "部分達標",
  not_yet: "尚未達標",
  unscorable: "無法判讀",
  transcribed: "只顯示逐字稿",
};
const statusLabel = (key: string | undefined, lang: "en" | "zh") =>
  (lang === "zh" ? labelsZh[key || ""] : labels[key || ""]) ||
  (lang === "zh" ? "未提交" : "Not submitted");
const languageLabels: Record<string, string> = {
  auto: "Auto-detect (Mandarin / Cantonese / English)",
  mandarin: "Mandarin",
  cantonese: "Cantonese",
  english: "English",
};
const languageLabelsZh: Record<string, string> = {
  auto: "自動辨識（普通話／廣東話／英文）",
  mandarin: "普通話",
  cantonese: "廣東話",
  english: "英文",
};
const tx = (lang: "en" | "zh", en: string, zh: string) =>
  lang === "zh" ? zh : en;
function App() {
  const [hash, setHash] = useState(location.hash);
  const [lang, setLang] = useState<"en" | "zh">(
    () => (localStorage.getItem("ts-language") as "en" | "zh") || "en",
  );
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  const code = new URLSearchParams(hash.slice(1)).get("join");
  function changeLanguage(next: "en" | "zh") {
    setLang(next);
    localStorage.setItem("ts-language", next);
  }
  return (
    <>
      <header>
        <a href="#">◉ {tx(lang, "Ten-Second Class", "十秒課堂")}</a>
        <span>
          {tx(
            lang,
            "One sentence. See every voice.",
            "一句話，看見每個人的理解。",
          )}
        </span>
        <div
          className="language-switch"
          role="group"
          aria-label="Interface language"
        >
          <button
            className={lang === "en" ? "selected" : ""}
            onClick={() => changeLanguage("en")}
          >
            English
          </button>
          <button
            className={lang === "zh" ? "selected" : ""}
            onClick={() => changeLanguage("zh")}
          >
            中文
          </button>
        </div>
      </header>
      {code ? <Student code={code} lang={lang} /> : <Teacher lang={lang} />}
      <footer>
        {tx(
          lang,
          "Up to 10 seconds · AI gives a first pass; teachers can review the audio",
          "每次最多 10 秒 · AI 提供初步回饋，老師可聽錄音覆核",
        )}
      </footer>
    </>
  );
}
function Teacher({ lang }: { lang: "en" | "zh" }) {
  const t = (en: string, zh: string) => tx(lang, en, zh);
  const [owner, setOwner] = useState(sessionStorage.getItem("ts-owner") || "");
  const [logged, setLogged] = useState(false);
  const [classes, setClasses] = useState<any[]>([]);
  const [cls, setCls] = useState<any>(null);
  const [d, setD] = useState<any>({
    questions: [],
    members: [],
    responses: [],
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [rubric, setRubric] = useState("");
  const [mode, setMode] = useState("answer");
  const [responseLanguage, setResponseLanguage] = useState("auto");
  const [feedbackEnabled, setFeedbackEnabled] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [audio, setAudio] = useState("");
  const [tab, setTab] = useState("all");
  const call = (a: string, b: any = {}) => api(a, { owner, ...b });
  const refreshVersion = useRef(0);
  const activeClass = useRef<string | undefined>(undefined);
  async function refresh(id = activeClass.current) {
    const version = ++refreshVersion.current;
    activeClass.current = id;
    const cs = await call("classes");
    const dashboard = id ? await call("dashboard", { classId: id }) : null;
    if (version !== refreshVersion.current) return;
    setClasses(cs);
    setError("");
    if (id) {
      setCls(cs.find((c: any) => c.id === id));
      setD(dashboard);
    }
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!logged || !cls) return;
    let active = true;
    const timer = setInterval(() => {
      if (!active) return;
      refresh().catch((e) => setError(e.message));
    }, 4000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [logged, cls?.id, owner]);
  const question =
    d.questions.find((q: any) => q.id === selected) ||
    d.questions.find((q: any) => q.status === "active") ||
    d.questions.at(-1);
  const responses = d.responses.filter(
    (r: any) => r.question_id === question?.id,
  );
  const submitted = responses.filter(
    (r: any) => r.status !== "recording" && (r.status !== "failed" || r.path),
  );
  const done = submitted.filter((r: any) => r.status === "done");
  const joinURL = cls
    ? `${location.origin}${location.pathname}#join=${cls.code}`
    : "";
  function download() {
    const rows = [
      [
        "Name",
        "Student ID",
        "Question",
        "Mode",
        "Status",
        "Score",
        "Transcript",
        "Feedback",
      ],
      ...d.questions.flatMap((q: any) =>
        d.members.map((m: any) => {
          const r = d.responses.find(
            (x: any) => x.member_id === m.id && x.question_id === q.id,
          );
          return [
            m.name,
            m.student_id,
            q.prompt,
            q.mode === "answer" ? "Concept response" : "Pronunciation",
            statusLabel(r?.status, lang),
            r?.result?.score ?? "",
            r?.result?.transcript || "",
            r?.result?.feedback || "",
          ];
        }),
      ),
    ];
    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row
            .map(
              (v: any) =>
                '"' +
                String(v)
                  .replace(/^[\s]*[=+@-]|^[\t\r\n]/, "'$&")
                  .replaceAll('"', '""') +
                '"',
            )
            .join(","),
        )
        .join("\r\n");
    const u = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = u;
    a.download = `${cls.title.replace(/[\/:*?"<>|]/g, "_")}-responses.csv`;
    a.click();
    URL.revokeObjectURL(u);
  }
  if (!logged)
    return (
      <main className="welcome">
        <div className="eyebrow">10 SECONDS · EVERY VOICE</div>
        <h1>
          {t("Give everyone", "讓每個人")}
          <br />
          {t("a voice.", "都說一句。")}
        </h1>
        <p>
          {t(
            "Prepare questions before class and enable them when you are ready.",
            "課前準備題目，上課一鍵啟用。",
          )}
          <br />
          {t(
            "Use a ten-second reading or concept response to see understanding.",
            "朗讀發音或概念短答，十秒就能看見理解。",
          )}
        </p>
        <form
          className="card login"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await refresh();
              sessionStorage.setItem("ts-owner", owner);
              setLogged(true);
            });
          }}
        >
          <h2>{t("Teacher workspace", "老師工作台")}</h2>
          <label>
            {t("Owner key", "管理密碼")}
            <input
              type="password"
              autoComplete="current-password"
              required
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </label>
          <button disabled={busy}>{t("Open workspace", "進入備課")}</button>
          <small>
            {t(
              "Your InterAct owner key stays in this browser tab.",
              "沿用你的 InterAct 管理密碼，僅保留在此分頁。",
            )}
          </small>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
        <a className="student-link" href="#join=">
          {t(
            "Students: scan the teacher's QR code to join",
            "學生請掃老師的 QR code 加入",
          )}
        </a>
      </main>
    );
  return (
    <main className="workspace">
      <aside>
        <div className="eyebrow">TEACHER WORKSPACE</div>
        <h2>{t("My classes", "我的課堂")}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const c = await call("create", { title });
              setTitle("");
              setSelected("");
              await refresh(c.id);
            });
          }}
        >
          <input
            aria-label={t("New class name", "新課堂名稱")}
            placeholder={t("New class name", "新課堂名稱")}
            value={title}
            maxLength={100}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
          <button disabled={busy}>＋ {t("Create class", "建立課堂")}</button>
        </form>
        <nav>
          {classes.map((c) => (
            <button
              className={"class-item " + (cls?.id === c.id ? "chosen" : "")}
              key={c.id}
              onClick={() =>
                run(async () => {
                  setSelected("");
                  setEditing(null);
                  await refresh(c.id);
                })
              }
            >
              <strong>{c.title}</strong>
              <small>{statusLabel(c.status, lang)}</small>
            </button>
          ))}
        </nav>
        <button
          className="quiet"
          onClick={() => {
            sessionStorage.removeItem("ts-owner");
            setOwner("");
            setLogged(false);
          }}
        >
          {t("Sign out", "登出")}
        </button>
      </aside>
      <section className="content">
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {!cls ? (
          <div className="empty">
            <h1>{t("Prepare first, then go live.", "先準備，再開課。")}</h1>
            <p>
              {t(
                "Create a class and line up the questions you want to ask.",
                "建立一個課堂，把要問的幾句話排好。",
              )}
            </p>
          </div>
        ) : (
          <>
            <div className="class-head">
              <div>
                <span className={"pill " + cls.status}>
                  {statusLabel(cls.status, lang)}
                </span>
                <h1>{cls.title}</h1>
                <p>
                  {t("10-second recording limit", "錄音上限 10 秒")} ·{" "}
                  {d.members.length} {t("joined", "人已加入")}
                </p>
              </div>
              <div className="actions">
                {cls.status !== "active" ? (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await call("class_status", {
                          classId: cls.id,
                          status: "active",
                        });
                        await refresh();
                      })
                    }
                  >
                    {t("Enable class", "啟用課堂")}
                  </button>
                ) : (
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await call("class_status", {
                          classId: cls.id,
                          status: "ended",
                        });
                        await refresh();
                      })
                    }
                  >
                    {t("End class", "結束課堂")}
                  </button>
                )}
                <button className="quiet" onClick={download}>
                  {t("Download records", "下載紀錄")}
                </button>
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => {
                    if (
                      confirm(
                        "Delete this class, student records, and recordings? This cannot be undone.",
                      )
                    )
                      run(async () => {
                        await call("delete_class", { classId: cls.id });
                        activeClass.current = undefined;
                        setCls(null);
                        setD({ questions: [], members: [], responses: [] });
                        await refresh();
                      });
                  }}
                >
                  {t("Delete class", "刪除課堂")}
                </button>
              </div>
            </div>
            <div className="top-grid">
              <section className="card">
                <div className="section-title">
                  <h2>{t("Prepare questions", "課前備題")}</h2>
                  <span className="muted">
                    {d.questions.length} {t("questions", "題")}
                  </span>
                </div>
                <div className="questions">
                  {d.questions.map((q: any, i: number) => (
                    <div
                      className={
                        "question-row " +
                        (question?.id === q.id ? "selected" : "")
                      }
                      key={q.id}
                    >
                      <button
                        className="question-pick"
                        onClick={() => setSelected(q.id)}
                      >
                        <span className="number">{i + 1}</span>
                        <span>
                          <small>
                            {q.mode === "answer"
                              ? t("Concept response", "概念作答")
                              : t("Pronunciation", "朗讀發音")}{" "}
                            · {statusLabel(q.status, lang)}
                          </small>
                          <strong>{q.prompt}</strong>
                        </span>
                      </button>
                      <div className="row-actions">
                        {q.status === "draft" && (
                          <button
                            className="quiet"
                            onClick={() => {
                              setEditing(q.id);
                              setMode(q.mode);
                              setPrompt(q.prompt);
                              setRubric(q.rubric);
                              setResponseLanguage(
                                q.response_language || "auto",
                              );
                              setFeedbackEnabled(q.feedback_enabled !== false);
                            }}
                          >
                            {t("Edit", "編輯")}
                          </button>
                        )}
                        {q.status === "active" ? (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              run(async () => {
                                await call("close_question", { id: q.id });
                                await refresh();
                              })
                            }
                          >
                            {t("Close", "收題")}
                          </button>
                        ) : (
                          <button
                            disabled={busy || cls.status !== "active"}
                            onClick={() =>
                              run(async () => {
                                await call("open_question", {
                                  id: q.id,
                                  classId: cls.id,
                                });
                                setSelected(q.id);
                                await refresh();
                              })
                            }
                          >
                            {t("Open", "開放")}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <form
                  className="question-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      await call("save_question", {
                        id: editing,
                        classId: cls.id,
                        mode,
                        prompt,
                        rubric,
                        responseLanguage,
                        feedbackEnabled,
                        position: editing
                          ? d.questions.find((q: any) => q.id === editing)
                              ?.position
                          : d.questions.length,
                      });
                      setPrompt("");
                      setRubric("");
                      setEditing(null);
                      setResponseLanguage("auto");
                      setFeedbackEnabled(true);
                      await refresh();
                    });
                  }}
                >
                  <h3>
                    {editing
                      ? t("Edit question", "編輯題目")
                      : t("＋ Add question", "＋ 新增題目")}
                  </h3>
                  <div className="segmented">
                    <button
                      type="button"
                      className={mode === "answer" ? "on" : ""}
                      onClick={() => setMode("answer")}
                    >
                      {t("Concept response", "概念作答")}
                    </button>
                    <button
                      type="button"
                      className={mode === "pronunciation" ? "on" : ""}
                      onClick={() => setMode("pronunciation")}
                    >
                      {t("Pronunciation", "朗讀發音")}
                    </button>
                  </div>
                  <label>
                    {mode === "answer"
                      ? t("Question", "問題")
                      : t("Reading passage", "指定朗讀內容")}
                    <textarea
                      required
                      maxLength={1000}
                      placeholder={
                        mode === "answer"
                          ? t(
                              "e.g. Why should we verify an AI answer?",
                              "例如：為什麼 AI 的答案需要查證？",
                            )
                          : t(
                              "e.g. Learning without thinking is a waste.",
                              "例如：學而不思則罔，思而不學則殆。",
                            )
                      }
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                    />
                  </label>
                  <label>
                    {mode === "answer"
                      ? t("Response language", "回應語言")
                      : t("Spoken language", "說話語言")}
                    <select
                      value={responseLanguage}
                      onChange={(e) => setResponseLanguage(e.target.value)}
                    >
                      {Object.entries(languageLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {lang === "zh" ? languageLabelsZh[value] : label}
                        </option>
                      ))}
                    </select>
                  </label>
                  {mode === "answer" && (
                    <label className="check-row">
                      <input
                        type="checkbox"
                        checked={feedbackEnabled}
                        onChange={(e) => setFeedbackEnabled(e.target.checked)}
                      />
                      <span>
                        <strong>
                          {t("AI feedback and scoring", "AI 回饋及評分")}
                        </strong>
                        <small>
                          {t(
                            "Turn off to show the transcript only.",
                            "關閉後只顯示逐字稿，不評分。",
                          )}
                        </small>
                      </span>
                    </label>
                  )}
                  <label>
                    {mode === "answer"
                      ? t(
                          "Answer points (hidden from students)",
                          "答案要點（學生看不到）",
                        )
                      : t(
                          "Language and pronunciation notes (hidden from students)",
                          "目標語言與發音重點（學生看不到）",
                        )}
                    <textarea
                      required
                      maxLength={2000}
                      placeholder={
                        mode === "answer"
                          ? t(
                              "e.g. AI can produce content that sounds plausible but is wrong.",
                              "例如：AI 可能產生看似合理但錯誤的內容。",
                            )
                          : t(
                              "e.g. Mandarin; notice the sounds and pauses.",
                              "例如：普通話，注意發音和停頓。",
                            )
                      }
                      value={rubric}
                      onChange={(e) => setRubric(e.target.value)}
                    />
                  </label>
                  <div className="actions">
                    <button disabled={busy}>
                      {editing
                        ? t("Save changes", "儲存修改")
                        : t("Add to class", "存入課堂")}
                    </button>
                    {editing && (
                      <button
                        type="button"
                        className="quiet"
                        onClick={() => {
                          setEditing(null);
                          setPrompt("");
                          setRubric("");
                          setResponseLanguage("auto");
                          setFeedbackEnabled(true);
                        }}
                      >
                        {t("Cancel", "取消")}
                      </button>
                    )}
                  </div>
                </form>
              </section>
              <section className="card qr">
                <div className="eyebrow">JOIN THE CLASS</div>
                <h2>{t("Scan to join and speak", "掃碼，準備說一句")}</h2>
                <QRCodeSVG value={joinURL} size={180} marginSize={2} />
                <p className="code">{cls.code}</p>
                <button
                  className="secondary"
                  onClick={() =>
                    run(async () => {
                      await navigator.clipboard.writeText(joinURL);
                    })
                  }
                >
                  {t("Copy join link", "複製加入連結")}
                </button>
                <a href={joinURL} target="_blank" rel="noreferrer">
                  {t("Open student page ↗", "開啟學生頁 ↗")}
                </a>
                <p className="muted">
                  {t("Share this while preparing.", "備課時就能分享。")}
                  <br />
                  {t(
                    "Students can record after you enable the class and open a question.",
                    "啟用課堂、開放題目後才能錄音。",
                  )}
                </p>
              </section>
            </div>
            <section className="card results">
              <div className="section-title">
                <div>
                  <div className="eyebrow">LIVE PULSE</div>
                  <h2>{t("Class responses", "全班回應")}</h2>
                </div>
                <select
                  aria-label={t("View question", "查看題目")}
                  value={question?.id || ""}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  {d.questions.map((q: any, i: number) => (
                    <option key={q.id} value={q.id}>
                      {i + 1}. {q.prompt}
                    </option>
                  ))}
                </select>
              </div>
              <div className="stats">
                <div>
                  <strong>
                    {submitted.length}
                    <small>/{d.members.length}</small>
                  </strong>
                  <span>{t("Submitted", "已提交")}</span>
                </div>
                <div>
                  <strong>
                    {question?.mode === "answer" &&
                    question?.feedback_enabled === false
                      ? "—"
                      : done.filter(
                          (r: any) => r.result?.level === "understood",
                        ).length}
                  </strong>
                  <span>
                    {question?.mode === "answer"
                      ? t("Understood", "理解到位")
                      : t("Pronunciation met", "發音達標")}
                  </span>
                </div>
                <div>
                  <strong>
                    {question?.mode === "answer" &&
                    question?.feedback_enabled === false
                      ? "—"
                      : done.filter((r: any) =>
                          ["partial", "not_yet"].includes(r.result?.level),
                        ).length}
                  </strong>
                  <span>{t("Needs follow-up", "需要跟進")}</span>
                </div>
                <div>
                  <strong>{d.members.length - submitted.length}</strong>
                  <span>{t("Not answered", "本題未答")}</span>
                </div>
              </div>
              {question && (
                <Discussion
                  key={cls.id + question.id}
                  question={question}
                  members={d.members}
                  responses={responses}
                  summaries={d.summaries || []}
                  lang={lang}
                  call={call}
                  stopAudio={() => setAudio("")}
                />
              )}
              <div className="actions filters">
                <button
                  className="secondary"
                  disabled={
                    busy ||
                    !d.responses.some(
                      (r: any) =>
                        r.path &&
                        (r.status === "failed" ||
                          (r.status === "processing" &&
                            Date.now() - Date.parse(r.submitted_at) > 90000)),
                    )
                  }
                  onClick={() =>
                    run(async () => {
                      for (const r of d.responses.filter(
                        (r: any) =>
                          r.path &&
                          (r.status === "failed" ||
                            (r.status === "processing" &&
                              Date.now() - Date.parse(r.submitted_at) > 90000)),
                      ))
                        await call("retry", { id: r.id });
                      await refresh();
                    })
                  }
                >
                  {t("Retry incomplete assessments", "重試全部未完成評分")}
                </button>
                {[
                  ["all", t("All", "全部")],
                  ["missing", t("Not answered", "本題未答")],
                  ["never", t("Never submitted", "本堂尚未提交")],
                ].map(([k, t]) => (
                  <button
                    key={k}
                    className={tab === k ? "secondary" : "quiet"}
                    onClick={() => setTab(k)}
                  >
                    {t}
                  </button>
                ))}
              </div>
              <p className="muted">
                {t(
                  "The list contains students who joined by QR code.",
                  "名單以已掃碼加入的學生為準。",
                )}
              </p>
              {audio && (
                <audio
                  controls
                  autoPlay
                  src={audio}
                  onError={() =>
                    setError(
                      "The playback link expired. Click Play again to request a new link.",
                    )
                  }
                />
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>{t("Student", "學生")}</th>
                      <th>{t("Status", "狀態")}</th>
                      <th>{t("Score", "分數")}</th>
                      <th>{t("Feedback and transcript", "回饋與原話")}</th>
                      <th>{t("Audio", "錄音")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.members
                      .filter((m: any) =>
                        tab === "missing"
                          ? !submitted.some((r: any) => r.member_id === m.id)
                          : tab === "never"
                            ? !d.responses.some(
                                (r: any) =>
                                  r.member_id === m.id &&
                                  r.status !== "recording",
                              )
                            : true,
                      )
                      .map((m: any) => {
                        const r = responses.find(
                          (r: any) => r.member_id === m.id,
                        );
                        return (
                          <tr key={m.id}>
                            <td>
                              <strong>{m.name}</strong>
                              <small>{m.student_id}</small>
                            </td>
                            <td>
                              <span
                                className={
                                  "pill " +
                                  (r?.result?.level || r?.status || "")
                                }
                              >
                                {r?.result?.level
                                  ? statusLabel(r.result.level, lang)
                                  : statusLabel(r?.status, lang)}
                              </span>
                            </td>
                            <td>
                              {r?.result?.score != null
                                ? `${r.result.score}/5`
                                : "—"}
                            </td>
                            <td>
                              {r?.result?.feedback}
                              <small>
                                {r?.result?.transcript &&
                                  `「${r.result.transcript}」`}
                              </small>
                            </td>
                            <td>
                              {r?.path && (
                                <button
                                  className="quiet"
                                  onClick={() =>
                                    run(async () => {
                                      setAudio(
                                        (await call("audio", { id: r.id }))
                                          .signedUrl,
                                      );
                                    })
                                  }
                                >
                                  {t("Play", "播放")}
                                </button>
                              )}
                              {(r?.status === "failed" ||
                                (r?.status === "processing" &&
                                  Date.now() - Date.parse(r.submitted_at) >
                                    90000)) && (
                                <button
                                  className="quiet"
                                  disabled={busy}
                                  onClick={() =>
                                    run(async () => {
                                      await call("retry", { id: r.id });
                                      await refresh();
                                    })
                                  }
                                >
                                  {t("Retry assessment", "重試評分")}
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {!d.members.length && (
                <p className="empty">
                  Students will appear here after joining.
                </p>
              )}
            </section>
          </>
        )}
      </section>
    </main>
  );
}
function Student({ code, lang }: { code: string; lang: "en" | "zh" }) {
  const t = (en: string, zh: string) => tx(lang, en, zh);
  const [token] = useState(() => {
    const k = "ts-token-" + code;
    let t = localStorage.getItem(k);
    if (!t) {
      t = crypto.randomUUID() + crypto.randomUUID();
      localStorage.setItem(k, t);
    }
    return t;
  });
  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [info, setInfo] = useState<any>(null);
  const [state, setState] = useState<any>(null);
  const [recordingQuestion, setRecordingQuestion] = useState<any>(null);
  const [joined, setJoined] = useState(
    localStorage.getItem("ts-joined-" + code) === "yes",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const call = (a: string, b: any = {}) => api(a, { code, token, ...b });
  const refresh = async () => {
    try {
      setState(await call("state"));
      setError("");
    } catch (e) {
      if ((e as any).code === "REJOIN") {
        localStorage.removeItem("ts-joined-" + code);
        setJoined(false);
      }
      throw e;
    }
  };
  useEffect(() => {
    call("peek")
      .then(setInfo)
      .catch((e) => setError(e.message));
  }, [code]);
  useEffect(() => {
    if (!joined) return;
    refresh().catch((e) => setError(e.message));
    const t = setInterval(
      () => refresh().catch((e) => setError(e.message)),
      3000,
    );
    return () => clearInterval(t);
  }, [joined, code]);
  const q =
    recordingQuestion ||
    state?.questions.find(
      (question: any) =>
        savedRecording(question.id) &&
        !state.responses.some(
          (r: any) => r.question_id === question.id && r.status !== "recording",
        ),
    ) ||
    (state?.class.status === "active"
      ? state?.questions.find((q: any) => q.status === "active")
      : null);
  return (
    <main className="student">
      <div className="eyebrow">YOUR VOICE MATTERS</div>
      <h1>{state?.class.title || info?.title || "Join class"}</h1>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!joined ? (
        <form
          className="card"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await call("join", { name, studentId: id });
              localStorage.setItem("ts-joined-" + code, "yes");
              setJoined(true);
            } catch (e) {
              setError((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <h2>{t("Get ready to speak", "準備說一句")}</h2>
          <label>
            {t("Name", "姓名")}
            <input
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label>
            {t("Student ID", "學號")}
            <input
              required
              maxLength={60}
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </label>
          <p className="muted">
            {t(
              "Your recording is assessed by AI. Your teacher can review it; other students cannot see it.",
              "錄音將交給 AI 評測，老師可查看和播放；其他同學看不到你的答案。",
            )}
          </p>
          <button disabled={busy || !info || info.status === "ended"}>
            {t("Join class", "加入課堂")}
          </button>
        </form>
      ) : (
        <>
          <p className="muted">
            {state?.member.name}
            {t(
              ", you have up to 10 seconds to speak.",
              "，每次最多 10 秒，說出你的想法。",
            )}
          </p>
          {q ? (
            <Recorder
              key={q.id}
              q={q}
              lang={lang}
              call={call}
              response={state?.responses.find(
                (r: any) => r.question_id === q.id,
              )}
              onRecording={() => setRecordingQuestion(q)}
              onDiscard={() => setRecordingQuestion(null)}
              onSubmitted={async () => {
                await refresh();
                setRecordingQuestion(null);
              }}
            />
          ) : (
            <div className="card waiting">
              <div className="orb">◉</div>
              <h2>
                {state?.class.status === "ended"
                  ? t("This class has ended", "這堂課已結束")
                  : t(
                      "Ready. Waiting for the teacher to open a question",
                      "已就位，等老師開題",
                    )}
              </h2>
              <p>
                {t(
                  "Keep this page open. The question will appear automatically.",
                  "保持這個畫面，題目會自動出現。",
                )}
              </p>
            </div>
          )}
          <section className="history">
            <h2>{t("My responses", "我的回應")}</h2>
            {state?.responses
              .filter((r: any) => r.status !== "recording")
              .map((r: any) => (
                <article className="card" key={r.id}>
                  <small>
                    {
                      state.questions.find((q: any) => q.id === r.question_id)
                        ?.prompt
                    }
                  </small>
                  <div className="section-title">
                    <h3>{statusLabel(r.result?.level || r.status, lang)}</h3>
                    {r.result?.score != null && (
                      <strong className="score">
                        {r.result.score}
                        <small>/5</small>
                      </strong>
                    )}
                  </div>
                  {r.result?.transcript && (
                    <blockquote>「{r.result.transcript}」</blockquote>
                  )}
                  <p>
                    {r.result?.feedback ||
                      (r.result?.transcript
                        ? t("Transcript received.", "已收到逐字稿。")
                        : t(
                            "Recording received; assessment in progress.",
                            "已收到錄音，正在評分。",
                          ))}
                  </p>
                </article>
              ))}
          </section>
        </>
      )}
    </main>
  );
}
function Recorder({
  q,
  lang,
  call,
  response,
  onSubmitted,
  onRecording,
  onDiscard,
}: {
  q: any;
  lang: "en" | "zh";
  call: (a: string, b?: any) => Promise<any>;
  response: any;
  onSubmitted: () => Promise<void>;
  onRecording: () => void;
  onDiscard: () => void;
}) {
  const t = (en: string, zh: string) => tx(lang, en, zh);
  const [phase, setPhase] = useState(() =>
    savedRecording(q.id) ? "retry" : "idle",
  );
  const [left, setLeft] = useState(10);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(() =>
    savedRecording(q.id),
  );
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current) clearInterval(timer.current);
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  async function upload(audio: string) {
    setPhase("sending");
    try {
      await call("submit", { questionId: q.id, audio });
      setPhase("sent");
      setPending(null);
      try {
        sessionStorage.removeItem(pendingKey(q.id));
      } catch {}
      await onSubmitted();
    } catch (e) {
      setError((e as Error).message);
      setPhase("retry");
    }
  }
  async function start() {
    setError("");
    setPhase("permission");
    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)
        throw Error(
          "This browser does not support recording. Please use Safari or Chrome.",
        );
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (!alive.current) {
        stream.current.getTracks().forEach((t) => t.stop());
        return;
      }
      const ticket = await call("start", { questionId: q.id });
      if (!alive.current) {
        stream.current.getTracks().forEach((t) => t.stop());
        return;
      }
      if (Date.now() - Date.parse(ticket.started_at) > 110000)
        throw Error(
          "This recording ticket has expired. Please tell your teacher.",
        );
      const chunks: Blob[] = [];
      const type = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (t) => MediaRecorder.isTypeSupported(t),
      );
      const rec = new MediaRecorder(
        stream.current,
        type ? { mimeType: type } : {},
      );
      recorder.current = rec;
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onerror = () => {
        setError("Recording failed. Please check your microphone.");
        setPhase("idle");
        stream.current?.getTracks().forEach((t) => t.stop());
        if (timer.current) clearInterval(timer.current);
      };
      rec.onstop = async () => {
        if (timer.current) clearInterval(timer.current);
        stream.current?.getTracks().forEach((t) => t.stop());
        try {
          const wav = await recordingToWav(
            new Blob(chunks, { type: rec.mimeType }),
          );
          if (wav.size < 8044) throw Error("Please say at least one sentence.");
          const bytes = new Uint8Array(await wav.arrayBuffer());
          let bin = "";
          for (const b of bytes) bin += String.fromCharCode(b);
          const audio = btoa(bin);
          setPending(audio);
          try {
            sessionStorage.setItem(pendingKey(q.id), audio);
          } catch {
            setError(
              "Browser storage is full. Keep this page open until upload finishes.",
            );
          }
          await upload(audio);
        } catch (e) {
          setError((e as Error).message);
          setPhase("idle");
        }
      };
      rec.start();
      onRecording();
      setPhase("recording");
      const at = performance.now();
      timer.current = setInterval(() => {
        const rest = Math.max(0, 10 - (performance.now() - at) / 1000);
        setLeft(rest);
        if (rest === 0 && rec.state === "recording") rec.stop();
      }, 50);
    } catch (e) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setError((e as Error).message);
      setPhase("idle");
    }
  }
  const submitted =
    (response && response.status !== "recording") || phase === "sent";
  return (
    <section className="card record-card">
      <span className="pill">
        {q.mode === "answer"
          ? t("Concept response", "概念作答")
          : t("Pronunciation", "朗讀發音")}{" "}
        · {t("up to 10 seconds", "最多 10 秒")}
      </span>
      <h2>{q.prompt}</h2>
      {submitted ? (
        <div className="received">
          ✓ {t("Recording received", "已收到你的錄音")}
          <p>
            {t(
              "Your result will appear below automatically.",
              "回饋會自動出現在下方。",
            )}
          </p>
        </div>
      ) : (
        <>
          <div className={"countdown " + (phase === "recording" ? "live" : "")}>
            <strong>{Math.ceil(left)}</strong>
            <span>{t("sec", "秒")}</span>
          </div>
          {phase === "recording" ? (
            <button
              className="record-button stop"
              onClick={() => recorder.current?.stop()}
            >
              ■ {t("Submit early", "提早送出")}
            </button>
          ) : phase === "retry" ? (
            <button
              className="record-button"
              onClick={() => pending && upload(pending)}
            >
              {t("Upload this recording again", "重新上傳這段錄音")}
            </button>
          ) : (
            <button
              className="record-button"
              disabled={phase !== "idle"}
              onClick={start}
            >
              {phase === "permission"
                ? t("Opening microphone…", "正在開啟麥克風…")
                : phase === "sending"
                  ? t("Uploading…", "正在送出…")
                  : t("● Start recording", "● 開始錄音")}
            </button>
          )}
          {phase === "retry" && (
            <button
              className="quiet"
              onClick={() => {
                if (confirm("Discard this recording and continue?")) {
                  sessionStorage.removeItem(pendingKey(q.id));
                  setPending(null);
                  setPhase("idle");
                  setError("");
                  onDiscard();
                }
              }}
            >
              {t("Discard and continue", "捨棄錄音，繼續下一題")}
            </button>
          )}
          <p className="muted">
            {t(
              "The countdown starts when you press the button. It submits automatically at 10 seconds.",
              "按下後開始倒數，10 秒到自動送出。",
            )}
          </p>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
