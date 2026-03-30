# AGENTS.md

This file provides guidance for AI coding agents working in this repository.

## Project Overview

Local-first todo application built with Next.js 15, Electron, and PGlite. Uses ElectricSQL for synchronization between local and remote PostgreSQL databases. Works as both web app and desktop application.

## Build/Lint/Test Commands

```bash
# Development (web)
npm run next:dev

# Development (desktop)
npm run electron:dev

# Production build
npm run build

# Linting
npm run lint

# No test command configured - project uses Vitest but no test files exist
# To run single test (when added): npx vitest run <test-file>
```

## Code Style Guidelines

### File Naming
- **Components**: PascalCase (e.g., `TodoList.tsx`, `GoalModal.tsx`)
- **Component folders**: kebab-case (e.g., `components/goals/`)
- **Utils/Helpers**: camelCase (e.g., `csvParser.ts`, `dateUtils.ts`)
- **Barrel exports**: `index.ts` in lib subdirectories

### Imports
- **@/ alias**: Use for cross-module imports from `lib/` and `components/`:
  ```typescript
  import { Todo } from '@/lib/types';
  import TodoModal from '@/components/TodoModal';
  ```
- **Relative paths**: Use within same module or sibling imports:
  ```typescript
  import { Todo } from '../types';
  ```

### Component Patterns
- First line: `"use client"` for client components
- Use default exports for components
- Use `memo` and `forwardRef` for performance-critical components:
  ```typescript
  const TodoItem = memo(forwardRef<HTMLLIElement, TodoItemProps>(...));
  TodoItem.displayName = "TodoItem";
  ```
- Define Props interface at top of file

### TypeScript
- **Interfaces** for object shapes and props
- **Types** for unions and utilities
- **Enums** for constants
- **Strict mode**: Enabled - no `any` suppression
- Use path alias `@/*` configured in tsconfig.json

### Error Handling
- Wrap async operations in try/catch
- Use typed error results:
  ```typescript
  interface SyncErrorResult {
    type: 'network' | 'auth' | 'config' | 'unknown';
    message: string;
    canRetry: boolean;
  }
  ```
- Log errors with context, provide user-friendly alerts
- Graceful degradation - don't crash on errors

### Styling
- **Tailwind CSS v4** with PostCSS
- Use utility classes, avoid custom CSS when possible
- Global styles in `app/globals.scss`

### Performance
- Heavy use of `useMemo`, `useCallback`, `memo` throughout
- Use `useRef` for one-time initialization flags
- Implement caching for expensive computations

### State Management
- React hooks (useState, useEffect)
- Custom hooks in `lib/hooks/` with barrel exports
- `useLiveQuery` from @electric-sql/pglite-react for reactive queries

## Architecture

- **Frontend**: Next.js 15 with App Router, React 19
- **Database**: PGlite (embedded PostgreSQL in browser/Electron)
- **Sync**: ElectricSQL for bidirectional sync
- **Desktop**: Electron with main process database handler
- **Build**: Electron Builder for macOS/Windows/Linux

## Key Directories

- `app/` - Next.js pages and providers
- `components/` - React UI components (PascalCase)
- `lib/` - Business logic, utilities, hooks, sync system
- `db/` - Database migrations and schema
- `electron/` - Electron-specific code
- `supabase/` - Supabase functions and config

## Dependencies

Key packages: Next.js 15, React 19, PGlite, ElectricSQL, Electron, Tailwind CSS v4, date-fns, uuid

## Notes

- No Cursor rules or Copilot instructions exist in this repo
- No existing AGENTS.md file found
- CLAUDE.md exists with Chinese-language guidelines
- No tests currently implemented despite Vitest being present
