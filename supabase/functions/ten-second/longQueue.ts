import { validateWav } from "./recordingLimits.ts";
// Calls are authenticated with the existing server-only service key. No new
// credential is exposed to students or included in responses/logs.
export function longQueue(
  db: any,
  assess: (id: string, q: any, bytes: Uint8Array, at: string) => Promise<void>,
) {
  const endpoint = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ten-second`;
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  async function wake() {
    await Promise.all(
      Array.from({ length: 4 }, async () => {
        const claim = await db.rpc("ts_claim_long_response");
        if (claim.error) {
          console.error("Long queue claim failed");
          return;
        }
        const r = claim.data?.[0];
        if (!r) return;
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${key}`,
            },
            body: JSON.stringify({
              action: "process_long",
              id: r.id,
              workerToken: r.worker_token,
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) throw Error("Worker did not accept job");
          await response.body?.cancel();
        } catch {
          // A lost acknowledgement may still have started the worker. Do not
          // resend; its 180-second lease enables safe manual recovery later.
          console.error("Long queue dispatch not acknowledged");
        }
      }),
    );
  }
  async function run(id: string, token: string) {
    const claimed = await db
      .from("ts_responses")
      .update({ worker_started_at: new Date().toISOString() })
      .eq("id", id)
      .eq("worker_token", token)
      .eq("status", "processing")
      .is("worker_started_at", null)
      .select()
      .maybeSingle();
    const r = claimed.data;
    if (claimed.error || !r) return;
    try {
      const question = await db
        .from("ts_questions")
        .select("*")
        .eq("id", r.question_id)
        .single();
      if (question.error || question.data.max_seconds !== 120)
        throw Error("Long question unavailable");
      const file = await db.storage.from("ten-second-audio").download(r.path);
      if (file.error || !file.data) throw Error("Saved recording unavailable");
      const bytes = new Uint8Array(await file.data.arrayBuffer());
      validateWav(bytes, 120);
      await assess(r.id, question.data, bytes, r.submitted_at);
    } catch {
      await db
        .from("ts_responses")
        .update({
          status: "failed",
          debug_error: "Long recording worker failed",
          result: {
            feedback: "錄音已保存，處理未完成；老師可重試，學生不用重錄。",
          },
        })
        .eq("id", r.id)
        .eq("status", "processing")
        .eq("worker_token", token);
    } finally {
      await wake();
    }
  }
  return { wake, run };
}
