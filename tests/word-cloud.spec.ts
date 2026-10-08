import { test, expect } from "@playwright/test";
test("open-ended word cloud counts responses, shows anonymous evidence, and projects without AI requests", async ({
  page,
}) => {
  let aiCalls = 0;
  await page.addInitScript(() => localStorage.setItem("ts-language", "zh"));
  await page.route("**/functions/v1/ten-second", async (route) => {
    const b = route.request().postDataJSON();
    let data: any = {};
    if (b.action === "classes")
      data = [{ id: "c", title: "文字雲測試", status: "active", code: "TEST" }];
    if (b.action === "dashboard")
      data = {
        questions: [
          {
            id: "q",
            mode: "answer",
            prompt: "今天最有收穫的是什麼？",
            feedback_enabled: false,
            status: "active",
          },
        ],
        members: [
          { id: "m1", name: "PRIVATE ALICE" },
          { id: "m2", name: "PRIVATE BOB" },
          { id: "m3", name: "NOT SUBMITTED" },
        ],
        responses: [
          {
            id: "r1",
            member_id: "m1",
            question_id: "q",
            status: "done",
            result: {
              level: "transcribed",
              transcript: "AI AI Google Sheets 批判思考 課程設計",
            },
          },
          {
            id: "r2",
            member_id: "m2",
            question_id: "q",
            status: "done",
            result: {
              level: "transcribed",
              transcript: "Google Sheet and AI. 創意 反思 回饋 合作 學生 教學",
            },
          },
        ],
        summaries: [],
      };
    if (b.action === "summarize") aiCalls++;
    await route.fulfill({ json: data });
  });
  await page.goto("/ten-second-class/");
  await page.getByLabel("管理密碼").fill("test");
  await page.getByRole("button", { name: "進入備課" }).click();
  await page.getByRole("button", { name: "文字雲測試 進行中" }).click();
  const section = page.getByRole("region", { name: "文字雲總結" });
  await expect(
    section.getByRole("button", { name: "AI：2 份回答", exact: true }),
  ).toBeVisible();
  await expect(
    section.getByRole("button", {
      name: "Google Sheets：2 份回答",
      exact: true,
    }),
  ).toBeVisible();
  await section
    .getByRole("button", { name: "AI：2 份回答", exact: true })
    .click();
  await expect(page.locator(".evidence-list")).toContainText("回答 1");
  await expect(page.locator(".evidence-list")).not.toContainText("PRIVATE");
  await section.getByRole("button", { name: "投影文字雲" }).click();
  const dialog = page.getByRole("dialog", { name: "文字雲投影" });
  await expect(dialog).toBeVisible();
  await expect(dialog).not.toContainText("PRIVATE");
  await page.screenshot({
    path: "/private/tmp/ten-second-wordcloud-desktop.png",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: "/private/tmp/ten-second-wordcloud-mobile.png",
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(aiCalls).toBe(0);
  await page.getByRole("button", { name: "English", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Present word cloud" }),
  ).toBeVisible();
});
