# reference

Generated snapshots, kept so a question can be answered from a file rather than from memory.
Nothing here is read at runtime; regenerate rather than hand-edit.

- `2026-09-22-openai-payload-example.txt` — exactly what one generation sends to OpenAI:
  the assembled system message (`ad-director-v3` + TARGET + FORMAT) and the fenced DATA
  message. Rebuild it with the snippet in `docs/PROGRESS.md` → *Resume here*, or by calling
  `buildSystemPrompt` / `buildDataBlock` from `src/ai/prompt/assemble.ts`.
