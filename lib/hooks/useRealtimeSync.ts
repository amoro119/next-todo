'use client'

import { useEffect } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TodoDatabase } from '@/lib/db/dexie'
import { RealtimeSyncService } from '@/lib/supabase/realtime/RealtimeSyncService'
import type { RealtimeSyncConfig } from '@/lib/supabase/realtime/types'

export interface UseRealtimeSyncOptions {
  client: SupabaseClient
  db: TodoDatabase
  config?: Partial<RealtimeSyncConfig>
  enabled?: boolean
}

export function useRealtimeSync(options: UseRealtimeSyncOptions): void {
  const { client, db, config, enabled = true } = options

  useEffect(() => {
    if (!enabled) {
      console.log('[useRealtimeSync] Sync disabled by enabled=false')
      return
    }

    console.log('[useRealtimeSync] Initializing realtime sync...')
    const service = RealtimeSyncService.getInstance()

    service.initialize(client, db, config).catch((err) => {
      console.error('[useRealtimeSync] Failed to initialize realtime sync:', err)
    })

    return () => {
      console.log('[useRealtimeSync] Disconnecting realtime sync...')
      service.disconnect()
    }
  }, [client, db, enabled, JSON.stringify(config)])
}
