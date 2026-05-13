# components — UI Layer

**All React UI components. CSR-only — no server components.**

## STRUCTURE

```
components/
├── TodoList.tsx            # Main todo list with virtualization
├── TodoModal.tsx           # Create/edit todo modal
├── CalendarView.tsx        # Calendar layout for todos
├── ViewSwitcher.tsx        # Inbox / Calendar / Goals view toggle
├── ModeSwitcher.tsx        # Free/premium mode indicator
├── TaskSearchModal.tsx     # Full-text search UI
├── ManageListsModal.tsx    # List CRUD modal
├── RecurrenceSelector.tsx  # Recurring task config UI
├── GoalGroup.tsx           # Goal display with progress
├── UpgradePrompt.tsx       # Premium upsell component
├── *PerformanceOptimizer*  # INP optimization wrappers (3 files)
└── goals/                  # Goal-specific components (8 files)
```

## CONVENTIONS

- All data fetching via hooks from `lib/hooks/` — no direct Dexie or API calls in components
- `useDatabase()` from `app/providers/DatabaseProvider` for mutations
- Performance-sensitive lists use `OptimizedTodoList` wrapper (INP monitoring)
- Modal components manage their own keyboard traps via `useFocusTrap` / `useModalKeyboardManager`

## ANTI-PATTERNS

- Do not import `db` or `DatabaseAPI` directly — always go through `useDatabase()` hook
- Do not add server-side data fetching — app is fully CSR
- Do not add new performance optimizer wrappers without measuring INP first
