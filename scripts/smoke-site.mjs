import { chromium } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const owner = execFileSync(
  "security",
  ["find-generic-password", "-s", "supabase-interact-owner-key", "-w"],
  { encoding: "utf8" },
).trim();
const c = JSON.parse(
  readFileSync("/private/tmp/ten-second-demo-class.json", "utf8"),
);
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("https://chinhsi.github.io/ten-second-class/");
  await page.getByLabel("管理密碼").fill(owner);
  await page.getByRole("button", { name: "進入備課" }).click();
  await page.getByRole("button", { name: new RegExp(c.title) }).click();
  await page.getByRole("heading", { name: "全班回應" }).waitFor();
  await page.getByText("學生加入後，就會出現在這裡。").waitFor();
  await page.screenshot({
    path: "/private/tmp/ten-second-live.png",
    fullPage: true,
  });
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS published site login, real Supabase dashboard, prepared draft, no browser errors",
  );
} finally {
  await browser.close();
}
