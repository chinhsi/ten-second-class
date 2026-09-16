import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests",
  timeout: 35000,
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:5179",
    headless: true,
    launchOptions: {
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      args: [
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
    },
    permissions: ["microphone"],
  },
});
