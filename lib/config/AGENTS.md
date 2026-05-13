# lib/config — App Configuration

**Feature flags, distribution variants, sync config, and initialization.**

## FILES

| File | Role |
|------|------|
| `distributionConfig.ts` | Free/premium feature gating — `isFeatureEnabled()`, `shouldShowUpgradePrompts()` |
| `syncConfig.ts` | Sync enable/disable state, network error tracking |
| `initConfig.ts` | `initializeAppConfig()` — must run before any feature flag reads |
| `configValidator.ts` | Validates config consistency at startup |
| `index.ts` | Re-exports + `networkStatusManager` + `getAppConfig()` |

## DISTRIBUTION VARIANTS

Controlled by env vars set in npm scripts:
- `dev:local` / `dev:local:free` / `dev:local:premium` — no Supabase sync
- `dev:free` / `dev:premium` — remote Supabase, different feature sets
- `build:free` / `build:premium` / `build:both` — separate production bundles

## CONVENTIONS

- Always call `waitForConfigInitialization()` before reading config in async contexts
- `isFeatureEnabled(key)` is the canonical feature gate — never hardcode tier checks
- `getAppConfig()` returns combined user + sync + network state snapshot

## ANTI-PATTERNS

- Do not read `distributionConfig` before `initializeAppConfig()` resolves
- Do not bypass `isFeatureEnabled()` with direct env var checks in components
