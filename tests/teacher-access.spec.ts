import { test, expect } from "@playwright/test";
const endpoint = "**/functions/v1/ten-second";
test("administrator creates and revokes access; sign-out clears previous workspace", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem("ts-language", "zh"));
  const teachers: any[] = [];
  const actions: any[] = [];
  await page.route(endpoint, async (route) => {
    const b = route.request().postDataJSON();
    actions.push(b);
    let data: any = {};
    if (b.action === "teacher_profile") data = { admin: b.owner === "admin" };
    if (b.action === "classes")
      data =
        b.owner === "admin"
          ? [{ id: "legacy", title: "原課堂", status: "draft" }]
          : [];
    if (b.action === "dashboard")
      data = { questions: [], members: [], responses: [] };
    if (b.action === "teachers") data = teachers;
    if (b.action === "create_teacher") {
      const teacher = { id: "A", display_name: b.name, active: true };
      teachers.push(teacher);
      data = { ...teacher, accessCode: "personal-teacher-code" };
    }
    if (b.action === "teacher_status") {
      teachers[0].active = b.active;
      data = teachers[0];
    }
    if (b.action === "reset_teacher_key")
      data = { ...teachers[0], accessCode: "replacement-code" };
    await route.fulfill({ json: data });
  });
  await page.goto("/ten-second-class/");
  await page.getByLabel("老師登入碼／管理密碼").fill("admin");
  await page.getByRole("button", { name: "進入備課" }).click();
  await page.getByRole("button", { name: "原課堂 備課中" }).click();
  await page.getByRole("button", { name: "管理老師使用權限" }).click();
  await page.getByLabel("老師姓名").fill("陳老師");
  await page.getByRole("button", { name: "產生專屬登入碼" }).click();
  await expect(page.getByLabel("新登入碼")).toHaveValue(
    "personal-teacher-code",
  );
  page.on("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "停用", exact: true }).click();
  await expect(page.getByText("已停用", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重設登入碼" }).click();
  await expect(page.getByLabel("新登入碼")).toHaveValue("replacement-code");
  await page.getByRole("button", { name: "登出", exact: true }).click();
  await page.getByLabel("老師登入碼／管理密碼").fill("other-teacher");
  await page.getByRole("button", { name: "進入備課" }).click();
  await expect(
    page.getByRole("button", { name: "管理老師使用權限" }),
  ).toHaveCount(0);
  await expect(page.getByText("原課堂", { exact: true })).toHaveCount(0);
  expect(
    actions.filter(
      (b) => b.owner === "other-teacher" && b.action === "dashboard",
    ),
  ).toHaveLength(0);
});
