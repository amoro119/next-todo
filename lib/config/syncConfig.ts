// lib/config/syncConfig.ts

import { hasSupabaseConfig } from './supabaseStorage';

export interface SyncConfig {
  enabled: boolean;
  reason?: string;
}

/**
 * Compare two SyncConfig objects for equality
 */
export function isSyncConfigEqual(a: SyncConfig, b: SyncConfig): boolean {
  return a.enabled === b.enabled && a.reason === b.reason;
}

// Cache to avoid recomputing on every call
let cachedSyncConfig: SyncConfig | null = null;
let lastSyncCacheTime = 0;
const SYNC_CACHE_TTL = 3000; // 3 second cache

/**
 * Get the current Supabase sync configuration based on environment and user preference.
 */
export function getSupabaseSyncConfig(): SyncConfig {
  // Server-side rendering: default to disabled (no browser env)
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { enabled: false, reason: 'server_side' };
  }

  const now = Date.now();
  if (cachedSyncConfig && now - lastSyncCacheTime < SYNC_CACHE_TTL) {
    return cachedSyncConfig;
  }

  const hasConfig = hasSupabaseConfig();
  const userPref =
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('sync_enabled') !== 'false'
      : true;

  let syncConfig: SyncConfig;

  if (!hasConfig) {
    syncConfig = { enabled: false, reason: 'missing_config' };
  } else if (!userPref) {
    syncConfig = { enabled: false, reason: 'user_disabled' };
  } else {
    syncConfig = { enabled: true };
  }

  cachedSyncConfig = syncConfig;
  lastSyncCacheTime = now;

  return syncConfig;
}

/**
 * @deprecated Use getSupabaseSyncConfig() instead.
 * Kept for backward compatibility — delegates to getSupabaseSyncConfig().
 */
export const getSyncConfig = getSupabaseSyncConfig;

export const setSyncNetworkError = (hasError: boolean) => {
  if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
    return;
  }

  if (hasError) {
    sessionStorage.setItem('sync_network_error', 'true');
  } else {
    sessionStorage.removeItem('sync_network_error');
  }

  cachedSyncConfig = null;
  lastSyncCacheTime = 0;

  window.dispatchEvent(new CustomEvent('syncConfigChanged'));
};

/**
 * Clear the sync config cache
 */
export const clearSyncConfigCache = () => {
  cachedSyncConfig = null;
  lastSyncCacheTime = 0;
};

export const getSyncDisabledMessage = (reason?: string): string => {
  switch (reason) {
    case 'missing_config':
      return 'Supabase not configured — local mode';
    case 'user_disabled':
      return 'Sync disabled in preferences — local mode';
    default:
      return 'Local mode';
  }
};
