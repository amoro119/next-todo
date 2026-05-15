import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
  hasSupabaseConfig,
} from '../supabaseStorage';

describe('supabaseStorage', () => {
  beforeEach(() => {
    // Guard: previous SSR tests may have stubbed localStorage to undefined
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
    // Reset global stubs after each test
    vi.unstubAllGlobals();
  });

  describe('getSupabaseConfig', () => {
    it('returns null values when localStorage is empty', () => {
      const result = getSupabaseConfig();
      expect(result).toEqual({ url: null, anonKey: null });
    });

    it('reads stored values from localStorage', () => {
      localStorage.setItem('supabase_url', 'https://example.supabase.co');
      localStorage.setItem('supabase_anon_key', 'abc-123');

      const result = getSupabaseConfig();
      expect(result).toEqual({
        url: 'https://example.supabase.co',
        anonKey: 'abc-123',
      });
    });

    it('returns null values when localStorage is undefined (SSR)', () => {
      vi.stubGlobal('localStorage', undefined);

      const result = getSupabaseConfig();
      expect(result).toEqual({ url: null, anonKey: null });
    });
  });

  describe('saveSupabaseConfig', () => {
    it('writes values to localStorage', () => {
      saveSupabaseConfig('https://test.supabase.co', 'key-456');

      expect(localStorage.getItem('supabase_url')).toBe('https://test.supabase.co');
      expect(localStorage.getItem('supabase_anon_key')).toBe('key-456');
    });

    it('dispatches supabaseConfigChanged CustomEvent', () => {
      const listener = vi.fn();
      window.addEventListener('supabaseConfigChanged', listener);

      saveSupabaseConfig('https://test.supabase.co', 'key-456');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'supabaseConfigChanged',
        })
      );
    });

    it('does not throw when localStorage is undefined (SSR)', () => {
      vi.stubGlobal('localStorage', undefined);

      expect(() => {
        saveSupabaseConfig('https://test.supabase.co', 'key-456');
      }).not.toThrow();
    });
  });

  describe('clearSupabaseConfig', () => {
    it('removes both values from localStorage', () => {
      localStorage.setItem('supabase_url', 'https://test.supabase.co');
      localStorage.setItem('supabase_anon_key', 'key-456');

      clearSupabaseConfig();

      expect(localStorage.getItem('supabase_url')).toBeNull();
      expect(localStorage.getItem('supabase_anon_key')).toBeNull();
    });

    it('does not throw when localStorage is undefined (SSR)', () => {
      vi.stubGlobal('localStorage', undefined);

      expect(() => {
        clearSupabaseConfig();
      }).not.toThrow();
    });
  });

  describe('hasSupabaseConfig', () => {
    it('returns false when nothing is stored', () => {
      expect(hasSupabaseConfig()).toBe(false);
    });

    it('returns true when both values are stored', () => {
      localStorage.setItem('supabase_url', 'https://test.supabase.co');
      localStorage.setItem('supabase_anon_key', 'key-456');

      expect(hasSupabaseConfig()).toBe(true);
    });

    it('returns false when only url is stored', () => {
      localStorage.setItem('supabase_url', 'https://test.supabase.co');

      expect(hasSupabaseConfig()).toBe(false);
    });

    it('returns false when only anonKey is stored', () => {
      localStorage.setItem('supabase_anon_key', 'key-456');

      expect(hasSupabaseConfig()).toBe(false);
    });

    it('returns false when values are empty strings', () => {
      localStorage.setItem('supabase_url', '');
      localStorage.setItem('supabase_anon_key', '');

      expect(hasSupabaseConfig()).toBe(false);
    });

    it('returns false after clearSupabaseConfig', () => {
      localStorage.setItem('supabase_url', 'https://test.supabase.co');
      localStorage.setItem('supabase_anon_key', 'key-456');

      clearSupabaseConfig();

      expect(hasSupabaseConfig()).toBe(false);
    });

    it('returns false when localStorage is undefined (SSR)', () => {
      vi.stubGlobal('localStorage', undefined);

      expect(hasSupabaseConfig()).toBe(false);
    });
  });
});
