# FACE64 — Bankr agent-declared badges

Scope: free/practice games ONLY. No OCH spend, no auth bypass, no modifications to ranked game rules, no HoodJourney integration.

## Install in this order

1. BACK UP your existing D1 database and current game files. Run the D1 migration **once** with the database name from your `wrangler.jsonc`/`wrangler.toml` (the binding is `HOODFRAME_LIKES`). For example, from your Cloudflare Worker repository:

   `npx wrangler d1 execute YOUR_D1_DATABASE_NAME --remote --file=./migrations/face64_agent_label.sql`

   The migration adds nullable `runner` and `strategy` columns to **face64_demo_sessions**. Do not run it twice; `ALTER TABLE ... ADD COLUMN` is not idempotent in SQLite.

2. Replace Worker `src/face64/demo.ts`. Keep your existing `src/face64/ranked.ts` and Worker route registration unchanged. Then run `npx tsc --noEmit` and `npx wrangler deploy`.

3. Replace website `app/game/page.tsx` and `app/game/game.css`, run `npm run lint`, `npx tsc --noEmit`, `npm run build` before deploying.

4. Update Bankr's GitHub repository using the *full updated contents* of `bankr-skill/skill.zip`, or copy just `scripts/face64-free.mjs` and `references/face64.md`. Commit and push, then ask Bankr to install/refresh the latest skill.

5. Run `node scripts/face64-free.mjs hoodie 351 --strategy balanced` and open `/game` -> **Leaderboard** -> **FREE / AGENTS** -> today's date. The new game should show `BANKR · AGENT-DECLARED`. Click it to watch the recorded free-play replay. Live games also show the label under **WATCH LIVE**.

## Important semantics

- `runner: "bankr"` is **self-declared**, not a credential or proof of autonomous reasoning. Any client can submit it.
- A non-labelled run is called standard/unlabelled, NOT cryptographically proven human.
- Old sessions cannot be retrospectively labelled; they did not declare a runner when started.
- Free sessions do not verify Hoodie or 64 Face NFT ownership. Labels do not grant spending or delegation rights.
- The Free / Agents leaderboard is separate from the ranked OCH leaderboard. Free scores have no prize impact.
- The next step, if desired, is a signed or registered runner identity for paid games; not included in this release.

## Files

- `worker/src/face64/demo.ts`: existing free engine with optional runner metadata, historical day selection, and recorded free replay endpoint.
- `worker/migrations/face64_agent_label.sql`: D1 migration.
- `website/app/game/page.tsx`: free leaderboard mode, free replays, live badges.
- `website/app/game/game.css`: simple badge styling.
- `bankr-skill/skill.zip`: complete repackaged skill.

All TS/TSX files have passed a syntax/transpilation check, and the skill passed the skill validator. A full project-level `next build` and `wrangler` deployment have NOT run in this isolated environment.
