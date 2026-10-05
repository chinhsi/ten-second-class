import { useState } from "react";

export function TeacherAccess({
  call,
  lang,
}: {
  call: (action: string, data?: any) => Promise<any>;
  lang: "zh" | "en";
}) {
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [invitation, setInvitation] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    setTeachers(await call("teachers"));
  }
  return (
    <section className="teacher-access">
      <button
        className="secondary"
        disabled={busy}
        onClick={() => {
          if (open) {
            setOpen(false);
            setInvitation(null);
          } else
            void run(async () => {
              await refresh();
              setOpen(true);
            });
        }}
      >
        {t("Manage teacher access", "管理老師使用權限")}
      </button>
      {open && (
        <div className="access-panel">
          <h3>{t("Invite a teacher", "新增老師")}</h3>
          <p>
            {t(
              "Each teacher has a private workspace. Share their code privately; it gives access to their classes and recordings.",
              "每位老師都有自己的課堂。請私下傳送專屬登入碼，持有者可存取該老師的課堂及錄音。",
            )}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                const created = await call("create_teacher", { name });
                setInvitation(created);
                setCopied(false);
                setName("");
                await refresh();
              });
            }}
          >
            <label>
              {t("Teacher name", "老師姓名")}
              <input
                required
                maxLength={100}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <button disabled={busy}>
              {t("Create access code", "產生專屬登入碼")}
            </button>
          </form>
          {invitation && (
            <div className="invitation" role="status">
              <strong>{invitation.display_name}</strong>
              <p>
                {t(
                  "Copy now. This code is only shown once. If lost, generate a new code below.",
                  "請現在複製，登入碼只顯示這一次。遺失時可在下方重新產生。",
                )}
              </p>
              <label>
                {t("New access code", "新登入碼")}
                <input
                  readOnly
                  value={invitation.accessCode}
                  onFocus={(e) => e.target.select()}
                />
              </label>
              <button
                className="secondary"
                onClick={() =>
                  void run(async () => {
                    await navigator.clipboard.writeText(
                      `${t("Ten-second Class", "十秒課堂")}\n${location.origin}${location.pathname}\n${t("Access code", "登入碼")}: ${invitation.accessCode}`,
                    );
                    setCopied(true);
                  })
                }
              >
                {copied
                  ? t("Copied", "已複製")
                  : t("Copy login details", "複製登入資料")}
              </button>
              <button className="quiet" onClick={() => setInvitation(null)}>
                {t("Hide code", "隱藏登入碼")}
              </button>
            </div>
          )}
          {teachers.map((teacher) => (
            <div className="teacher-entry" key={teacher.id}>
              <strong>{teacher.display_name}</strong>
              <small>
                {teacher.active
                  ? t("Enabled", "可使用")
                  : t("Disabled", "已停用")}
              </small>
              <div className="actions">
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        t(
                          "Change access for this teacher? Disabling stops further teacher access; existing student classes stay as they are.",
                          "變更這位老師的使用權限？停用後老師無法繼續操作；現有學生課堂狀態不變。",
                        ),
                      )
                    )
                      return;
                    void run(async () => {
                      await call("teacher_status", {
                        id: teacher.id,
                        active: !teacher.active,
                      });
                      await refresh();
                    });
                  }}
                >
                  {teacher.active ? t("Disable", "停用") : t("Enable", "恢復")}
                </button>
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => {
                    if (
                      !confirm(
                        t(
                          "Generate a new code? The old code will stop working immediately.",
                          "重新產生登入碼？舊碼會立即失效。",
                        ),
                      )
                    )
                      return;
                    void run(async () => {
                      setInvitation(
                        await call("reset_teacher_key", { id: teacher.id }),
                      );
                      setCopied(false);
                    });
                  }}
                >
                  {t("New code", "重設登入碼")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
