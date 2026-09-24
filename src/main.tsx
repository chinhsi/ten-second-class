import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { QRCodeSVG } from "qrcode.react";
import { recordingToWav } from "./audio";
import "./style.css";
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
const languageLabels: Record<string, string> = {
  auto: "Auto-detect (Mandarin / Cantonese / English)",
  mandarin: "Mandarin",
  cantonese: "Cantonese",
  english: "English",
};
function App() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const f = () => setHash(location.hash);
    addEventListener("hashchange", f);
    return () => removeEventListener("hashchange", f);
  }, []);
  const code = new URLSearchParams(hash.slice(1)).get("join");
  return (
    <>
      <header>
        <a href="#">◉ Ten-Second Class</a>
        <span>One sentence. See every voice.</span>
      </header>
      {code ? <Student code={code} /> : <Teacher />}
      <footer>
        Up to 10 seconds · AI gives a first pass; teachers can review the audio
      </footer>
    </>
  );
}
function Teacher() {
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
  const submitted = responses.filter((r: any) => r.status !== "recording");
  const done = submitted.filter((r: any) => r.status === "done");
  const joinURL = cls
    ? `${location.origin}${location.pathname}#join=${cls.code}`
    : "";
  function download() {
    const rows = [
      ["Name", "Student ID", "Question", "Mode", "Status", "Score", "Transcript", "Feedback"],
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
            labels[r?.status] || "Not answered",
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
          Give everyone
          <br />a voice.
        </h1>
        <p>
          Prepare questions before class and enable them when you are ready.
          <br />
          Use a ten-second reading or concept response to see understanding.
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
          <h2>Teacher workspace</h2>
          <label>
            Owner key
            <input
              type="password"
              autoComplete="current-password"
              required
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
          </label>
          <button disabled={busy}>Open workspace</button>
          <small>Your InterAct owner key stays in this browser tab.</small>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
        </form>
        <a className="student-link" href="#join=">
          Students: scan the teacher's QR code to join
        </a>
      </main>
    );
  return (
    <main className="workspace">
      <aside>
        <div className="eyebrow">TEACHER WORKSPACE</div>
        <h2>My classes</h2>
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
            aria-label="New class name"
            placeholder="New class name"
            value={title}
            maxLength={100}
            required
            onChange={(e) => setTitle(e.target.value)}
          />
          <button disabled={busy}>＋ Create class</button>
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
              <small>{labels[c.status]}</small>
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
          Sign out
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
            <h1>Prepare first, then go live.</h1>
            <p>Create a class and line up the questions you want to ask.</p>
          </div>
        ) : (
          <>
            <div className="class-head">
              <div>
                <span className={"pill " + cls.status}>
                  {labels[cls.status]}
                </span>
                <h1>{cls.title}</h1>
                <p>10-second recording limit · {d.members.length} joined</p>
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
                    Enable class
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
                    End class
                  </button>
                )}
                <button className="quiet" onClick={download}>
                  Download records
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
                  Delete class
                </button>
              </div>
            </div>
            <div className="top-grid">
              <section className="card">
                <div className="section-title">
                  <h2>Prepare questions</h2>
                  <span className="muted">{d.questions.length} questions</span>
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
                              ? "Concept response"
                              : "Pronunciation"}{" "}
                            · {labels[q.status]}
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
                            Edit
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
                            Close
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
                            Open
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
                  <h3>{editing ? "Edit question" : "＋ Add question"}</h3>
                  <div className="segmented">
                    <button
                      type="button"
                      className={mode === "answer" ? "on" : ""}
                      onClick={() => setMode("answer")}
                    >
                      Concept response
                    </button>
                    <button
                      type="button"
                      className={mode === "pronunciation" ? "on" : ""}
                      onClick={() => setMode("pronunciation")}
                    >
                      Pronunciation
                    </button>
                  </div>
                  <label>
                    {mode === "answer" ? "Question" : "Reading passage"}
                    <textarea
                      required
                      maxLength={1000}
                      placeholder={
                        mode === "answer"
                          ? "e.g. Why should we verify an AI answer?"
                          : "e.g. Learning without thinking is a waste."
                      }
                      value={prompt}
                      onChange={(e) => setPrompt(e.target.value)}
                    />
                  </label>
                  <label>
                    {mode === "answer"
                      ? "Response language"
                      : "Spoken language"}
                    <select
                      value={responseLanguage}
                      onChange={(e) => setResponseLanguage(e.target.value)}
                    >
                      {Object.entries(languageLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
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
                        <strong>AI feedback and scoring</strong>
                        <small>Turn off to show the transcript only.</small>
                      </span>
                    </label>
                  )}
                  <label>
                    {mode === "answer"
                      ? "Answer points (hidden from students)"
                      : "Language and pronunciation notes (hidden from students)"}
                    <textarea
                      required
                      maxLength={2000}
                      placeholder={
                        mode === "answer"
                          ? "e.g. AI can produce content that sounds plausible but is wrong."
                          : "e.g. Mandarin; notice the sounds and pauses."
                      }
                      value={rubric}
                      onChange={(e) => setRubric(e.target.value)}
                    />
                  </label>
                  <div className="actions">
                    <button disabled={busy}>
                      {editing ? "Save changes" : "Add to class"}
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
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </section>
              <section className="card qr">
                <div className="eyebrow">JOIN THE CLASS</div>
                <h2>Scan to join and speak</h2>
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
                  Copy join link
                </button>
                <a href={joinURL} target="_blank" rel="noreferrer">
                  Open student page ↗
                </a>
                <p className="muted">
                  Share this while preparing.
                  <br />
                  Students can record after you enable the class and open a
                  question.
                </p>
              </section>
            </div>
            <section className="card results">
              <div className="section-title">
                <div>
                  <div className="eyebrow">LIVE PULSE</div>
                  <h2>Class responses</h2>
                </div>
                <select
                  aria-label="View question"
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
                  <span>Submitted</span>
                </div>
                <div>
                  <strong>
                    {
                      done.filter((r: any) => r.result?.level === "understood")
                        .length
                    }
                  </strong>
                  <span>
                    {question?.mode === "answer"
                      ? "Understood"
                      : "Pronunciation met"}
                  </span>
                </div>
                <div>
                  <strong>
                    {
                      done.filter((r: any) =>
                        ["partial", "not_yet"].includes(r.result?.level),
                      ).length
                    }
                  </strong>
                  <span>Needs follow-up</span>
                </div>
                <div>
                  <strong>{d.members.length - submitted.length}</strong>
                  <span>Not answered</span>
                </div>
              </div>
              {done.some((r: any) => r.result?.issue) && (
                <div className="insights">
                  <h3>Things to follow up</h3>
                  <ul>
                    {[
                      ...new Set(
                        done.map((r: any) => r.result?.issue).filter(Boolean),
                      ),
                    ]
                      .slice(0, 8)
                      .map((issue: any) => (
                        <li key={issue}>{issue}</li>
                      ))}
                  </ul>
                </div>
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
                  Retry incomplete assessments
                </button>
                {[
                  ["all", "All"],
                  ["missing", "Not answered"],
                  ["never", "Never submitted"],
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
                The list contains students who joined by QR code.
              </p>
              {audio && (
                <audio
                  controls
                  autoPlay
                  src={audio}
                  onError={() =>
                    setError("The playback link expired. Click Play again to request a new link.")
                  }
                />
              )}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Status</th>
                      <th>Score</th>
                      <th>Feedback and transcript</th>
                      <th>Audio</th>
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
                                  ? labels[r.result.level]
                                  : labels[r?.status] || "Not submitted"}
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
                                  Play
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
                                  Retry assessment
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
function Student({ code }: { code: string }) {
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
          <h2>Get ready to speak</h2>
          <label>
            Name
            <input
              required
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </label>
          <label>
            Student ID
            <input
              required
              maxLength={60}
              value={id}
              onChange={(e) => setId(e.target.value)}
            />
          </label>
          <p className="muted">
            Your recording is assessed by AI. Your teacher can review it; other
            students cannot see it.
          </p>
          <button disabled={busy || !info || info.status === "ended"}>
            Join class
          </button>
        </form>
      ) : (
        <>
          <p className="muted">
            {state?.member.name}, you have up to 10 seconds to speak.
          </p>
          {q ? (
            <Recorder
              key={q.id}
              q={q}
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
                  ? "This class has ended"
                  : "Ready. Waiting for the teacher to open a question"}
              </h2>
              <p>
                Keep this page open. The question will appear automatically.
              </p>
            </div>
          )}
          <section className="history">
            <h2>My responses</h2>
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
                    <h3>{labels[r.result?.level] || labels[r.status]}</h3>
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
                        ? "Transcript received."
                        : "Recording received; assessment in progress.")}
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
  call,
  response,
  onSubmitted,
  onRecording,
  onDiscard,
}: {
  q: any;
  call: (a: string, b?: any) => Promise<any>;
  response: any;
  onSubmitted: () => Promise<void>;
  onRecording: () => void;
  onDiscard: () => void;
}) {
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
        {q.mode === "answer" ? "Concept response" : "Pronunciation"} · up to 10
        seconds
      </span>
      <h2>{q.prompt}</h2>
      {submitted ? (
        <div className="received">
          ✓ Recording received
          <p>Your result will appear below automatically.</p>
        </div>
      ) : (
        <>
          <div className={"countdown " + (phase === "recording" ? "live" : "")}>
            <strong>{Math.ceil(left)}</strong>
            <span>sec</span>
          </div>
          {phase === "recording" ? (
            <button
              className="record-button stop"
              onClick={() => recorder.current?.stop()}
            >
              ■ Submit early
            </button>
          ) : phase === "retry" ? (
            <button
              className="record-button"
              onClick={() => pending && upload(pending)}
            >
              Upload this recording again
            </button>
          ) : (
            <button
              className="record-button"
              disabled={phase !== "idle"}
              onClick={start}
            >
              {phase === "permission"
                ? "Opening microphone…"
                : phase === "sending"
                  ? "Uploading…"
                  : "● Start recording"}
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
              Discard and continue
            </button>
          )}
          <p className="muted">
            The countdown starts when you press the button. It submits
            automatically at 10 seconds.
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
