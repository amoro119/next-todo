import { createClient, SupabaseClient } from '@supabase/supabase-js'

let supabaseInstance: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient | null {
  // SSR guard — localStorage not available on server
  if (typeof window === 'undefined') {
    return null
  }

  if (!supabaseInstance) {
    const url = localStorage.getItem('supabase_url')
    const key = localStorage.getItem('supabase_anon_key')

    if (!url || !key) {
      return null
    }

    supabaseInstance = createClient(url, key)
  }
  return supabaseInstance
}

export const supabase = getSupabaseClient()
