import React, { createContext, useContext, useMemo } from 'react'
import { createTodoStore } from './todoStore'
import { createListStore } from './listStore'
import { createGoalStore } from './goalStore'
import type { DatabaseAPI } from '@/lib/db/databaseAPI'

// ---------------------------------------------------------------------------
// Factory — create all stores from a single DatabaseAPI instance
// ---------------------------------------------------------------------------

export function createAllStores(api: DatabaseAPI) {
  return {
    todoStore: createTodoStore(api),
    listStore: createListStore(api),
    goalStore: createGoalStore(api),
  }
}

// ---------------------------------------------------------------------------
// React Context types
// ---------------------------------------------------------------------------

export type StoreContextValue = ReturnType<typeof createAllStores>

export const StoreContext = createContext<StoreContextValue | null>(null)

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function StoreProvider({
  api,
  children,
}: {
  api: DatabaseAPI
  children: React.ReactNode
}) {
  const stores = useMemo(() => createAllStores(api), [api])
  return React.createElement(StoreContext.Provider, { value: stores }, children)
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStores(): StoreContextValue {
  const stores = useContext(StoreContext)
  if (!stores) {
    throw new Error('useStores must be used within a StoreProvider')
  }
  return stores
}
