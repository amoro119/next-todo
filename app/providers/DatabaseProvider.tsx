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
        await initializeDatabase()
        if (cancelled) return

        if (supabase) {
          const service = RealtimeSyncService.getInstance()
          await service.initialize(supabase, db)
        }

        if (!cancelled) setIsReady(true)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      }
    }

    init()

    return () => {
      cancelled = true
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
