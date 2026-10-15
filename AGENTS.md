# EDP Typing Game

- User-facing text and documentation are Japanese.
- Use TypeScript, Vite, and plain HTML/CSS. Keep runtime assets local.
- Design uses blue and white with restrained digital effects; keep prompts readable.
- Prioritize refinement: remove redundant copy and decoration, and emphasize the prompt and typing. Show detailed instructions and secondary statistics only on demand.
- Every prompt has three alphabetic words with initials E, D, P in that order.
- Repeat six prompts: Electric Data Processing in slot 1, Echigo Dangerous People in slot 4, independent E/D/P word draws in slots 2, 3, 5, and 6. Include slot vocabulary, typing vocabulary, and the six fixed words in the pools; deduplicate words case-insensitively.
- Narrate the current prompt's words dynamically. Do not require prerecorded prompt audio or regeneration when the question data changes.
- Narrate Electric Data Processing and Echigo Dangerous People in English (en-US, prefer Zira), and use Short on their completion, including random occurrences. Narrate other prompts in Japanese and use Single on completion. Do not interrupt sounds just because they overlap.
- Input joins the words without spaces and ignores letter case. A wrong letter does not advance the cursor.
- For Electric Data Processing and Echigo Dangerous People, glow only correctly typed letters in vivid rainbow colors and award 10 points per correct letter (other prompts: 1 point). Apply this to random occurrences too; accuracy and combo always count characters, independent of points.
- Keep game rules independent of the DOM. Verify timing boundaries and replay resets.
- Commit messages use an English word, a full-width colon, and Japanese, e.g. `Add：タイピング試作を実装`.
- Never stage or commit `doc/遠雷亭_SLOT_年刊EDP2026_第2版.pdf`. Keep its ignore rule.
- Run `npm test`, `npm run build`, and `npm run test:e2e` for changes to the game flow.
- Browser tests use installed Chrome. If unavailable, set up the appropriate Playwright browser before running them.
- Update README with implemented behavior and startup steps. Distinguish prototypes from future features.
