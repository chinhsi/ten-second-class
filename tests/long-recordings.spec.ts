import { test, expect } from "@playwright/test";
const endpoint = "**/functions/v1/ten-second";
test("two-minute WAV survives IndexedDB, reload and lost upload acknowledgement", async ({
  page,
}) => {
  let received = false,
    confirmations = 0,
    uploads = 0;
  await page.addInitScript(() => {
    localStorage.setItem("ts-language", "zh");
    localStorage.setItem("ts-joined-LONG", "yes");
    localStorage.setItem("ts-token-LONG", "a".repeat(64));
  });
  await page.route(endpoint, async (route) => {
    const b = route.request().postDataJSON();
    let data: any = {};
    if (b.action === "peek") data = { title: "兩分鐘測試", status: "active" };
    if (b.action === "state")
      data = {
        class: { title: "兩分鐘測試", status: "active" },
        member: { name: "測試" },
        questions: [
          {
            id: "long-q",
            max_seconds: 120,
            mode: "answer",
            prompt: "完整回答",
            status: "active",
          },
        ],
        responses: received
          ? [{ id: "r", question_id: "long-q", status: "queued" }]
          : [],
      };
    if (b.action === "upload_ticket")
      data = { signedUrl: "http://127.0.0.1:5179/test-upload" };
    if (b.action === "submit_saved") {
      confirmations++;
      if (confirmations === 1) {
        await route.fulfill({
          status: 500,
          json: { error: "temporary failure" },
        });
        return;
      }
      received = true;
      data = { ok: true };
    }
    await route.fulfill({ json: data });
  });
  await page.route("**/test-upload", async (route) => {
    uploads++;
    expect(route.request().postDataBuffer()?.length).toBe(3840044);
    await route.fulfill({ status: uploads === 1 ? 200 : 409, json: {} });
  });
  await page.goto("/ten-second-class/#join=LONG");
  await expect(
    page.getByText("最多 120 秒", { exact: false }).last(),
  ).toBeVisible();
  const size = await page.evaluate(async () => {
    const { recordingToWav } = await import("/ten-second-class/src/audio.ts");
    const { saveRecording, loadRecording } =
      await import("/ten-second-class/src/recordingStore.ts");
    const n = 120 * 16000;
    const a = new ArrayBuffer(44 + n * 2);
    const v = new DataView(a);
    const text = (i: number, s: string) =>
      [...s].forEach((c, j) => v.setUint8(i + j, c.charCodeAt(0)));
    text(0, "RIFF");
    v.setUint32(4, 36 + n * 2, true);
    text(8, "WAVE");
    text(12, "fmt ");
    v.setUint32(16, 16, true);
    v.setUint16(20, 1, true);
    v.setUint16(22, 1, true);
    v.setUint32(24, 16000, true);
    v.setUint32(28, 32000, true);
    v.setUint16(32, 2, true);
    v.setUint16(34, 16, true);
    text(36, "data");
    v.setUint32(40, n * 2, true);
    // Distinct ending samples prove the final second was not truncated.
    for (let i = n - 16000; i < n; i++) v.setInt16(44 + i * 2, 1000, true);
    const wav = await recordingToWav(new Blob([a], { type: "audio/wav" }), 120);
    await saveRecording("long-q", wav);
    sessionStorage.setItem("ts-recording-long-q", "idb");
    const restored = await loadRecording("long-q");
    const bytes = await restored!.arrayBuffer();
    return {
      size: bytes.byteLength,
      last: new DataView(bytes).getInt16(bytes.byteLength - 2, true),
    };
  });
  expect(size.size).toBe(3840044);
  expect(size.last).toBeGreaterThan(900);
  await page.reload();
  await page.getByRole("button", { name: "重新上傳這段錄音" }).click();
  await expect(page.getByRole("alert")).toContainText("temporary failure");
  await page.reload();
  await page.getByRole("button", { name: "重新上傳這段錄音" }).click();
  await expect(page.getByText("已保存・排隊中", { exact: true })).toBeVisible();
  expect(uploads).toBe(2);
  expect(confirmations).toBe(2);
  const pending = await page.evaluate(async () => {
    const { loadRecording } =
      await import("/ten-second-class/src/recordingStore.ts");
    return !!(await loadRecording("long-q"));
  });
  expect(pending).toBe(false);
});
