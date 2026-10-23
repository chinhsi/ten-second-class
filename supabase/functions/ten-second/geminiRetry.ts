// Each assessment runs independently. Keep retries below the 90s reclaim window.
export async function geminiWithRetry(
  models: string[],
  request: (model: string, signal: AbortSignal) => Promise<Response>,
  options: {
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
    now?: () => number;
    attemptTimeoutMs?: number;
    budgetMs?: number;
    attempts?: number;
  } = {},
): Promise<Response> {
  const sleep =
    options.sleep ??
    ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const now = options.now ?? Date.now;
  const deadline = now() + (options.budgetMs ?? 70000);
  const attempts = options.attempts ?? 3;
  let lastError: unknown = new Error("AI unavailable");
  for (let attempt = 0; attempt < attempts; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0) throw lastError;
    let response: Response;
    try {
      response = await request(
        models[attempt % models.length],
        AbortSignal.timeout(
          Math.min(options.attemptTimeoutMs ?? 20000, remaining),
        ),
      );
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) throw error;
      await sleep(
        Math.min(
          1000 * 2 ** attempt + random() * 1000,
          Math.max(0, deadline - now()),
        ),
      );
      continue;
    }
    if (
      response.ok ||
      ![404, 408, 429, 500, 502, 503, 504].includes(response.status) ||
      attempt === attempts - 1
    )
      return response;
    const retryAfter = response.headers.get("retry-after");
    const seconds = retryAfter === null ? NaN : Number(retryAfter);
    const headerDelay = Number.isFinite(seconds)
      ? seconds * 1000
      : retryAfter
        ? Date.parse(retryAfter) - now()
        : 0;
    // Google also returns RetryInfo in the JSON error, often without an HTTP header.
    const body = await response
      .clone()
      .json()
      .catch(() => ({}));
    const retryInfo = body.error?.details?.find((d: any) =>
      String(d["@type"]).endsWith("RetryInfo"),
    );
    const apiDelay = parseFloat(retryInfo?.retryDelay ?? "0") * 1000;
    const delay = Math.max(
      1000 * 2 ** attempt + random() * 1000,
      headerDelay || 0,
      apiDelay || 0,
    );
    if (delay + 1000 >= deadline - now()) return response;
    await response.body?.cancel();
    await sleep(delay);
  }
  throw lastError;
}
