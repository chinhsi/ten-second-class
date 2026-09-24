import { strict as assert } from "node:assert";
import {
  responseStats,
  discussionCandidates,
  pickRandom,
} from "../src/discussionLogic.ts";
import { validateSummary } from "../supabase/functions/ten-second/summary.ts";
const rows = [
  {
    id: "1",
    member_id: "a",
    status: "done",
    result: { level: "understood", transcript: "Clear answer" },
  },
  {
    id: "2",
    member_id: "b",
    status: "done",
    result: { level: "partial", transcript: "Vague answer" },
  },
  {
    id: "3",
    member_id: "c",
    status: "done",
    result: { level: "unscorable", transcript: "" },
  },
  { id: "4", member_id: "d", status: "processing", path: "audio" },
  { id: "5", member_id: "e", status: "failed", path: "audio" },
  { id: "6", member_id: "f", status: "failed" },
  { id: "7", member_id: "g", status: "recording" },
];
const s = responseStats(rows, 8);
assert.equal(s.submitted, 5);
assert.equal(s.missing, 3);
assert.equal(s.percent, 50);
assert.equal(s.assessed, 2);
assert.equal(s.failed, 1);
assert.equal(s.settled, false);
assert.equal(responseStats([], 0).percent, null);
assert.equal(responseStats([], 0).settled, false);
assert.deepEqual(
  discussionCandidates(rows, "all", ["1"]).map((r) => r.id),
  ["2"],
);
assert.deepEqual(
  discussionCandidates(rows, "followup", [], false).map((r) => r.id),
  ["2"],
);
assert.equal(
  pickRandom([], () => 0),
  undefined,
);
assert.equal(pickRandom(rows, () => 0)?.id, "1");
assert.equal(pickRandom(rows, () => 0.999)?.id, "7");
const summary = {
  overview: "Summary",
  themes: [{ title: "Idea", detail: "Evidence", response_ids: ["1", "1"] }],
  gaps: [],
  next_question: "Why?",
};
assert.equal(validateSummary(summary, new Set(["1"])).themes[0].count, 1);
assert.throws(() => validateSummary(summary, new Set(["2"])));
assert.throws(() =>
  validateSummary({ ...summary, overview: 42 }, new Set(["1"])),
);
console.log(
  "PASS: denominator, missing/failed distinctions, non-repeating pools, empty draw, evidence IDs and counts",
);
