# AGY approval diagnosis — 2026-10-24

Request exec-fbf3edcc-fdf6-48b5-9cb9-a395343465c0 at 04:35:37Z, canceled 04:35:55Z. Native CommandExecutionRequestApproval, not AGY prompt.

Installed codex-cli 0.164.0. default.rules contains allow [agy,-p]. Exact rollout command used direct agy -p and shell single-quote escaping. frontend-input.txt contains one apostrophe.

Official matching-version source: https://github.com/openai/codex/blob/rust-v0.164.0/codex-rs/shell-command/src/bash.rs lines 64, 257–270. is_literal_word_or_number rejects backslash-containing word nodes. Original quotation produces a backslash-escaped apostrophe word, so plain-command extraction rejects it; policy cannot use agy prefix through this extraction path.

Offline reproduction with tree-sitter 0.26.0/tree-sitter-bash 0.25.1 against full original prompt: original syntax_error=False, rejected_nodes=1 (escaped apostrophe word); pure quote concatenation syntax_error=False, rejected_nodes=0. This is source-level reproduction, not instrumented runtime policy tracing.

Fix documented in shared SOP: use single-quoted chunks joined by a double-quoted literal apostrophe. Preserve prompt byte-for-byte. No new wrapper, permissions, or paid API. Prior direct-argv execpolicy checks skipped shell lowering and were insufficient evidence.

No AGY request resent in diagnosis. End-to-end approval-free execution and Gemini report remain unverified/pending.
