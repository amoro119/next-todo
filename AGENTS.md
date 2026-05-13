# AGENTS.md

Guidance for AI coding agents in this repository.

## Hard Rules (from CLAUDE.md)

- **Do NOT auto-build** — never run `npm run build` / `next build` without explicit instruction
- **Do NOT auto-commit** — never `git commit` without explicit instruction
- **Do NOT write tests speculatively** — no test files unless asked
- Minimal changes only — solve the specific task, don't refactor surrounding code

## Commands

```bash
# Web dev (starts Docker + Supabase + Next.js)
npm run dev

# Web dev without backend services (local-only, no sync)
npm run next:dev
npm run dev:local:free      # free tier simulation
npm run dev:local:premium   # premium tier simulation (default)

# Lint only
npm run lint

# Full production build (worker → next build → electron package)
npm run build
# build:worker must run before next build — it compiles pglite-worker.ts separately
npm run build:worker        # outputs to dist-worker/, not tracked by main tsconfig

# Backend services
npm run backend:up          # docker compose up -d (postgres + electric on :54321/:5133)
npm run backend:down

# DB migrations (local dev)
npm run db:migrate:local    # supabase db reset + pg-migrations against localhost:54322

# No test runner configured — Vitest present but no test files exist
```

## Architecture

### Dual build targets

- **Web**: `npm run build:web` → Next.js standalone → deployed
- **Electron**: `npm run build` → Next.js standalone → `scripts/prepare-standalone.js` → `electron-builder`
- The `ELECTRON=true` env var changes webpack config (externalizes Node built-ins); set automatically by `next:build`

### PGlite worker (critical quirk)

`app/pglite-worker.ts` is compiled by a **separate tsconfig** (`tsconfig.worker.json`, module: node16) via `npm run build:worker`. This outputs to `dist-worker/`. The main `tsconfig.json` excludes worker output. Run `build:worker` before `next build` or the worker will be stale.

In the browser, PGlite runs in a Web Worker and stores data in IndexedDB at `idb://todo-local-db`. In Electron, it runs in the main process and stores data in `~/Library/Application Support/[app-name]/pglite-data`.

### Client migrations

`db/migrations-client/index.ts` is the migration entrypoint called by `pglite-worker.ts` at startup. Every schema change must be added here. Migrations run automatically on first start and on schema updates.

### Sync system

- ElectricSQL sync is **gated** by subscription tier and user preference
  - `lib/config/syncConfig.ts`: `getSyncConfig()` checks `localStorage('sync_enabled')` and subscription state
  - Free users: sync disabled (`reason: 'free_user'`), local-only
  - Premium users: sync enabled via ElectricSQL shapes + JWT auth (`lib/auth.ts`)
- Offline queue lives in `lib/sync/` — 17 files handling retry, batching, network monitoring
- `app/sync.ts`: `startSync(pg)` is the main entry point called from `app/electric-provider.tsx`

### Distribution / tier system

Two build flavors controlled by `NEXT_PUBLIC_DISTRIBUTION` env var (`free` | `premium`):
- Config loaded from `/config.json` (prod) or `/config-dev-{distribution}.json` (dev)
- Dev configs live in `public/config-dev-free.json` and `public/config-dev-premium.json`
- Default is `premium` if env var unset

### Key entrypoints

| File | Role |
|---|---|
| `app/page.tsx` | Main app UI |
| `app/electric-provider.tsx` | PGlite + sync initialization, wraps entire app |
| `app/pglite-worker.ts` | Worker entry — DB init + migrations |
| `app/sync.ts` | ElectricSQL sync logic + auth token fetch |
| `lib/config/` | Distribution + sync config |
| `lib/sync/` | Offline queue system |
| `electron/database-handler.js` | Electron main-process DB access |
| `main.js` | Electron main process |

## TypeScript

- Strict mode on — no `any`, no `@ts-ignore`
- `next.config.ts` has `ignoreBuildErrors: true` — TypeScript errors won't fail `next build`, but LSP will catch them
- Path alias `@/*` maps to repo root (not `src/`)
- Three tsconfigs: `tsconfig.json` (app), `tsconfig.worker.json` (pglite worker), `tsconfig.server.json` (server)

## Code conventions

- **Components**: PascalCase files, `"use client"` first line for client components, default export
- **Hooks**: `lib/hooks/` with barrel `index.ts`
- **Imports**: `@/` for cross-module; relative for same-module siblings
- **Performance**: `useMemo`/`useCallback`/`memo` used heavily — match this pattern in new components
- **Tailwind CSS v4** — utility-first, global styles in `app/globals.scss`
- `reactStrictMode: false` in next.config.ts (intentional — prevents double DB init)

## Local backend setup

Docker Compose starts:
- PostgreSQL on `:54321` (container port 5432), db: `next_todo`, user: `postgres`, pw: `password`
- ElectricSQL on `:5133` (container port 3000), with `ELECTRIC_INSECURE: true`

Supabase is used in production. Local dev uses Docker for the Electric/Postgres stack and Supabase CLI for auth/functions.

## Resetting local data

- **Browser**: clear IndexedDB key `todo-local-db` in DevTools
- **Electron**: delete `~/Library/Application Support/[app-name]/pglite-data`
