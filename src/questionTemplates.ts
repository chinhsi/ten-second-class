export const questionTemplates = [
  {
    id: "reason",
    label: { zh: "補理由", en: "Give a reason" },
    prompt: {
      zh: "針對剛才的說法，請補充一個理由。",
      en: "Give one reason for the idea we just discussed.",
    },
  },
  {
    id: "example",
    label: { zh: "舉例子", en: "Give an example" },
    prompt: {
      zh: "請舉一個例子，說明剛才的觀點。",
      en: "Give an example to explain the idea we just discussed.",
    },
  },
  {
    id: "agree",
    label: { zh: "同意／不同意", en: "Agree or disagree" },
    prompt: {
      zh: "你同意剛才的觀點嗎？請說明理由。",
      en: "Do you agree with the idea we just discussed? Explain why.",
    },
  },
  {
    id: "rethink",
    label: { zh: "重新回答", en: "Answer again" },
    prompt: {
      zh: "聽完討論，請重新說出你的想法。",
      en: "After hearing the discussion, share your thinking again.",
    },
  },
] as const;
