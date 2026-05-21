'use client'

import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/lib/db/dexie'
import type { Todo, List, Goal } from '@/lib/db/types'

export interface QueryResult<T> {
  data: T[]
  isLoading: boolean
  error: Error | null
}

export function useTodosQuery(listId?: string): QueryResult<Todo> {
  const data = useLiveQuery(
    () => {
      if (listId) {
        return db.todos
          .where({ list_id: listId })
          .toArray()
      }
      return db.todos.toArray()
    },
    [listId],
  )

  if (data !== undefined) {
    const deletedCount = data.filter(t => t.deleted_at !== null).length
    console.log(`[useDexieQuery] useTodosQuery returned ${data.length} todos (${deletedCount} soft-deleted)`)
  }

  return {
    data: data ?? [],
    isLoading: data === undefined,
    error: null,
  }
}

export function useListsQuery(): QueryResult<List> {
  const data = useLiveQuery(
    () => db.lists.filter(t => t.deleted_at === null).toArray(),
    [],
  )

  return {
    data: data ?? [],
    isLoading: data === undefined,
    error: null,
  }
}

export function useGoalsQuery(): QueryResult<Goal> {
  const data = useLiveQuery(
    () => db.goals.filter(t => t.deleted_at === null).toArray(),
    [],
  )

  return {
    data: data ?? [],
    isLoading: data === undefined,
    error: null,
  }
}
