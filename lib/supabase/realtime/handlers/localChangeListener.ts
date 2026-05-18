import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeSyncTable, SyncRecord } from '../types'
import { uploadLocalChanges } from '../../syncOperations'
import type { OfflineQueue } from '../offlineQueue'
import {
  listenDataChange,
  isRemoteSource,
  TODO_DATA_CHANGED,
  LIST_DATA_CHANGED,
  GOAL_DATA_CHANGED,
} from '@/lib/stores/events'
import type { CrudAction } from '@/lib/stores/events'

export interface LocalChangeListenerOptions {
  client: SupabaseClient
  offlineQueue: OfflineQueue
  onUpload?: (table: RealtimeSyncTable, record: SyncRecord) => Promise<void>
}

function actionToOperation(action: CrudAction): 'insert' | 'update' | 'delete' {
  if (action === 'create') return 'insert'
  if (action === 'delete') return 'delete'
  return 'update'
}

export function startLocalChangeListener(options: LocalChangeListenerOptions): () => void {
  const { client, offlineQueue, onUpload } = options

  function makeHandler(table: RealtimeSyncTable) {
    return (event: CustomEvent) => {
      if (isRemoteSource(event)) return
      const record = event.detail.record as SyncRecord
      const operation = actionToOperation(event.detail.action as CrudAction)
      if (window.navigator.onLine) {
        const upload = onUpload ? onUpload(table, record) : uploadLocalChanges(client, table, [record])
        upload.catch(() => undefined)
      } else {
        offlineQueue.enqueue({ table, operation, record })
      }
    }
  }

  const cleanupTodos = listenDataChange(TODO_DATA_CHANGED, makeHandler('todos'))
  const cleanupLists = listenDataChange(LIST_DATA_CHANGED, makeHandler('lists'))
  const cleanupGoals = listenDataChange(GOAL_DATA_CHANGED, makeHandler('goals'))

  return () => {
    cleanupTodos()
    cleanupLists()
    cleanupGoals()
  }
}
