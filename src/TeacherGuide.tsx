type Lang = "en" | "zh";
export function TeacherGuide({ lang }: { lang: Lang }) {
  const t = (en: string, zh: string) => (lang === "zh" ? zh : en);
  const sections = [
    {
      title: t("1. Sign in and create a class", "1. 登入並建立課堂"),
      items: [
        t(
          "Ask the administrator for your personal teacher access code. Open the website, paste the code, and choose Open workspace. No registration is needed.",
          "向管理員取得你的專屬老師登入碼。打開網站、貼上登入碼，按「進入備課」，不必另行註冊。",
        ),
        t(
          "Enter a New class name on the left, then choose Create class. Your classes and student responses are separate from other teachers’ workspaces.",
          "在左側「新課堂名稱」輸入班級或活動名稱，按「建立課堂」。你的課堂與學生答案會和其他老師分開。",
        ),
      ],
    },
    {
      title: t("2. Prepare a question", "2. 準備問題"),
      items: [
        t(
          "For Concept response, enter a question students can answer in one sentence. If AI feedback and scoring is enabled, add the answer points used for assessment. Students cannot see these points.",
          "選「概念作答」，輸入學生能用一句話回答的問題。開啟「AI 回饋及評分」時，填寫判斷答案的要點；學生不會看到這些要點。",
        ),
        t(
          "For open discussion, turn off AI feedback and scoring to keep transcripts without judging correctness. In the answer-points field, you can enter ‘Open discussion; no scoring’.",
          "開放討論可關閉「AI 回饋及評分」，只保留逐字稿，不判斷對錯。答案要點欄可填「開放討論，不評分」。",
        ),
        t(
          "For Pronunciation, enter the passage and the target language or pronunciation focus. Choose the response language, then Add to class. The saved question starts as a draft.",
          "選「朗讀發音」時，填指定朗讀內容，以及目標語言與發音重點。選好回應語言，按「存入課堂」；儲存後先是草稿。",
        ),
      ],
    },
    {
      title: t(
        "3. Invite students and open the question",
        "3. 讓學生加入並開放作答",
      ),
      items: [
        t(
          "Show the class QR code or share Copy join link. Students enter their name and student ID. They can join while the class is still being prepared.",
          "展示課堂 QR code，或按「複製加入連結」分享給學生。學生填姓名及學號即可加入；備課中也能先加入等待。",
        ),
        t(
          "Choose Enable class, then Open beside the question. Students press Start recording, speak for up to 10 seconds, and the recording is sent automatically. They can also submit early.",
          "先按「啟用課堂」，再按題目旁的「開放」。學生按「開始錄音」，最多說 10 秒，時間到自動送出，也能提前送出。",
        ),
        t(
          "Each student gets their own 10 seconds and one response per question. Close question stops new recordings; recordings already started can finish. End class when the activity is over.",
          "每位學生都有自己的 10 秒，每題作答一次。「收題」停止新的錄音，已開始的錄音仍可完成。活動結束後按「結束課堂」。",
        ),
      ],
    },
    {
      title: t("4. Add a follow-up during class", "4. 上課中快速追問"),
      items: [
        t(
          "Under Add a follow-up, choose Give a reason, Give an example, Agree or disagree, or Answer again. One click creates a new draft; choose Open when ready. Choose Edit first if you want to name a specific idea or example.",
          "在「快速加追問」選「補理由」「舉例子」「同意／不同意」或「重新回答」。點一下就建立新草稿，準備好再按「開放」；想指定要回應哪個觀點，可先按「編輯」。",
        ),
        t(
          "Each click creates a separate question, so students can answer again and earlier responses are kept. Templates follow the interface language and default to transcription only, without scoring.",
          "每次點擊都是獨立新題，學生可以再答一次，先前答案保留。範本跟隨中英文介面，預設只轉錄、不評分。",
        ),
      ],
    },
    {
      title: t(
        "5. Read the summary and discuss responses",
        "5. 看摘要，帶全班討論",
      ),
      items: [
        t(
          "Live responses shows who has submitted and who has not. Keep the teacher workspace open: when everyone who joined has submitted and processing has finished, the summary is generated automatically if auto-summary is enabled. You can also choose Summarize now earlier.",
          "「全班回應」可看誰已提交、誰還未答。保持老師工作台開著：開啟自動整理時，已加入者全部交齊且處理完成，就會產生摘要；也可提早按「立即整理」。",
        ),
        t(
          "Use the summary to compare ideas, identify points needing clarification, and choose a follow-up. Check the original words or audio before drawing conclusions. Unscored questions show views rather than a correctness rate.",
          "利用摘要比較觀點、找需要釐清的地方，再決定追問。下判斷前可核對原話或錄音；未評分的題目整理觀點，不顯示答對率。",
        ),
        t(
          "Select a response or draw one at random to present it. Presentation starts with names and AI feedback hidden; you can choose to show them. Press Esc to return. Prepare the display before projecting: the workspace itself contains student names, and returning from presentation reveals it again.",
          "可手選或隨機抽選答案展示。展示預設隱藏姓名與 AI 回饋，你可自行開啟，按 Esc 返回。投影前先準備好展示畫面：工作台本身有學生姓名，退出展示後也會再次出現。",
        ),
      ],
    },
    {
      title: t(
        "6. Save records and look after access",
        "6. 保存紀錄與管理使用權限",
      ),
      items: [
        t(
          "Download records exports a spreadsheet-friendly CSV. Delete class removes the class, student records, and recordings together; wait for processing to finish before deleting.",
          "「下載紀錄」會匯出可用試算表開啟的 CSV。「刪除課堂」會一併刪除課堂、學生紀錄及錄音；仍在處理時，先等處理完成。",
        ),
        t(
          "Keep your teacher access code private. Share only the student join link or QR code. If you lose the code or suspect it has been shared, ask the administrator to reset it. Sign out when using a shared computer.",
          "老師登入碼請自己保管，給學生的只有加入連結或 QR code。登入碼遺失或疑似外流時，請管理員重設；使用共用電腦後請登出。",
        ),
      ],
    },
  ];
  const faq = [
    [
      t("Students cannot record", "學生無法錄音"),
      t(
        "Check that the class is enabled and a question is open. Allow microphone access in the browser. If a messaging app’s built-in browser has trouble, open the link in Safari or Chrome. Test one recording on the actual device before class.",
        "確認已啟用課堂、開放題目，並允許瀏覽器使用麥克風。通訊軟體內建瀏覽器若無法錄音，可改用 Safari 或 Chrome 開啟連結；課前先用實際裝置試錄一題。",
      ),
    ],
    [
      t("An upload failed", "上傳失敗怎麼辦？"),
      t(
        "Choose Retry upload to send the same recording. Use the same browser tab; do not clear browser data. If an old recording blocks the next question, you can discard it, but that unsent recording will be lost.",
        "按「重新上傳這段錄音」重送原錄音，保留原本瀏覽器分頁，不要清除瀏覽資料。舊錄音卡住下一題時可捨棄，但尚未送出的那段錄音就會遺失。",
      ),
    ],
    [
      t("The summary has not appeared", "摘要還沒出現？"),
      t(
        "Some students may not have submitted, or recordings may still be processing. You can summarize available transcripts early. If processing failed, use Retry. The participant count covers only students who joined, not your full course roster.",
        "可能有人未交，或錄音仍在處理。你可以先整理已有逐字稿；處理失敗時按重試。人數只計算已加入者，不等於正式修課名單。",
      ),
    ],
    [
      t("What are the limits?", "有哪些限制？"),
      t(
        "Each class supports up to 150 students and 80 questions. AI provides an initial interpretation and can make mistakes. Recordings are stored until the class is manually deleted; there is no automatic expiry. Follow your institution’s requirements for informing students and retaining recordings.",
        "每課最多 150 位學生、80 題。AI 是初步判讀，也可能出錯。錄音沒有自動到期刪除，需手動刪除課堂；請依所屬機構要求告知學生並安排保存期限。",
      ),
    ],
  ];
  return (
    <main className="teacher-guide">
      <div className="eyebrow">TEN-SECOND CLASS · TEACHER GUIDE</div>
      <h1>{t("A quick guide for teachers", "老師使用說明")}</h1>
      <p className="guide-intro">
        {t(
          "Let every student speak for ten seconds, see their thinking, then ask the next question.",
          "讓每位學生說十秒，看見想法，再接著追問。",
        )}
      </p>
      <a className="guide-start" href="#">
        {t("Go to teacher sign-in →", "前往老師登入 →")}
      </a>
      <div className="guide-overview">
        {t(
          "Create a class → Add a question → Share the QR code → Enable class → Open question",
          "建立課堂 → 加入問題 → 分享 QR code → 啟用課堂 → 開放題目",
        )}
      </div>
      <div className="guide-sections">
        {sections.map((s) => (
          <section className="card" key={s.title}>
            <h2>{s.title}</h2>
            <ol>
              {s.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
      <section className="card guide-faq">
        <h2>{t("Common questions", "常見問題")}</h2>
        {faq.map(([q, a]) => (
          <details key={q}>
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </section>
    </main>
  );
}
