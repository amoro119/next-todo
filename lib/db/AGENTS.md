# lib/db — Data Layer

**Canonical data access layer. All component data flow routes through here.**

## FILES

| File | Role |
|------|------|
| `schema.ts` | Dexie index definitions (SCHEMA const) — edit here to add columns/indexes |
| `dexie.ts` | Dexie instance + version + `initializeDatabase()` — bump version on schema change |
| `databaseAPI.ts` | `DatabaseAPI` interface + `createDexieDatabaseAPI()` — all mutations here |
| `types.ts` | Shared TypeScript types for DB entities |
| `index.ts` | Re-exports |

## SCHEMA

Tables: `lists`, `todos`, `goals`, `goal_progress`, `meta`

All tables have: `id` (primary), `user_id`, `deleted_at`, `updated_at`

## CONVENTIONS

- Adding a table: update `schema.ts` → `dexie.ts` (bump version + add migration) → `types.ts` → `databaseAPI.ts`
- All mutations return the mutated record or void — never throw silently
- `meta` table is key-value store for app state (sync timestamps, etc.)

## ANTI-PATTERNS

- Never import `db` directly in components — inject via `useDatabase()` context
- Never hard-delete rows — set `deleted_at: new Date().toISOString()`
- Never skip version bump when changing schema — Dexie will throw on open
