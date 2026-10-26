# agent/ — how the chat agent talks

The chat agent (the user's own Claude Code, Grok or Codex) gets its system prompt from here. The main
process (`electron/agentVoice.js`) builds it on **every run**, so edits apply on the next message,
with no restart.

| File | What it holds |
|---|---|
| `voice.json` | `base` rules (role, Qubbot tools, secrets), the answer `format` (cards, file links, the `sugerencias` block), per-mode settings (`modes.vibe` / `modes.dev`: skill, max words, number of suggestions) and `adapt`: hints added when the person's recent messages are short, long, technical, confused, formal or use emojis. |
| `voice.json` → `refine` | "Mejorar mi mensaje": rules to rewrite the person's draft as a test-first spec in JSON (`objective`, `problem`, `scope`, `constraints`, `tasks[{do, accept}]`, `test{red, green, refactor}`; gentle-shell ODD shape), plus one line per mode. Composed by `composeRefinePrompt` (electron/agentVoice.js), run in its own `refine` session, parsed by `renderer/models/promptSpec.js`. |
| `voice.json` → `tour` | "Recorrido": rules to narrate the stops the analyzer chose (`renderer/models/projectAnalyzer.js`) as JSON (`summary`, `steps{id: {title, say, bubble}}`, `usecases[{candidate, title, say, flow}]`, `start{say, open, folder, ask}`, `skip`), plus one line per mode. Composed by `composeTourPrompt`, run in the `tour` session with the read-only MCP address, checked by `renderer/models/tourSpec.js`. |
| `voice.json` → `base` (Laboratorio) | Lines that make the agent an Arduino-systems specialist: suggests projects with the catalog's parts only, explains wiring in plain words, uses the `platanus_lab_*` tools (catalog, view, add part, connect, auto wire, remove; `electron/lab.js`) and never accepts a connection the fixed checker marks red. They live in `base`, so a repair's own task replaces them. |
| `skills/modo-vibe/SKILL.md` | How to talk to people who do not code (plain words, everyday comparisons, no code), with an example. |
| `skills/modo-dev/SKILL.md` | How to talk to people who code (exact cause, paths, short snippets). |

Prompt = `base` (or a repair's own instructions) + the mode's skill + `format` + length rule + matching
`adapt` hints. The person's words are only *matched* against `adapt` word lists; they are never copied
into the prompt (tested in `electron/agentVoice.test.js`).

## The answer format (what the app turns into components)

```
Una frase que responde directo.

> [!riesgo] Título            -> red card      (also: peligro, problema)
> detalle                      
> [!ok] Título                 -> green card    (bien, listo)
> [!idea] / [!paso] / [!nota]  -> idea, next step, note cards

`src/db.js`                    -> link: shows the file on the map

```sugerencias
- una pregunta corta           -> chip that sends it
- reparar: src/db.js           -> "Reparar db.js" (Qubi + the agent)
- auditar: src/db.js           -> "Auditar db.js" (asks the agent to check it)
- ver: src                     -> "Ver src en el mapa"
```
```

Parsing: `renderer/views/ui/markdown.js` (cards, links) and `renderer/models/answerFormat.js`
(suggestions). Both are tested in `tests/renderer/`.

## Changing it

- Tone or rules: edit the skill or `voice.json`, send a message in the app, read the answer.
- A new card kind: add it to `CALLOUTS` in `markdown.js`, its icon in `views/ui/icons.js`, its default
  title in `es.js` (`chat.callouts`) and its colors in `styles/chat.css`; then mention it in `format`.
- A new suggestion action: `answerFormat.js` (`KINDS`), `ChatViewModel.#suggestionChips`, an app action
  in `renderer/main.js`.
- Run `npm test` after any change here.
