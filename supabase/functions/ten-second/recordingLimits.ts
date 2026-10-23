export const LONG_SECONDS = 120;
export const LONG_RETRY_MS = 180_000;
export function recordingSeconds(q: { max_seconds?: number }): number {
  return q.max_seconds === LONG_SECONDS ? LONG_SECONDS : 10;
}
export function wavByteLimit(seconds: number): number {
  return 44 + seconds * 32000;
}
export function validateWav(bytes: Uint8Array, seconds: number) {
  if (
    bytes.length < 8044 ||
    bytes.length > wavByteLimit(seconds) ||
    bytes.length % 2
  )
    throw Error(`錄音格式無效，需0.25至${seconds}秒`);
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (a: number, n: number) =>
    new TextDecoder().decode(bytes.subarray(a, a + n));
  if (
    v.getUint32(4, true) + 8 !== bytes.length ||
    v.getUint32(28, true) !== 32000 ||
    v.getUint16(32, true) !== 2 ||
    ascii(0, 4) !== "RIFF" ||
    ascii(8, 4) !== "WAVE" ||
    ascii(12, 4) !== "fmt " ||
    ascii(36, 4) !== "data" ||
    v.getUint32(16, true) !== 16 ||
    v.getUint16(20, true) !== 1 ||
    v.getUint16(22, true) !== 1 ||
    v.getUint32(24, true) !== 16000 ||
    v.getUint16(34, true) !== 16 ||
    v.getUint32(40, true) !== bytes.length - 44
  )
    throw Error("錄音格式無效");
}
