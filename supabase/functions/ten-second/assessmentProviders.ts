// One request per channel. The timeout covers headers AND the response body.
export async function assessmentWithFallback(options: {
  googleKey?: string;
  googleModel: string;
  openrouterKey?: string;
  openrouterModel?: string;
  body: any;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}) {
  const fetcher = options.fetcher ?? fetch;
  const attempts: any[] = [];
  for (const channel of ["google", "openrouter"]) {
    const key =
      channel === "google" ? options.googleKey : options.openrouterKey;
    const model =
      channel === "google"
        ? options.googleModel
        : options.openrouterModel || "google/gemini-3.8-flash";
    const started = Date.now();
    if (!key) {
      attempts.push({ channel, model, error: "not_configured", ms: 0 });
      continue;
    }
    const controller = new AbortController();
    const timeout = options.timeoutMs ?? (channel === "google" ? 20000 : 30000);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const operation = async () => {
        const native = options.body;
        const body =
          channel === "google"
            ? native
            : {
                model,
                messages: [
                  {
                    role: "system",
                    content: native.systemInstruction.parts
                      .map((p: any) => p.text)
                      .join("\n"),
                  },
                  {
                    role: "user",
                    content: native.contents[0].parts.map((p: any) =>
                      p.inlineData
                        ? {
                            type: "input_audio",
                            input_audio: {
                              data: p.inlineData.data,
                              format: "wav",
                            },
                          }
                        : { type: "text", text: p.text },
                    ),
                  },
                ],
                reasoning: { effort: "low" },
                max_tokens: 4096,
                provider: { require_parameters: true, allow_fallbacks: false },
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: "classroom_assessment",
                    strict: true,
                    schema: {
                      ...native.generationConfig.responseFormat.text.schema,
                      additionalProperties: false,
                    },
                  },
                },
              };
        const response = await fetcher(
          channel === "google"
            ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
            : "https://openrouter.ai/api/v1/chat/completions",
          {
            method: "POST",
            signal: controller.signal,
            headers:
              channel === "google"
                ? { "Content-Type": "application/json", "x-goog-api-key": key }
                : {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${key}`,
                  },
            body: JSON.stringify(body),
          },
        );
        // Provider error bodies may contain credentials or student content: never log them.
        if (!response.ok) {
          await response.body?.cancel();
          throw Error(`HTTP_${response.status}`);
        }
        const json = await response.json();
        const raw =
          channel === "google"
            ? json.candidates?.[0]?.content?.parts
                ?.filter((p: any) => !p.thought)
                .map((p: any) => p.text || "")
                .join("")
            : json.choices?.[0]?.message?.content;
        const result = JSON.parse(
          String(raw || "")
            .trim()
            .replace(/^```(?:json)?\s*/i, "")
            .replace(/\s*```$/, ""),
        );
        if (
          ![
            "understood",
            "partial",
            "not_yet",
            "unscorable",
            "transcribed",
          ].includes(result.level) ||
          typeof result.transcript !== "string" ||
          typeof result.feedback !== "string" ||
          typeof result.issue !== "string" ||
          !(
            result.score === null ||
            (Number.isInteger(result.score) &&
              result.score >= 0 &&
              result.score <= 5)
          )
        )
          throw Error("invalid_result");
        return { result, request_id: json.id, cost: json.usage?.cost };
      };
      const output = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(Error("timeout"));
          }, timeout);
        }),
      ]);
      attempts.push({
        channel,
        model,
        ms: Date.now() - started,
        request_id: output.request_id,
        cost: output.cost,
      });
      return { result: output.result, attempts };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      attempts.push({
        channel,
        model,
        ms: Date.now() - started,
        error: /^(HTTP_\d{3}|timeout|invalid_result)$/.test(message)
          ? message
          : "request_or_result_error",
      });
    } finally {
      clearTimeout(timer);
    }
  }
  throw Object.assign(
    Error(`AI channels failed: ${JSON.stringify(attempts)}`),
    { attempts },
  );
}
