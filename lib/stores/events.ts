// lib/stores/events.ts
// CustomEvent type definitions + dispatch/listen utilities for data-change events.
// Foundation module for all stores and sync components — no Supabase/Dexie dependency.

import type { Todo, List, Goal } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// Event name constants
// ---------------------------------------------------------------------------

export const TODO_DATA_CHANGED = 'todoDataChanged'
export const LIST_DATA_CHANGED = 'listDataChanged'
export const GOAL_DATA_CHANGED = 'goalDataChanged'

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export type SyncEventSource = 'local' | 'remote'
export type CrudAction = 'create' | 'update' | 'delete'

// ---------------------------------------------------------------------------
// Per-table payload interfaces
// ---------------------------------------------------------------------------

export interface TodoChangePayload {
  source: SyncEventSource
  action: CrudAction
  id: string
  record: Todo | null
  table: 'todos'
}

export interface ListChangePayload {
  source: SyncEventSource
  action: CrudAction
  id: string
  record: List | null
  table: 'lists'
}

export interface GoalChangePayload {
  source: SyncEventSource
  action: CrudAction
  id: string
  record: Goal | null
  table: 'goals'
}

// ---------------------------------------------------------------------------
// Lookup: table name → event name
// ---------------------------------------------------------------------------

const TABLE_TO_EVENT: Record<string, string> = {
  todos: TODO_DATA_CHANGED,
  lists: LIST_DATA_CHANGED,
  goals: GOAL_DATA_CHANGED,
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

export function dispatchDataChange(
  table: 'todos',
  detail: TodoChangePayload
): void
export function dispatchDataChange(
  table: 'lists',
  detail: ListChangePayload
): void
export function dispatchDataChange(
  table: 'goals',
  detail: GoalChangePayload
): void
export function dispatchDataChange(
  table: string,
  detail: TodoChangePayload | ListChangePayload | GoalChangePayload
): void {
  const eventName = TABLE_TO_EVENT[table]

  window.dispatchEvent(new CustomEvent(eventName, { detail }))
}

// ---------------------------------------------------------------------------
// Listen
// ---------------------------------------------------------------------------

export function listenDataChange(
  eventName: string,
  handler: (e: CustomEvent) => void
): () => void {
  const listener = (e: Event) => handler(e as CustomEvent)
  window.addEventListener(eventName, listener)

  return () => {
    window.removeEventListener(eventName, listener)
  }
}

// ---------------------------------------------------------------------------
// Source check helper
// ---------------------------------------------------------------------------

export function isRemoteSource(event: CustomEvent): boolean {
  return event.detail.source === 'remote'
}
