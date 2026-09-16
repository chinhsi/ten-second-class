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
            status: "active",
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
  await expect(page.getByText("已收到你的錄音", { exact: false })).toBeVisible({
    timeout: 20000,
  });
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
