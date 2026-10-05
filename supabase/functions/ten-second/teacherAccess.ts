// Every teacher resource action must resolve its class on the server before access.
// A null teacherId is the original owner's workspace, never a wildcard.
export const teacherActions = [
  "classes",
  "create",
  "save_question",
  "class_status",
  "open_question",
  "close_question",
  "dashboard",
  "summarize",
  "audio",
  "retry",
  "delete_question",
  "delete_class",
];
export async function canAccessTeacherResource(
  db: any,
  action: string,
  body: any,
  teacherId: string | null,
): Promise<boolean> {
  if (!teacherActions.includes(action)) return false;
  if (action === "classes" || action === "create") return true;
  async function row(table: string, id: unknown, columns: string) {
    if (typeof id !== "string" || !id) return null;
    const result = await db
      .from(table)
      .select(columns)
      .eq("id", id)
      .maybeSingle();
    return result.error ? null : result.data;
  }
  let classId: unknown;
  if (["dashboard", "class_status", "delete_class"].includes(action)) {
    classId = body.classId;
  } else if (action === "save_question" && !body.id) {
    classId = body.classId;
  } else {
    let questionId = body.id;
    if (action === "audio" || action === "retry") {
      const response = await row("ts_responses", body.id, "question_id");
      if (!response) return false;
      questionId = response.question_id;
    }
    const question = await row("ts_questions", questionId, "class_id");
    if (!question) return false;
    classId = question.class_id;
    // Editing and opening must not smuggle a question into a different class.
    if (
      ["save_question", "open_question"].includes(action) &&
      body.classId !== classId
    )
      return false;
  }
  const cls = await row("ts_classes", classId, "teacher_id");
  return !!cls && cls.teacher_id === teacherId;
}
