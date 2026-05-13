# lib/hooks — React Hooks

**All Dexie reactive queries and app-level hooks live here.**

## FILES

| File | Role |
|------|------|
| `useDexieQuery.ts` | Generic `useLiveQuery` wrapper — primary reactive data hook |
| `useAppConfig.ts` | Reads distribution config + user state |
| `useRealtimeSync.ts` | Manages sync service lifecycle in React |
| `useSyncStatus.ts` | Sync status (online/offline/error) for UI |
| `useKeyboardShortcuts.ts` | Global keyboard shortcut registration |
| `useModalKeyboardManager.ts` | Modal-scoped keyboard trap coordination |
| `useFocusTrap.ts` | Accessibility focus containment |
| `useDebounce.ts` | Standard debounce hook |
| `index.ts` | Re-exports |

## CONVENTIONS

- Dexie reactive queries use `useDexieQuery` (wraps `useLiveQuery`) — not raw `useLiveQuery`
- Hooks that read DB always go through `useDatabase()` context to get the `api` or `db` instance
- Sync hooks (`useRealtimeSync`, `useSyncStatus`) are consumed only in providers, not leaf components

## ANTI-PATTERNS

- Do not call `useLiveQuery` directly in components — use `useDexieQuery`
- Do not manage sync lifecycle outside `useRealtimeSync`
