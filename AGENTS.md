# AGENTS.md

## Project Overview

- `tennis-scheduler` is a small full-stack monorepo with a Vite/React client in `client/` and an Express API in `server/`.
- Authentication is handled with Supabase JWTs. The client reads Supabase keys from Vite env vars and sends bearer tokens on API requests.
- The server uses Postgres via `pg`. Supabase is also used server-side for auth verification and invite flows.
- Twilio is optional and only needed for SMS notification features.

## Repository Layout

- `client/src/` contains the React app, page-level views, and `api.js` for authenticated API access.
- `client/src/lib/supabase.js` initializes the browser Supabase client from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `server/app.js` wires routes. Public endpoints are under `/api/availability` plus `/api/invites/preview/:token`. Everything else is behind `server/middleware/auth.js`.
- `server/routes/` contains Express route modules for teams, players, seasons, matches, availability, and invites.
- `server/database.js` exposes the shared Postgres pool.
- `server/migrate.sql` and `server/migrate.js` are the database migration entry points.
- `supabase/migrations/` contains SQL migrations for Supabase-managed schema changes.
- `netlify/functions/api.js` exists for deployment packaging.

## Commands

Uses [pnpm](https://pnpm.io/) with a workspace (`pnpm-workspace.yaml`). Run commands from the repo root; no config in parent directories.

- Install all dependencies: `pnpm install` (or `pnpm run install:all`)
- Run both apps in development: `pnpm run dev`
- Run only the API: `pnpm run dev:server`
- Run only the client: `pnpm run dev:client`
- Build the client: `pnpm run build`
- Start the server in production mode: `pnpm start`
- Run database migration script: `pnpm run migrate`

## Environment

- Client env lives in `client/.env` and should define:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
- Server env lives in `server/.env` and should define:
  - `DATABASE_URL`
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `PORT` and `BASE_URL` as needed
  - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` only if SMS is required

## Working Notes

- The top-level `README.md` still mentions SQLite, but the current server code uses Postgres and Supabase. Trust the code and env examples over that section of the README.
- There is no established automated test suite in the repo today. For changes, prefer validating with targeted builds and, when relevant, manual API or UI checks.
- The worktree may already contain unrelated user changes. Current observed examples were `.gitignore` modifications and an untracked `client/server/` path; do not overwrite or clean those without explicit direction.
