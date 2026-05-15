// lib/config/supabaseStorage.ts
// localStorage 读写模块 for Supabase configuration

const STORAGE_KEY_URL = 'supabase_url';
const STORAGE_KEY_ANON_KEY = 'supabase_anon_key';
const CHANGE_EVENT = 'supabaseConfigChanged';

function hasLocalStorage(): boolean {
  return typeof localStorage !== 'undefined';
}

function hasWindow(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Read Supabase URL and anon key from localStorage.
 * Returns null for both when not set or in SSR.
 */
export function getSupabaseConfig(): { url: string | null; anonKey: string | null } {
  if (!hasLocalStorage()) {
    return { url: null, anonKey: null };
  }

  return {
    url: localStorage.getItem(STORAGE_KEY_URL),
    anonKey: localStorage.getItem(STORAGE_KEY_ANON_KEY),
  };
}

/**
 * Save Supabase URL and anon key to localStorage.
 * Dispatches a `supabaseConfigChanged` CustomEvent on window.
 * SSR-safe: no-op when window/localStorage is unavailable.
 */
export function saveSupabaseConfig(url: string, anonKey: string): void {
  if (!hasLocalStorage()) return;

  localStorage.setItem(STORAGE_KEY_URL, url);
  localStorage.setItem(STORAGE_KEY_ANON_KEY, anonKey);

  if (hasWindow()) {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

/**
 * Remove Supabase URL and anon key from localStorage.
 * SSR-safe: no-op when window/localStorage is unavailable.
 */
export function clearSupabaseConfig(): void {
  if (!hasLocalStorage()) return;

  localStorage.removeItem(STORAGE_KEY_URL);
  localStorage.removeItem(STORAGE_KEY_ANON_KEY);
}

/**
 * Check if both Supabase URL and anon key exist (non-null, non-empty) in localStorage.
 * Returns false when values are missing, empty, or in SSR.
 */
export function hasSupabaseConfig(): boolean {
  if (!hasLocalStorage()) return false;

  const url = localStorage.getItem(STORAGE_KEY_URL);
  const anonKey = localStorage.getItem(STORAGE_KEY_ANON_KEY);

  return !!url && !!anonKey && url.length > 0 && anonKey.length > 0;
}
