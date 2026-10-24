export function selectRecordingQuestion(
  state: any,
  recordingQuestion: any,
  pendingIds: string[],
  savedShort: (id: string) => unknown,
) {
  return (
    recordingQuestion ||
    state?.questions.find(
      (q: any) =>
        (pendingIds.includes(q.id) ||
          (q.max_seconds !== 120 && savedShort(q.id))) &&
        !state.responses.some(
          (r: any) => r.question_id === q.id && r.status !== "recording",
        ),
    ) ||
    (state?.class.status === "active"
      ? state.questions.find((q: any) => q.status === "active")
      : null)
  );
}
