'use client'

import { useState, useEffect } from 'react'
import { RealtimeSyncService } from '@/lib/supabase/realtime/RealtimeSyncService'
import type { RealtimeSyncState } from '@/lib/supabase/realtime/types'

export function useSyncStatus(): RealtimeSyncState {
  const [state, setState] = useState<RealtimeSyncState>({
    isConnected: false,
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    connectionStatus: 'disconnected',
    pendingOperations: 0,
  })

  useEffect(() => {
    const service = RealtimeSyncService.getInstance()
    setState(service.getState())
    return service.subscribeToStateChanges((newState) => {
      setState(newState)
    })
  }, [])

  return state
}
