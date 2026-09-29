'use client'

import { startTransition, useState, useEffect } from 'react'
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
    blockedOperations: 0,
    protocolVersion: null,
    lastSnapshotTime: null,
    lastDrainTime: null,
    nextRetryAt: null,
    blockedReason: null,
    channelStates: {},
  })

  useEffect(() => {
    const service = RealtimeSyncService.getInstance()
    setState(service.getState())
    return service.subscribeToStateChanges((newState) => {
      // Sync status is informative UI. Let drawer open/close and editing
      // interactions win when the service emits a burst of queue updates.
      startTransition(() => setState(newState))
    })
  }, [])

  return state
}

/**
 * A low-cost subscription for chrome that only needs the syncing indicator.
 * Queue counters and channel transitions can be frequent during a sync burst;
 * they should not re-render the navigation tree.
 */
export function useIsSyncing(): boolean {
  const [isSyncing, setIsSyncing] = useState(false)

  useEffect(() => {
    const service = RealtimeSyncService.getInstance()
    setIsSyncing(service.getState().isSyncing)
    return service.subscribeToStateChanges((newState) => {
      setIsSyncing((current) => current === newState.isSyncing ? current : newState.isSyncing)
    })
  }, [])

  return isSyncing
}
