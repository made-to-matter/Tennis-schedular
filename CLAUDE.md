# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# From repo root (pnpm workspace — use corepack enable if pnpm is missing)
pnpm run dev              # Run frontend + backend in parallel
pnpm run dev:server       # Backend only (nodemon, port 3001)
pnpm run dev:client       # Frontend only (Vite, port 5175)
pnpm run build            # Build frontend to client/dist
pnpm install              # Install all workspace dependencies

# Database migration (run from repo root)
pnpm run migrate
```

## Architecture

**Two-service setup**: React/Vite frontend (`client/`) + Node/Express backend (`server/`). In dev, Vite proxies `/api/*` to `localhost:3001`. In production, frontend is on Netlify and backend uses Supabase (Postgres).

**Auth flow**: Supabase handles auth. The frontend attaches a JWT (`Authorization: Bearer`) to every API request via an Axios interceptor in `client/src/api.js`. The backend middleware at `server/middleware/auth.js` verifies the token and sets `req.captainId`. All data is scoped to the captain — every table has a `captain_id` column. Public availability endpoints (`/api/availability/match/:id/*`) are unauthenticated and identify players by `player_id` in the request body.

**Global state**: `TeamContext` in `App.jsx` provides `{ activeTeam, setActiveTeam, teams, activeSeason, setActiveSeason, teamSeasons, refreshTeams }` to all pages. Seasons auto-load when `activeTeam` changes.

**Key data flow for a match**:
- `matches` → has many `match_lines` (one per line, e.g. Doubles 1, Singles 1)
- `match_lines` → has many `match_line_players` (assigned players + position)
- `player_availability` → keyed on `(player_id, match_id, match_line_id)` — `match_line_id` can be NULL for match-level availability
- `matches.use_custom_dates` flag enables per-line date/time overrides

**Seasons & lines**: Each team has seasons. Each season has `line_templates` (e.g. 3 doubles + 1 singles). When a match is created, lines are generated from the season template.

## Key Files

| File | Purpose |
|------|---------|
| `client/src/App.jsx` | Root: auth gate, TeamContext, Nav (hamburger mobile / tabs desktop), routing |
| `client/src/api.js` | Axios instance — all API calls go through here |
| `client/src/index.css` | All styles — mobile-first, no CSS modules |
| `client/src/pages/MatchDetail.jsx` | Most complex page: LineCard, ShareMenu, availability, scores |
| `client/src/pages/AvailabilityPublic.jsx` | Public page (no auth) — players mark their availability |
| `server/app.js` | Express setup: CORS, middleware, route mounting |
| `server/database.js` | PostgreSQL pool — import `db` and call `db.query()` |
| `server/migrate.sql` | Full schema definition |

## Environment

**Server** (`server/.env`): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `PORT`, `BASE_URL` (used in SMS links), optional Twilio vars.

**Client** (`client/.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## Deploy

1. `git push origin claude/tennis-scheduling-app-7Ks4i`
2. `pnpm run build` (from repo root; output in `client/dist`)
3. `npx netlify-cli deploy --prod --dir=dist --no-build`

Backend/DB lives in Supabase — no separate deploy step needed for schema changes (run migration manually).

## CSS Conventions

All styles are in `client/src/index.css`. Mobile breakpoint is `640px`. Inputs use `font-size: 16px` to prevent iOS auto-zoom. Touch targets use `min-height: 44px`. Bottom-sheet modals on mobile via `@media (max-width:640px)`.
