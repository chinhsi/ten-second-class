import {
  recordingVersion,
  recordingFile,
  matchVersion,
} from "./recordingVersion.ts";
import { assessmentRequest } from "./assessmentRequest.ts";
import {
  recordingSeconds,
  validateWav,
  LONG_RETRY_MS,
} from "./recordingLimits.ts";
import { longQueue } from "./longQueue.ts";
import { assessmentWithFallback } from "./assessmentProviders.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.8";
import { generateSummary } from "./summary.ts";
import { teacherActions, canAccessTeacherResource } from "./teacherAccess.ts";
const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, authorization, apikey",
  "Content-Type": "application/json",
};
const reply = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers });
const hash = async (s: string) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
function check<T>(r: { data: T; error: unknown }): T {
  if (r.error) {
    const message = (r.error as { message?: string }).message || "";
    if (message.startsWith("本課堂已達")) throw Error(message);
    throw new Error("資料儲存失敗，請重試");
  }
  return r.data;
}
function str(x: unknown, max = 1000) {
  if (typeof x !== "string" || !x.trim() || x.length > max)
    throw new Error("請填寫有效內容");
  return x.trim();
}
async function assess(
  id: string,
  q: any,
  bytes: Uint8Array,
  submittedAt: string,
) {
  try {
    check(
      await db
        .from("ts_responses")
        .update({
          ai_started_at: new Date().toISOString(),
          processing_completed_at: null,
          provider_attempts: null,
        })
        .eq("id", id)
        .eq("status", "processing")
        .eq("submitted_at", submittedAt),
    );
    const pcm = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let energy = 0,
      peak = 0;
    for (let i = 44; i < bytes.length; i += 2) {
      const value = pcm.getInt16(i, true) / 32768;
      energy += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    if (
      Math.sqrt(energy / ((bytes.length - 44) / 2)) < 0.0005 &&
      peak < 0.003
    ) {
      check(
        await db
          .from("ts_responses")
          .update({
            status: "done",
            debug_error: null,
            processing_completed_at: new Date().toISOString(),
            result: {
              transcript: "",
              score: null,
              level: "unscorable",
              feedback: "沒有收到清楚的聲音，請檢查麥克風並告知老師。",
              issue: "收音不足",
            },
          })
          .eq("id", id)
          .eq("status", "processing")
          .eq("submitted_at", submittedAt),
      );
      return;
    }
    const key = Deno.env.get("GEMINI_API_KEY");

    const model =
      Deno.env.get("TEN_SECOND_MODEL") ||
      Deno.env.get("GEMINI_REALTIME_MODEL") ||
      "gemini-3.7-flash";
    const { result, attempts } = await assessmentWithFallback({
      googleKey: key,
      googleModel: model,
      openrouterKey: Deno.env.get("TEN_SECOND_OPENROUTER_API_KEY"),
      openrouterModel: Deno.env.get("TEN_SECOND_OPENROUTER_MODEL"),
      body: assessmentRequest(q, bytes),
    });
    console.info(
      "assessment_route",
      JSON.stringify({ response_id: id, attempts }),
    );
    if (q.mode === "answer" && q.feedback_enabled === false) {
      result.level = "transcribed";
      result.score = null;
      result.feedback = "";
      result.issue = "";
    } else if (!result.feedback.trim())
      result.feedback =
        result.level === "understood"
          ? "本題已達標，請繼續保持。"
          : result.level === "unscorable"
            ? "收音不足，請檢查麥克風並告知老師。"
            : "請對照題目再想一想，並與老師確認需要改進的地方。";
    if (result.level === "unscorable" || result.level === "transcribed")
      result.score = null;
    else if (
      !Number.isInteger(result.score) ||
      result.score < 0 ||
      result.score > 5
    )
      throw Error("分數無效");
    check(
      await db
        .from("ts_responses")
        .update({
          status: "done",
          result,
          debug_error: null,
          processing_completed_at: new Date().toISOString(),
          provider_attempts: attempts,
        })
        .eq("id", id)
        .eq("status", "processing")
        .eq("submitted_at", submittedAt),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "AI failed";
    const feedback = message.includes("AI HTTP 429")
      ? "錄音已保存。Google AI 請求量或配額已達上限，暫時無法處理；請老師稍後重試，若持續發生需檢查 AI 配額。"
      : /AI HTTP 50[0234]/.test(message)
        ? "錄音已保存。Google AI 目前忙碌，自動重試後仍未完成；請老師稍後重試。"
        : /timed? ?out|timeout/i.test(message)
          ? "錄音已保存。AI 回應逾時，自動重試後仍未完成；請老師稍後重試。"
          : "錄音已保存，AI 處理未完成。老師可重試，學生不必重新錄音。";
    await db
      .from("ts_responses")
      .update({
        status: "failed",
        processing_completed_at: new Date().toISOString(),
        provider_attempts: (e as any)?.attempts || null,
        debug_error: message,
        result: { feedback },
      })
      .eq("id", id)
      .eq("status", "processing")
      .eq("submitted_at", submittedAt);
  }
}
const queue = longQueue(db, assess);
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers });
  if (req.method !== "POST") return reply({ error: "僅接受 POST" }, 405);
  try {
    if (Number(req.headers.get("content-length")) > 900000)
      return reply({ error: "錄音過大" }, 413);
    const text = await req.text();
    if (text.length > 900000) return reply({ error: "錄音過大" }, 413);
    const b = JSON.parse(text),
      action = b.action;
    if (action === "process_long") {
      if (
        req.headers.get("authorization") !==
        `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`
      )
        return reply({ error: "Unauthorized" }, 401);
      EdgeRuntime.waitUntil(queue.run(str(b.id, 40), str(b.workerToken, 40)));
      return reply({ ok: true });
    }
    const owner =
      typeof b.owner === "string" &&
      !!Deno.env.get("INTERACT_OWNER_KEY") &&
      (await hash(b.owner)) ===
        (await hash(Deno.env.get("INTERACT_OWNER_KEY")!));
    const adminActions = [
      "teachers",
      "create_teacher",
      "teacher_status",
      "teacher_recording_access",
      "reset_teacher_key",
    ];
    let teacherId: string | null = null;
    let allowLongRecordings = owner;
    if (adminActions.includes(action) && !owner)
      return reply(
        { error: "需要管理員權限 / Administrator access required" },
        403,
      );
    if (teacherActions.includes(action) || action === "teacher_profile") {
      if (!owner) {
        const teacher =
          typeof b.owner === "string" && b.owner.length <= 200
            ? check(
                await db
                  .from("ts_teachers")
                  .select("id,display_name,allow_long_recordings")
                  .eq("key_hash", await hash(b.owner))
                  .eq("active", true)
                  .maybeSingle(),
              )
            : null;
        if (!teacher) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          return reply(
            { error: "登入碼無效或已停用 / Invalid or disabled access code" },
            401,
          );
        }
        teacherId = teacher.id;
        allowLongRecordings = teacher.allow_long_recordings === true;
      }
      if (action === "teacher_profile")
        return reply({ admin: owner, id: teacherId, allowLongRecordings });
      if (!(await canAccessTeacherResource(db, action, b, teacherId)))
        return reply({ error: "無法存取此課堂 / Class unavailable" }, 403);
    }
    if (action === "teachers")
      return reply(
        check(
          await db
            .from("ts_teachers")
            .select("id,display_name,active,created_at,allow_long_recordings")
            .order("created_at", { ascending: false }),
        ),
      );
    if (action === "create_teacher" || action === "reset_teacher_key") {
      const accessCode =
        crypto.randomUUID().replaceAll("-", "") +
        crypto.randomUUID().replaceAll("-", "");
      const key_hash = await hash(accessCode);
      const result =
        action === "create_teacher"
          ? await db
              .from("ts_teachers")
              .insert({ display_name: str(b.name, 100), key_hash })
              .select("id,display_name,active")
              .single()
          : await db
              .from("ts_teachers")
              .update({ key_hash })
              .eq("id", str(b.id, 40))
              .select("id,display_name,active")
              .single();
      return reply({ ...check(result), accessCode });
    }
    if (action === "teacher_recording_access") {
      if (typeof b.allowed !== "boolean")
        throw Error("Invalid recording permission");
      return reply(
        check(
          await db
            .from("ts_teachers")
            .update({ allow_long_recordings: b.allowed })
            .eq("id", str(b.id, 40))
            .select("id,allow_long_recordings")
            .single(),
        ),
      );
    }
    if (action === "teacher_status") {
      if (typeof b.active !== "boolean") throw Error("Invalid status");
      return reply(
        check(
          await db
            .from("ts_teachers")
            .update({ active: b.active })
            .eq("id", str(b.id, 40))
            .select("id,display_name,active")
            .single(),
        ),
      );
    }
    if (action === "delete_class") {
      const id = str(b.classId, 40);
      if (!/^[a-f0-9-]{36}$/.test(id)) throw Error("課堂資料不正確");
      async function collect(prefix: string): Promise<string[]> {
        const paths: string[] = [];
        for (let offset = 0; ; offset += 100) {
          const files = check(
            await db.storage
              .from("ten-second-audio")
              .list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } }),
          );
          for (const f of files) {
            const path = prefix + "/" + f.name;
            if (f.id) paths.push(path);
            else paths.push(...(await collect(path)));
          }
          if (files.length < 100) break;
        }
        return paths;
      }
      const prepared = await db.rpc("ts_prepare_class_delete", { target: id });
      if (prepared.error?.code === "P0001")
        throw Error("仍有錄音在處理，未刪除或取消任何錄音；請稍後再試。");
      check(prepared);
      // A concurrent retired-file cleanup can shift offset pages. Re-list from
      // zero after each removal pass before deleting the class metadata.
      for (let pass = 0; ; pass++) {
        const paths = await collect(id);
        if (!paths.length) break;
        if (pass === 5) throw Error("錄音檔仍在清理，請稍後再按刪除課堂。");
        for (let i = 0; i < paths.length; i += 100)
          check(
            await db.storage
              .from("ten-second-audio")
              .remove(paths.slice(i, i + 100)),
          );
      }
      check(await db.from("ts_classes").delete().eq("id", id));
      return reply({ ok: true });
    }
    if (action === "classes") {
      const query = db
        .from("ts_classes")
        .select("*")
        .order("created_at", { ascending: false });
      return reply(
        check(
          await (teacherId
            ? query.eq("teacher_id", teacherId)
            : query.is("teacher_id", null)),
        ),
      );
    }
    if (action === "create") {
      const code = crypto
        .randomUUID()
        .replaceAll("-", "")
        .slice(0, 10)
        .toUpperCase();
      return reply(
        check(
          await db
            .from("ts_classes")
            .insert({ title: str(b.title, 100), code, teacher_id: teacherId })
            .select()
            .single(),
        ),
      );
    }
    if (action === "save_question") {
      if (b.maxSeconds !== undefined && ![10, 20, 120].includes(b.maxSeconds))
        throw Error("錄音上限不正確");
      if (b.maxSeconds === 120 && !allowLongRecordings)
        return reply({ error: "此老師帳號未開放兩分鐘錄音" }, 403);
      if (!["pronunciation", "answer"].includes(b.mode))
        throw Error("請選擇評測模式");
      const data = {
        class_id: b.classId,
        prompt: str(b.prompt),
        rubric: str(b.rubric || "依題目判斷", 2000),
        mode: b.mode,
        response_language: [
          "auto",
          "mandarin",
          "cantonese",
          "english",
        ].includes(b.responseLanguage)
          ? b.responseLanguage
          : "auto",
        feedback_enabled:
          b.mode === "answer" ? b.feedbackEnabled !== false : true,
        max_seconds: recordingSeconds({ max_seconds: b.maxSeconds }),
        position: Number(b.position) || 0,
      };
      if (b.id) {
        const used = check(
          await db
            .from("ts_responses")
            .select("id")
            .eq("question_id", b.id)
            .limit(1),
        );
        if (used.length) throw Error("已有作答，請新增一題以保留紀錄");
        return reply(
          check(
            await db
              .from("ts_questions")
              .update(data)
              .eq("id", b.id)
              .eq("status", "draft")
              .select()
              .single(),
          ),
        );
      }
      return reply(
        check(await db.from("ts_questions").insert(data).select().single()),
      );
    }
    if (action === "delete_question")
      return reply(
        check(
          await db
            .from("ts_questions")
            .delete()
            .eq("id", b.id)
            .eq("status", "draft"),
        ) || { ok: true },
      );
    if (action === "class_status") {
      if (!["draft", "active", "ended"].includes(b.status))
        throw Error("狀態不正確");
      if (b.status !== "active")
        check(
          await db
            .from("ts_questions")
            .update({ status: "closed" })
            .eq("class_id", b.classId)
            .eq("status", "active"),
        );
      return reply(
        check(
          await db
            .from("ts_classes")
            .update({ status: b.status })
            .eq("id", b.classId)
            .select()
            .single(),
        ),
      );
    }
    if (action === "open_question")
      return reply(
        check(
          await db.rpc("ts_open_question", { qid: b.id, cid: b.classId }),
        ) || { ok: true },
      );
    if (action === "close_question")
      return reply(
        check(
          await db
            .from("ts_questions")
            .update({ status: "closed" })
            .eq("id", b.id),
        ) || { ok: true },
      );
    if (action === "summarize") {
      const q = check(
        await db
          .from("ts_questions")
          .select("*")
          .eq("id", str(b.id, 40))
          .single(),
      );
      const language = b.language === "zh" ? "zh" : "en";
      const responses = check(
        await db
          .from("ts_responses")
          .select("id,member_id,status,result,path")
          .eq("question_id", q.id)
          .order("id"),
      );
      const members = check(
        await db.from("ts_members").select("id").eq("class_id", q.class_id),
      );
      const readable = responses.filter(
        (r) =>
          r.status === "done" &&
          r.result?.level !== "unscorable" &&
          r.result?.transcript?.trim(),
      );
      if (!readable.length)
        throw Error("尚無可整理的逐字稿 / No transcripts to summarize yet");
      const fingerprint = await hash(
        JSON.stringify({
          concept_version: 1,
          prompt: q.prompt,
          rubric: q.rubric,
          mode: q.mode,
          feedback: q.feedback_enabled,
          responses,
          members: members.length,
        }),
      );
      const claimed = check(
        await db.rpc("ts_claim_summary", {
          qid: q.id,
          lang: language,
          version: fingerprint,
        }),
      );
      if (claimed) {
        try {
          const result = await generateSummary(q, readable, language);
          check(
            await db
              .from("ts_summaries")
              .update({
                status: "done",
                result: {
                  ...result,
                  response_ids: readable.map((r) => r.id),
                  snapshot: responses,
                  member_count: members.length,
                },
              })
              .eq("question_id", q.id)
              .eq("language", language)
              .eq("fingerprint", fingerprint),
          );
        } catch {
          check(
            await db
              .from("ts_summaries")
              .update({ status: "failed" })
              .eq("question_id", q.id)
              .eq("language", language)
              .eq("fingerprint", fingerprint),
          );
          return reply(
            {
              error:
                "摘要暫時無法產生，請重試。原始答案仍保留。 / Summary unavailable. Please retry; responses are saved.",
            },
            502,
          );
        }
      }
      return reply(
        check(
          await db
            .from("ts_summaries")
            .select("*")
            .eq("question_id", q.id)
            .eq("language", language)
            .single(),
        ),
      );
    }
    if (action === "dashboard") {
      const questions = check(
        await db
          .from("ts_questions")
          .select("*")
          .eq("class_id", b.classId)
          .order("position")
          .order("id"),
      );
      const members = check(
        await db
          .from("ts_members")
          .select("id,name,student_id,joined_at")
          .eq("class_id", b.classId),
      );
      // A class can have 150 students × 80 questions, beyond the default 1,000-row API limit.
      const responses: any[] = [];
      if (questions.length) {
        for (let offset = 0; ; offset += 1000) {
          const page = check(
            await db
              .from("ts_responses")
              .select("*")
              .in(
                "question_id",
                questions.map((q) => q.id),
              )
              .order("id")
              .range(offset, offset + 999),
          );
          responses.push(...page);
          if (page.length < 1000) break;
        }
      }
      const summaries = questions.length
        ? check(
            await db
              .from("ts_summaries")
              .select("*")
              .in(
                "question_id",
                questions.map((q) => q.id),
              ),
          )
        : [];
      return reply({ questions, members, responses, summaries });
    }
    if (action === "audio" || action === "retry") {
      const r = check(
        await db.from("ts_responses").select("*").eq("id", b.id).single(),
      );
      if (!r.path) throw Error("錄音尚未收到");
      if (action === "audio")
        return reply(
          check(
            await db.storage
              .from("ten-second-audio")
              .createSignedUrl(r.path, 120),
          ),
        );
      const retryQuestion = check(
        await db
          .from("ts_questions")
          .select("*")
          .eq("id", r.question_id)
          .single(),
      );
      if (recordingSeconds(retryQuestion) === 120) {
        if (r.status === "queued") {
          EdgeRuntime.waitUntil(queue.wake());
          return reply({ ok: true });
        }
        if (
          r.status !== "failed" &&
          !(
            r.status === "processing" &&
            Date.now() - Date.parse(r.worker_claimed_at || r.submitted_at) >
              LONG_RETRY_MS
          )
        )
          throw Error("目前仍在處理，請稍候");
        const claimed = check(
          await db
            .from("ts_responses")
            .update({
              status: "queued",
              submitted_at: new Date().toISOString(),
              worker_token: null,
              worker_claimed_at: null,
              worker_started_at: null,
              ai_started_at: null,
              processing_completed_at: null,
              provider_attempts: null,
              result: null,
              debug_error: null,
            })
            .eq("id", r.id)
            .eq("status", r.status)
            .eq("submitted_at", r.submitted_at)
            .select(),
        );
        if (!claimed.length) throw Error("已在重試");
        EdgeRuntime.waitUntil(queue.wake());
        return reply({ ok: true });
      }
      if (
        r.status !== "failed" &&
        !(
          r.status === "processing" &&
          Date.now() - Date.parse(r.submitted_at) > 90000
        )
      )
        throw Error("目前不需要重試");
      const claimed = check(
        await db
          .from("ts_responses")
          .update({
            status: "processing",
            submitted_at: new Date().toISOString(),
          })
          .eq("id", r.id)
          .eq("submitted_at", r.submitted_at)
          .select(),
      );
      if (!claimed.length) throw Error("已在重試");
      const blob = check(
        await db.storage.from("ten-second-audio").download(r.path),
      );
      const q = check(
        await db
          .from("ts_questions")
          .select("*")
          .eq("id", r.question_id)
          .single(),
      );
      EdgeRuntime.waitUntil(
        assess(
          r.id,
          q,
          new Uint8Array(await blob.arrayBuffer()),
          claimed[0].submitted_at,
        ),
      );
      return reply({ ok: true });
    }
    const cls = check(
      await db
        .from("ts_classes")
        .select("*")
        .eq("code", str(b.code, 20).toUpperCase())
        .maybeSingle(),
    );
    if (!cls)
      return reply(
        { error: "找不到這個課堂，請重新掃描老師的 QR code。" },
        404,
      );
    if (action === "peek")
      return reply({ title: cls.title, status: cls.status });
    if (action === "join") {
      if (cls.status === "ended") throw Error("課堂已結束");
      const token = str(b.token, 100);
      if (token.length < 32) throw Error("加入資料不完整");
      const token_hash = await hash(token);
      const existing = check(
        await db
          .from("ts_members")
          .select("id,name,student_id")
          .eq("class_id", cls.id)
          .eq("token_hash", token_hash)
          .maybeSingle(),
      );
      if (existing) return reply(existing);
      const member = await db
        .from("ts_members")
        .insert({
          class_id: cls.id,
          name: str(b.name, 60),
          student_id: str(b.studentId, 60),
          token_hash,
        })
        .select("id,name,student_id")
        .single();
      if (member.error?.code === "23505")
        throw Error("此學號已加入，請使用原本的瀏覽器");
      return reply(check(member));
    }
    const member = check(
      await db
        .from("ts_members")
        .select("*")
        .eq("class_id", cls.id)
        .eq("token_hash", await hash(str(b.token, 100)))
        .maybeSingle(),
    );
    if (!member)
      return reply(
        { error: "加入紀錄已失效，請重新加入。", code: "REJOIN" },
        401,
      );
    if (action === "state") {
      const questions = check(
        await db
          .from("ts_questions")
          .select(
            "id,mode,prompt,status,position,response_language,feedback_enabled,max_seconds",
          )
          .eq("class_id", cls.id)
          .neq("status", "draft")
          .order("position")
          .order("id"),
      );
      const responses = check(
        await db
          .from("ts_responses")
          .select(
            "id,question_id,status,result,started_at,submitted_at,worker_claimed_at,recording_version",
          )
          .eq("member_id", member.id),
      );
      return reply({
        class: {
          id: cls.id,
          code: cls.code,
          title: cls.title,
          status: cls.status,
        },
        member: { name: member.name },
        questions,
        responses,
      });
    }
    const q = check(
      await db
        .from("ts_questions")
        .select("*")
        .eq("id", b.questionId)
        .eq("class_id", cls.id)
        .single(),
    );
    if (action === "start") {
      if (cls.status !== "active" || q.status !== "active")
        throw Error("老師尚未開放這一題");
      const old = check(
        await db
          .from("ts_responses")
          .select("*")
          .eq("question_id", q.id)
          .eq("member_id", member.id)
          .maybeSingle(),
      );
      if (old) {
        if (old.status !== "recording") throw Error("本題已提交");
        if (Date.now() - Date.parse(old.started_at) > 110000) {
          const reset = check(
            await db
              .from("ts_responses")
              .update({ started_at: new Date().toISOString() })
              .eq("id", old.id)
              .eq("status", "recording")
              .select()
              .maybeSingle(),
          );
          if (!reset) throw Error("本題已提交");
          return reply(reset);
        }
        return reply(old);
      }
      return reply(
        check(
          await db
            .from("ts_responses")
            .insert({
              question_id: q.id,
              member_id: member.id,
              recording_version:
                recordingSeconds(q) === 120 ? crypto.randomUUID() : null,
            })
            .select()
            .single(),
        ),
      );
    }
    if (
      ["upload_ticket", "submit_saved", "discard_recording"].includes(action)
    ) {
      if (recordingSeconds(q) !== 120) throw Error("本題不使用長錄音上傳");
      const r = check(
        await db
          .from("ts_responses")
          .select("*")
          .eq("question_id", q.id)
          .eq("member_id", member.id)
          .single(),
      );
      // New clients bind every operation to the version saved with the audio.
      // Versionless old clients are accepted only for a legacy NULL version.
      const version = recordingVersion(
        b.version === undefined && r.recording_version === null
          ? null
          : b.version,
      );
      const stale = () =>
        reply(
          {
            error: "這段錄音已被捨棄或更新，不能提交舊版本；請重新整理。",
            code: "STALE_RECORDING",
          },
          409,
        );
      if (action === "discard_recording") {
        const next = recordingVersion(b.nextVersion);
        if (!next || next === version) throw Error("新錄音版本無效");
        const cleanRetired = () =>
          EdgeRuntime.waitUntil(
            db.storage
              .from("ten-second-audio")
              .remove([
                `${cls.id}/${q.id}/${member.id}/${recordingFile(r.id, version)}`,
              ]),
          );
        if (r.recording_version === next) {
          cleanRetired();
          return reply({ discarded: true, version: next });
        }
        if (r.recording_version !== version) return stale();
        if (r.status !== "recording")
          return reply(
            {
              error: "錄音已收件，未捨棄；請查看處理結果。",
              code: "ALREADY_RECEIVED",
            },
            409,
          );
        const rotated = check(
          await matchVersion(
            db
              .from("ts_responses")
              .update({
                recording_version: next,
                started_at: new Date().toISOString(),
              })
              .eq("id", r.id)
              .eq("status", "recording"),
            version,
          ).select("id"),
        );
        if (!rotated.length) {
          const current = check(
            await db
              .from("ts_responses")
              .select("recording_version")
              .eq("id", r.id)
              .single(),
          );
          if (current.recording_version === next) {
            cleanRetired();
            return reply({ discarded: true, version: next });
          }
          return stale();
        }
        // Old signed URLs address only the retired version. A late PUT can
        // leave a private orphan, but cannot be accepted; class deletion cleans it.
        cleanRetired();
        return reply({ discarded: true, version: next });
      }
      if (r.recording_version !== version) return stale();
      const digest = b.digest;
      if (
        digest !== undefined &&
        (typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest))
      )
        throw Error("錄音內容識別碼無效");
      const filename = recordingFile(r.id, version);
      const path = `${cls.id}/${q.id}/${member.id}/${filename}`;
      const verifyContent = async (bytes?: Uint8Array) => {
        if (digest === undefined) return; // rolling deployment / legacy client
        const data =
          bytes ||
          new Uint8Array(
            await check(
              await db.storage.from("ten-second-audio").download(path),
            ).arrayBuffer(),
          );
        const hash = Array.from(
          new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
        )
          .map((x) => x.toString(16).padStart(2, "0"))
          .join("");
        if (hash !== digest)
          throw Error(
            "已收到另一個分頁的不同錄音；這份仍保留在本機，請找老師確認或捨棄這份。 / A different recording was received from another tab. This copy remains on this device.",
          );
      };
      if (r.status !== "recording") {
        if (!r.path) throw Error("錄音已取消");
        await verifyContent();
        return reply({ ok: true, received: true });
      }
      if (Date.now() - Date.parse(r.started_at) > 86400000)
        throw Error("錄音已超過24小時");
      if (action === "upload_ticket") {
        const existing = check(
          await db.storage
            .from("ten-second-audio")
            .list(`${cls.id}/${q.id}/${member.id}`, {
              search: filename,
              limit: 10,
            }),
        );
        if (existing.some((f: any) => f.name === filename)) {
          await verifyContent();
          return reply({ uploaded: true });
        }
        const signed = check(
          await db.storage.from("ten-second-audio").createSignedUploadUrl(path),
        );
        return reply({ signedUrl: signed.signedUrl });
      }
      const file = check(
        await db.storage.from("ten-second-audio").download(path),
      );
      const bytes = new Uint8Array(await file.arrayBuffer());
      await verifyContent(bytes);
      try {
        validateWav(bytes, 120);
      } catch (e) {
        // Do not delete an immutable path while concurrent confirmations may
        // still reference it. Explicit discard rotates before cleaning up.
        throw Error("錄音格式無效，請捨棄這段錄音後重新錄製。");
      }
      const accepted = check(
        await matchVersion(
          db
            .from("ts_responses")
            .update({
              status: "queued",
              path,
              submitted_at: new Date().toISOString(),
            })
            .eq("id", r.id)
            .eq("status", "recording"),
          version,
        ).select(),
      );
      if (accepted.length) EdgeRuntime.waitUntil(queue.wake());
      else {
        const current = check(
          await db
            .from("ts_responses")
            .select("path,recording_version")
            .eq("id", r.id)
            .single(),
        );
        if (current.recording_version !== version) return stale();
        if (!current.path) throw Error("錄音已取消，尚未收到");
      }
      return reply({ ok: true, received: true });
    }
    if (action === "submit") {
      if (recordingSeconds(q) === 120) throw Error("請使用長錄音上傳");
      const r = check(
        await db
          .from("ts_responses")
          .select("*")
          .eq("question_id", q.id)
          .eq("member_id", member.id)
          .single(),
      );
      if (r.status !== "recording") {
        if (!r.path)
          throw Error("這段錄音已被老師取消；請捨棄錄音後繼續下一題。");
        return reply({ ok: true });
      }
      if (Date.now() - Date.parse(r.started_at) > 86400000)
        throw Error("錄音已超過24小時，請老師另開一題");
      const seconds = recordingSeconds(q);
      if (
        typeof b.audio !== "string" ||
        b.audio.length > Math.ceil((44 + seconds * 32000) / 3) * 4
      )
        throw Error(`錄音不能超過${seconds}秒`);
      const bytes = Uint8Array.from(atob(b.audio), (c) => c.charCodeAt(0));
      validateWav(bytes, seconds);
      const path = `${cls.id}/${q.id}/${member.id}/${crypto.randomUUID()}.wav`;
      check(
        await db.storage
          .from("ten-second-audio")
          .upload(path, bytes, { contentType: "audio/wav", upsert: false }),
      );
      const claimed = check(
        await db
          .from("ts_responses")
          .update({
            status: "processing",
            path,
            submitted_at: new Date().toISOString(),
          })
          .eq("id", r.id)
          .eq("status", "recording")
          .select(),
      );
      if (claimed.length)
        EdgeRuntime.waitUntil(assess(r.id, q, bytes, claimed[0].submitted_at));
      else await db.storage.from("ten-second-audio").remove([path]);
      return reply({ ok: true });
    }
    return reply({ error: "未知操作" }, 400);
  } catch (e) {
    return reply({ error: e instanceof Error ? e.message : "操作失敗" }, 400);
  }
});
