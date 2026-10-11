# EDP Typing Game

- User-facing text and documentation are Japanese.
- Use TypeScript, Vite, and plain HTML/CSS. Keep runtime assets local.
- Design uses blue and white with restrained digital effects; keep prompts readable.
- Every prompt has three alphabetic words with initials E, D, P in that order.
- Input joins the words without spaces and ignores letter case. A wrong letter does not advance the cursor.
- Keep game rules independent of the DOM. Verify timing boundaries and replay resets.
- Commit messages use an English word, a full-width colon, and Japanese, e.g. `Add：タイピング試作を実装`.
- Never stage or commit `doc/遠雷亭_SLOT_年刊EDP2026_第2版.pdf`. Keep its ignore rule.
- Run `npm test`, `npm run build`, and `npm run test:e2e` for changes to the game flow.
- Browser tests use installed Chrome. If unavailable, set up the appropriate Playwright browser before running them.
- Update README with implemented behavior and startup steps. Distinguish prototypes from future features.
