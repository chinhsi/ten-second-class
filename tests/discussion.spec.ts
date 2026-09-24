import { test, expect } from "@playwright/test";
test("summary waits for processing, updates once, and presents anonymously without repeated draws", async ({
  page,
}) => {
  const members = [
    { id: "m1", name: "Alice", student_id: "S1" },
    { id: "m2", name: "Bob", student_id: "S2" },
  ];
  const questions = [
    {
      id: "q",
      prompt: "Why verify an AI answer?",
      rubric: "AI can invent facts",
      mode: "answer",
      status: "active",
      feedback_enabled: true,
    },
  ];
  const responses: any[] = [
    {
      id: "r1",
      question_id: "q",
      member_id: "m1",
      status: "done",
      path: "a.wav",
      result: {
        level: "understood",
        score: 5,
        transcript: "AI may invent facts.",
        feedback: "Well explained.",
      },
    },
    {
      id: "r2",
      question_id: "q",
      member_id: "m2",
      status: "processing",
      path: "b.wav",
    },
  ];
  let calls = 0;
  const summaries: any[] = [];
  await page.route("**/functions/v1/ten-second", async (route) => {
    const b = route.request().postDataJSON();
    let data: any = {};
    if (b.action === "classes")
      data = [
        { id: "c", title: "Discussion test", status: "active", code: "ABC" },
      ];
    if (b.action === "dashboard")
      data = { members, questions, responses, summaries };
    if (b.action === "summarize") {
      calls++;
      data = {
        question_id: "q",
        language: b.language,
        status: "done",
        started_at: new Date().toISOString(),
        result: {
          overview: "Students question AI reliability.",
          themes: [
            {
              title: "Reliability",
              detail: "AI may invent facts.",
              response_ids: ["r1"],
              count: 1,
            },
          ],
          gaps: [
            {
              title: "Explain why",
              detail: "A reason is missing.",
              response_ids: ["r2"],
              count: 1,
              follow_up: "What could go wrong?",
            },
          ],
          next_question: "How could we verify one claim?",
          snapshot: structuredClone(responses),
          member_count: members.length,
          response_ids: responses.map((r) => r.id),
        },
      };
      summaries.splice(0, summaries.length, data);
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/ten-second-class/");
  await page.getByLabel("Owner key").fill("test");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByRole("button", { name: "Discussion test Live" }).click();
  await expect(
    page.getByText("Everyone who joined has submitted"),
  ).toBeVisible();
  await expect(
    page.getByText("1 processing · 0 need retry · 0 unclear"),
  ).toBeVisible();
  expect(calls).toBe(0);
  responses[1].status = "done";
  responses[1].result = {
    level: "partial",
    score: 2,
    transcript: "It needs checking.",
    feedback: "Explain why.",
  };
  await expect.poll(() => calls, { timeout: 10000 }).toBe(1);
  await expect(
    page.getByText("1 of 2 assessed responses meet the answer points"),
  ).toBeVisible();
  await expect(
    page.getByText("Students question AI reliability."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Draw & present" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText("Alice");
  await expect(dialog).not.toContainText("Bob");
  await expect(dialog).not.toContainText("Well explained.");
  const first = await dialog.locator("blockquote").innerText();
  await dialog.getByRole("button", { name: "Draw next" }).click();
  expect(await dialog.locator("blockquote").innerText()).not.toBe(first);
  await expect(
    dialog.getByRole("button", { name: "Draw next" }),
  ).toBeDisabled();
  await page.screenshot({
    path: "/private/tmp/ten-second-discussion-presentation.png",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "Reset draw history" }).click();
  await expect(
    page.getByRole("button", { name: "Draw & present (2)" }),
  ).toBeEnabled();
  await page.getByLabel("Show student name").check();
  await page.getByLabel("Show AI feedback").check();
  await page.getByLabel("Choose an answer").selectOption("r1");
  await page.getByRole("button", { name: "Present selected" }).click();
  await expect(dialog).toContainText("Alice");
  await expect(dialog).toContainText("Well explained.");
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "View supporting answers" })
    .first()
    .click();
  await expect(page.locator(".evidence-list")).toContainText(
    "AI may invent facts.",
  );
  await page.screenshot({
    path: "/private/tmp/ten-second-discussion-summary.png",
    fullPage: true,
  });
  expect(calls).toBe(1);
  // A late joiner makes the existing summary visibly stale; no automatic partial summary.
  members.push({ id: "m3", name: "Cara", student_id: "S3" });
  await expect(
    page.getByText(
      "New or changed responses: update this summary before discussing it.",
    ),
  ).toBeVisible({ timeout: 10000 });
  expect(calls).toBe(1);
  responses.push({
    id: "r3",
    question_id: "q",
    member_id: "m3",
    status: "done",
    path: "c.wav",
    result: {
      level: "understood",
      score: 5,
      transcript: "Check against reliable sources.",
    },
  });
  await expect.poll(() => calls, { timeout: 10000 }).toBe(2);
});
test("transcript-only question has no correctness rate and manual summary can retry", async ({
  page,
}) => {
  let calls = 0;
  await page.route("**/functions/v1/ten-second", async (route) => {
    const b = route.request().postDataJSON();
    let data: any = {};
    if (b.action === "classes")
      data = [{ id: "c", title: "Open views", status: "active", code: "ABC" }];
    if (b.action === "dashboard")
      data = {
        questions: [
          {
            id: "q",
            prompt: "Your view?",
            mode: "answer",
            feedback_enabled: false,
            status: "active",
          },
        ],
        members: [
          { id: "m", name: "Student" },
          { id: "m2", name: "Absent" },
        ],
        responses: [
          {
            id: "r",
            member_id: "m",
            question_id: "q",
            status: "done",
            result: {
              level: "transcribed",
              transcript: "My own view.",
              score: null,
            },
          },
        ],
        summaries: [],
      };
    if (b.action === "summarize") {
      calls++;
      await route.fulfill({
        status: 502,
        json: { error: "Summary unavailable" },
      });
      return;
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/ten-second-class/");
  await page.getByLabel("Owner key").fill("test");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByRole("button", { name: "Open views Live" }).click();
  await expect(
    page.getByText("Scoring is off.", { exact: false }),
  ).toBeVisible();
  await expect(page.locator(".understanding-line")).toHaveCount(0);
  await page.getByRole("button", { name: "Summarize now" }).click();
  await expect(page.getByRole("alert")).toContainText("Summary unavailable");
  await page.getByRole("button", { name: "Summarize now" }).click();
  await expect.poll(() => calls).toBe(2);
  await page.getByRole("button", { name: "中文", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "隨機抽選並展示 (1)" }),
  ).toBeEnabled();
});
