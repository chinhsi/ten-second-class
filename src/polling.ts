// One automatic refresh at a time; hidden tabs do not spend API calls.
export function startVisiblePolling(
  refresh: () => Promise<unknown>,
  delay: () => number,
  immediate = true,
) {
  let stopped = false;
  let running = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const schedule = () => {
    clear();
    if (!stopped && !document.hidden) timer = setTimeout(tick, delay());
  };
  async function tick() {
    clear();
    if (stopped || running || document.hidden) return;
    running = true;
    try {
      await refresh();
    } catch {
      // Callers display the error. Keep polling so a transient outage can recover.
    } finally {
      running = false;
      schedule();
    }
  }
  const visibility = () => {
    clear();
    if (!document.hidden && !running) void tick();
  };
  document.addEventListener("visibilitychange", visibility);
  if (immediate) void tick();
  else schedule();
  return () => {
    stopped = true;
    clear();
    document.removeEventListener("visibilitychange", visibility);
  };
}

export function studentPollDelay(state: any): number {
  if (state?.responses?.some((r: any) => r.status === "processing"))
    return 3000;
  // Keep a slow check after class ends so a reopened class can still be detected.
  if (state?.class?.status === "ended") return 30000;
  const active = state?.questions?.find((q: any) => q.status === "active");
  if (
    !active ||
    state?.responses?.some(
      (r: any) =>
        r.question_id === active.id && ["done", "failed"].includes(r.status),
    )
  )
    return 10000;
  return 3000;
}
