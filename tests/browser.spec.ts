import { test, expect } from "@playwright/test";
const endpoint = "**/functions/v1/ten-second";
test("teacher can prepare class, save both modes and enable it", async ({
  page,
}) => {
  const cls = { id: "c", code: "ABC123", title: "課前準備", status: "draft" };
  const questions: any[] = [];
  await page.route(endpoint, async (route) => {
    const b = route.request().postDataJSON();
    let data: any = {};
    if (b.action === "classes") data = [cls];
    if (b.action === "dashboard")
      data = { questions, members: [], responses: [] };
    if (b.action === "save_question") {
      questions.push({ ...b, id: "q" + questions.length, status: "draft" });
      data = questions.at(-1);
    }
    if (b.action === "class_status") {
      cls.status = b.status;
      data = cls;
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/ten-second-class/");
  await page.getByLabel("管理密碼").fill("test");
  await page.getByRole("button", { name: "進入備課" }).click();
  await page.getByRole("button", { name: "課前準備 備課中" }).click();
  await page.getByLabel("問題", { exact: true }).fill("為什麼要查證？");
  await page.getByLabel("答案要點（學生看不到）").fill("可能錯誤");
  await page.getByRole("button", { name: "存入課堂" }).click();
  await expect(
    page.getByRole("button", { name: "開放", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "朗讀發音", exact: true }).click();
  await page.getByLabel("指定朗讀內容").fill("請先查證。");
  await page.getByLabel("目標語言與發音重點（學生看不到）").fill("普通話");
  await page.getByRole("button", { name: "存入課堂" }).click();
  await expect(
    page.getByRole("button", { name: "開放", exact: true }),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "啟用課堂 · Enable class" }).click();
  await expect(page.getByRole("button", { name: "結束課堂" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "開放", exact: true }).first(),
  ).toBeEnabled();
  await page.screenshot({
    path: "/private/tmp/ten-second-teacher.png",
    fullPage: true,
  });
});
test("student auto-stops at ten seconds and uploads a bounded WAV", async ({
  page,
}) => {
  let submitted: any = null;
  let questionStatus = "active";
  await page.route(endpoint, async (route) => {
    const b = route.request().postDataJSON();
    let data: any = {};
    if (b.action === "peek") data = { title: "概念檢查", status: "active" };
    if (b.action === "join") data = { id: "m", name: "小林" };
    if (b.action === "state")
      data = {
        class: { title: "概念檢查", status: "active" },
        member: { name: "小林" },
        questions: [
          {
            id: "q",
            mode: "answer",
            prompt: "為什麼要查證？",
            status: questionStatus,
          },
        ],
        responses: submitted
          ? [{ id: "r", question_id: "q", status: "processing" }]
          : [],
      };
    if (b.action === "start") data = { started_at: new Date().toISOString() };
    if (b.action === "submit") {
      submitted = b;
      data = { ok: true };
    }
    await route.fulfill({ json: data });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/ten-second-class/#join=ABC123");
  await page.getByLabel("姓名", { exact: true }).fill("小林");
  await page.getByLabel("學號").fill("123");
  await page.getByRole("button", { name: "加入課堂", exact: true }).click();
  await page.getByRole("button", { name: "開始錄音" }).click();
  await expect(page.getByRole("button", { name: "提早送出" })).toBeVisible();
  questionStatus = "closed"; // Switching questions must not cut off an ongoing recording.
  await expect.poll(() => submitted, { timeout: 20000 }).not.toBeNull();
  await expect(
    page.getByText("錄音已收到，正在評分。", { exact: true }),
  ).toBeVisible();
  expect(submitted).toBeTruthy();
  const wav = Buffer.from(submitted.audio, "base64");
  expect(wav.length).toBeLessThanOrEqual(320044);
  expect(wav.length).toBeGreaterThan(280000);
  expect(wav.readUInt32LE(24)).toBe(16000);
  await page.screenshot({
    path: "/private/tmp/ten-second-student.png",
    fullPage: true,
  });
});

test("teacher sees mixed statuses, filters missing students, retries and exports", async ({
  page,
}) => {
  const members = Array.from({ length: 5 }, (_, i) => ({
    id: "m" + i,
    name: "學生" + i,
    student_id: "S" + i,
  }));
  const responses = [
    {
      id: "r0",
      member_id: "m0",
      question_id: "q",
      status: "done",
      path: "a.wav",
      result: {
        score: 5,
        level: "understood",
        transcript: "AI 可能出錯",
        feedback: "理解正確",
      },
    },
    {
      id: "r1",
      member_id: "m1",
      question_id: "q",
      status: "failed",
      path: "b.wav",
    },
    {
      id: "r2",
      member_id: "m2",
      question_id: "q",
      status: "processing",
      path: "c.wav",
      submitted_at: "2026-01-01T00:00:00Z",
    },
    { id: "r3", member_id: "m3", question_id: "q", status: "recording" },
  ];
  const retried: string[] = [];
  await page.route(endpoint, async (route) => {
    const b = route.request().postDataJSON();
    let data: any = {};
    if (b.action === "classes")
      data = [{ id: "c", title: "混合狀態", code: "CODE", status: "active" }];
    if (b.action === "dashboard")
      data = {
        members,
        responses,
        questions: [
          { id: "q", prompt: "說明原因", mode: "answer", status: "active" },
        ],
      };
    if (b.action === "retry") {
      retried.push(b.id);
      data = { ok: true };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/ten-second-class/");
  await page.getByLabel("管理密碼").fill("test");
  await page.getByRole("button", { name: "進入備課" }).click();
  await page.getByRole("button", { name: "混合狀態 進行中" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(5);
  await expect(page.getByText("理解正確")).toBeVisible();
  await page.getByRole("button", { name: "本題未答", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "本堂尚未提交", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("button", { name: "重試全部未完成評分" }).click();
  await expect.poll(() => retried.length).toBe(2);
  expect(retried.sort()).toEqual(["r1", "r2"]);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下載紀錄" }).click();
  expect((await download).suggestedFilename()).toBe("混合狀態-作答紀錄.csv");
});
