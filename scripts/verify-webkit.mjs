// Tests WebKit's real MP4/AAC decoder and production WAV conversion, not microphone capture.
import { webkit, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
execFileSync("ffmpeg", [
  "-loglevel",
  "error",
  "-y",
  "-f",
  "lavfi",
  "-i",
  "sine=frequency=440:duration=10.5",
  "-c:a",
  "aac",
  "/private/tmp/ten-second-webkit.m4a",
]);
const browser = await webkit.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto("http://127.0.0.1:5179/ten-second-class/");
  const data = readFileSync("/private/tmp/ten-second-webkit.m4a").toString(
    "base64",
  );
  const result = await page.evaluate(async (data) => {
    const { recordingToWav } = await import("/ten-second-class/src/audio.ts");
    const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
    const wav = await recordingToWav(new Blob([bytes], { type: "audio/mp4" }));
    const v = new DataView(await wav.arrayBuffer());
    let energy = 0;
    for (let i = 44; i < v.byteLength; i += 2)
      energy += (v.getInt16(i, true) / 32768) ** 2;
    return {
      wav_bytes: v.byteLength,
      sample_rate: v.getUint32(24, true),
      seconds: (v.byteLength - 44) / 32000,
      rms: Math.sqrt(energy / ((v.byteLength - 44) / 2)),
    };
  }, data);
  expect(result.wav_bytes).toBe(320044);
  expect(result.sample_rate).toBe(16000);
  expect(result.rms).toBeGreaterThan(0.01);
  const report = {
    date: new Date().toISOString(),
    engine: "WebKit " + browser.version(),
    scope:
      "Decode synthesized AAC/MP4 and convert using production recordingToWav; 10.5 seconds trimmed to 10. No microphone capture tested.",
    ...result,
    passed: true,
  };
  console.log(report);
  writeFileSync(
    "reviews/webkit-decoding.json",
    JSON.stringify(report, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
