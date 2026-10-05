import assert from "node:assert/strict";
import ts from "typescript";
import { readFileSync } from "node:fs";
const source = ts.transpile(
  readFileSync("supabase/functions/ten-second/teacherAccess.ts", "utf8"),
  { module: ts.ModuleKind.ESNext },
);
const { canAccessTeacherResource: allow, teacherActions } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
const rows = {
  ts_classes: {
    a: { teacher_id: "A" },
    b: { teacher_id: "B" },
    legacy: { teacher_id: null },
  },
  ts_questions: {
    qa: { class_id: "a" },
    qb: { class_id: "b" },
    qlegacy: { class_id: "legacy" },
  },
  ts_responses: {
    ra: { question_id: "qa" },
    rb: { question_id: "qb" },
    rlegacy: { question_id: "qlegacy" },
  },
};
const db = {
  from: (table) => ({
    select: () => ({
      eq: (_, id) => ({
        maybeSingle: async () => ({ data: rows[table]?.[id] || null }),
      }),
    }),
  }),
};
let count = 0;
for (const action of teacherActions.filter(
  (a) => !["classes", "create"].includes(a),
)) {
  for (const [suffix, owner] of [
    ["a", "A"],
    ["b", "B"],
    ["legacy", null],
  ]) {
    const body = {
      classId: suffix,
      id: ["audio", "retry"].includes(action) ? `r${suffix}` : `q${suffix}`,
    };
    for (const teacher of ["A", "B", null]) {
      assert.equal(
        await allow(db, action, body, teacher),
        teacher === owner,
        `${action} ${suffix} ${teacher}`,
      );
      count++;
    }
  }
}
assert.equal(
  await allow(db, "save_question", { id: "qb", classId: "a" }, "A"),
  false,
);
assert.equal(
  await allow(db, "save_question", { id: "qa", classId: "b" }, "A"),
  false,
);
assert.equal(
  await allow(db, "open_question", { id: "qb", classId: "a" }, "A"),
  false,
);
assert.equal(await allow(db, "save_question", { classId: "a" }, "A"), true);
assert.equal(await allow(db, "save_question", { classId: "b" }, "A"), false);
assert.equal(
  await allow(db, "save_question", { classId: "legacy" }, "A"),
  false,
);
assert.equal(await allow(db, "dashboard", {}, "A"), false);
assert.equal(await allow(db, "summarize", { id: "missing" }, "A"), false);
assert.equal(await allow(db, "unknown", {}, "A"), false);
console.log(`${count + 9} teacher access checks passed`);
