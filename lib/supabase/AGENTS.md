# lib/supabase — Sync Engine

**All Supabase interaction is isolated here. Sync is optional and works independently of the UI layer.**

## STRUCTURE

```
lib/supabase/
├── client.ts                  # Supabase client singleton
├── index.ts                   # Re-exports
├── syncOperations.ts          # toSupabaseRecord / fromSupabaseRow field mapping
├── realtime/
│   ├── RealtimeSyncService.ts # Orchestrates up/down sync lifecycle
│   ├── types.ts               # RealtimeSyncTable, SyncRecord types
│   ├── handlers/              # Per-table sync handlers (3 files)
│   └── ...
└── __tests__/                 # Integration tests (8 files, node env, serialized)
```

## KEY ARCHITECTURE

Supabase schema differs from Dexie schema:
- Dexie has: `user_id`, `deleted_at`, `updated_at`
- Supabase has: `deleted` (bool), `modified` (timestamp) — no `user_id`
- `syncOperations.ts` handles the mapping both ways

## CONVENTIONS

- `RealtimeSyncService` is started in `DatabaseProvider` after DB init, not at module load
- `fromSupabaseRow` injects `user_id: 'default_user'` for all downloaded records
- Tests in `__tests__/` run with `vitest.test.config.ts` (node env, `pool: 'forks'`, `maxWorkers: 1`) — must be serialized

## ANTI-PATTERNS

- Do not start sync before `initializeDatabase()` completes
- Do not write sync logic outside this directory
- Do not import `supabase` client in components — use hooks or `DatabaseProvider`
- Tests here must NOT use jsdom — they require node environment
