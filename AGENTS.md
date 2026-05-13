# PROJECT KNOWLEDGE BASE

**Generated:** 2026-05-13
**Commit:** 6fd5bc5
**Branch:** master

## OVERVIEW

Next.js 15 + Electron local-first todo app with goals tracking. Data lives in Dexie (IndexedDB), optionally synced to Supabase Realtime. Ships as both a web app and a packaged Electron desktop app.

**Core stack:** Next.js (App Router) · Dexie.js (local-first) · Supabase (sync/auth) · Hono (write-server) · Electron · TypeScript · Tailwind

## STRUCTURE

```
./
├── app/              # Next.js App Router: layout, page, providers
├── components/       # React UI components (todos, goals, modals, views)
├── lib/              # All business logic
│   ├── config/       # App config, distribution flags, sync config
│   ├── db/           # Dexie schema, API, types (the canonical data layer)
│   ├── goals/        # Goal computation/business logic
│   ├── hooks/        # React hooks (Dexie queries, sync status, keyboard)
│   ├── performance/  # INP/rendering performance monitors
│   ├── recurring/    # Recurring task scheduling logic
│   ├── search/       # Full-text search over local DB
│   ├── supabase/     # Sync engine: client, realtime, operations, tests
│   └── user/         # User state (subscription tier, premium flags)
├── backend/          # Node.js PostgreSQL config for write-server
├── electron/         # Electron main-process entry (main.ts)
├── supabase/         # Supabase Edge Functions (ingest, token-issuer, gatekeeper)
├── scripts/          # Build/validate/prepare scripts
├── spec/             # Chinese-language design specs (not code)
└── skills/           # OpenCode AI skill definitions
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add/change DB tables | `lib/db/schema.ts` → `lib/db/dexie.ts` | Bump Dexie version in dexie.ts |
| Add DB operations | `lib/db/databaseAPI.ts` | All mutations go through DatabaseAPI |
| React data fetching | `lib/hooks/useDexieQuery.ts` | Uses `useLiveQuery` from dexie-react-hooks |
| Supabase sync | `lib/supabase/realtime/` | RealtimeSyncService orchestrates up/down |
| Feature flags | `lib/config/distributionConfig.ts` | Controls free/premium feature gating |
| App init order | `app/providers/DatabaseProvider.tsx` | DB init → Supabase sync start |
| Recurring tasks | `lib/recurring/` | Separate from main todo logic |
| Goal tracking | `lib/goals/` + `components/goals/` | Progress computed locally |
| Electron packaging | `scripts/` + `electron/main.ts` | Multiple build variants (free/premium) |
| Write-server | `backend/` + `supabase/functions/write-server/` | Hono server for remote writes |

## ARCHITECTURE — LOCAL-FIRST SYNC

Data flows: **Dexie (IndexedDB) ← → Supabase Realtime**

- All reads/writes go through `DatabaseAPI` (from `lib/db/databaseAPI.ts`) — never query Dexie directly in components
- Dexie schema uses soft-delete (`deleted_at`) and `updated_at` for conflict-free sync
- Supabase records omit `user_id`/`deleted_at`; mapped in `syncOperations.ts` via `toSupabaseRecord` / `fromSupabaseRow`
- Sync is optional — app works fully offline; `lib/config/syncConfig.ts` controls sync enable state
- Distribution variants: `dev:free`, `dev:premium`, `dev:local` (no sync) controlled by env vars

## COMMANDS

```bash
npm run dev              # Standard dev (remote Supabase)
npm run dev:local        # Local dev (no Supabase sync)
npm run dev:free         # Dev with free-tier feature flags
npm run dev:premium      # Dev with premium feature flags
npm run backend:up       # Start local Supabase via Docker
npm run test             # Vitest (jsdom env)
npm run lint             # ESLint
npm run build            # Production build
npm run electron:build   # Electron packaging
```

## CONVENTIONS

- **No `src/` directory** — lib/app/components are all at root
- **`reactStrictMode: false`** in next.config.ts — prevents double-initialization of Dexie
- **`ignoreBuildErrors: true`** — TypeScript errors don't block builds; type issues may exist
- **Soft deletes only** — set `deleted_at`, never `DELETE` from Dexie tables
- **Chinese comments** — internal comments and commit messages are in Chinese
- Test files live in `lib/supabase/__tests__/` (not co-located with source)
- Vitest has TWO configs: `vitest.config.ts` (jsdom) and `vitest.test.config.ts` (node, single-fork)

## ANTI-PATTERNS (THIS PROJECT)

- Do NOT import Dexie `db` directly in components — use `useDatabase()` hook or `DatabaseAPI`
- Do NOT use React strict mode — already disabled, double-init breaks Dexie setup
- Do NOT write sync logic outside `lib/supabase/` — sync is isolated by design
- Do NOT add server components that depend on real-time local state — this is a CSR-heavy app
- Do NOT delete records from Dexie — use soft-delete (`deleted_at` timestamp)

## NOTES

- `vitest.config.ts.bak` in repo root — stale backup, ignore
- `spec/` contains Chinese-language markdown design documents — not runnable
- `.sisyphus/` is AI agent state — not app code
- Electron build has 3 variants: base, free, premium — each with separate build scripts
- Write-server (`npm run write-server`) is a standalone Hono process, not Next.js API routes
- `lib/supabase/__tests__/` uses vitest node env with `pool: 'forks'` and `maxWorkers: 1` (serialized)
