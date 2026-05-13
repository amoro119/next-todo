'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { initializeDatabase, db } from '@/lib/db/dexie'
import { createDexieDatabaseAPI, type DatabaseAPI } from '@/lib/db/databaseAPI'
import { supabase } from '@/lib/supabase/client'
import { RealtimeSyncService } from '@/lib/supabase/realtime/RealtimeSyncService'

interface DatabaseContextValue {
  db: typeof db
  api: DatabaseAPI
  isReady: boolean
  error: string | null
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null)

export function useDatabase(): DatabaseContextValue {
  const ctx = useContext(DatabaseContext)
  if (!ctx) throw new Error('useDatabase must be used within DatabaseProvider')
  return ctx
}

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isReady, setIsReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [api] = useState(() => createDexieDatabaseAPI(db))

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        console.log('[DatabaseProvider] Initializing database...')
        await initializeDatabase()
        console.log('[DatabaseProvider] Database initialized')

        const todosBefore = await db.todos.toArray()
        const listsBefore = await db.lists.toArray()
        const goalsBefore = await db.goals.toArray()
        console.log('[DatabaseProvider] Before sync:', {
          todos: todosBefore.length,
          lists: listsBefore.length,
          goals: goalsBefore.length,
          todos_deleted_count: todosBefore.filter(t => t.deleted_at != null).length,
          todos_no_deleted_at: todosBefore.filter(t => t.deleted_at === undefined).length,
        })

        if (cancelled) return

        if (supabase) {
          console.log('[DatabaseProvider] Supabase client available, initializing realtime sync...')
          const service = RealtimeSyncService.getInstance()
          await service.initialize(supabase, db)
          console.log('[DatabaseProvider] Realtime sync initialized')
        } else {
          console.log('[DatabaseProvider] No Supabase client, skipping sync')
        }

        const todosAfter = await db.todos.toArray()
        const listsAfter = await db.lists.toArray()
        const goalsAfter = await db.goals.toArray()
        console.log('[DatabaseProvider] After sync:', {
          todos: todosAfter.length,
          lists: listsAfter.length,
          goals: goalsAfter.length,
          todos_deleted_count: todosAfter.filter(t => t.deleted_at != null).length,
          todos_no_deleted_at: todosAfter.filter(t => t.deleted_at === undefined).length,
        })

        if (!cancelled) setIsReady(true)
      } catch (err) {
        console.error('[DatabaseProvider] Initialization failed:', err)
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    init()

    return () => {
      cancelled = true
      console.log('[DatabaseProvider] Cleaning up, disconnecting sync...')
      const service = RealtimeSyncService.getInstance()
      service.disconnect()
    }
  }, [])

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-red-500">Database initialization failed: {error}</div>
      </div>
    )
  }

  if (!isReady) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
      </div>
    )
  }

  return (
    <DatabaseContext.Provider value={{ db, api, isReady, error }}>
      {children}
    </DatabaseContext.Provider>
  )
}
