import { performInitialSync } from '../realtime/InitialSyncManager'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { TodoDatabase } from '@/lib/db/dexie'
import type { Todo, List, Goal, GoalProgress } from '@/lib/db/types'
import type { SyncRecord } from '../realtime/types'

async function main() {
  const calls: string[] = []

  const mockDb = {
    todos: {
      toArray: async () => [] as Todo[],
      put: async (item: Todo) => { calls.push(`put:todos:${item.id}`); return 'ok' },
    },
    lists: {
      toArray: async () => [] as List[],
      put: async (item: List) => { calls.push(`put:lists:${item.id}`); return 'ok' },
    },
    goals: {
      toArray: async () => [] as Goal[],
      put: async (item: Goal) => { calls.push(`put:goals:${item.id}`); return 'ok' },
    },
    goal_progress: {
      toArray: async () => [] as GoalProgress[],
      put: async (item: GoalProgress) => { calls.push(`put:goal_progress:${item.id}`); return 'ok' },
    },
  } as unknown as TodoDatabase

  const mockClient = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          then: (resolve: (v: { data: SyncRecord[]; error: null }) => void) => resolve({ data: [], error: null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient

  const progressEvents: Array<{ table: string; phase: string }> = []

  await performInitialSync(mockClient, mockDb, {
    onProgress: (p) => {
      progressEvents.push({ table: p.table, phase: p.phase })
    },
  })

  console.log('Events:', progressEvents.length)
  const tables = [...new Set(progressEvents.map(e => e.table))]
  console.log('Tables:', tables.sort())

  let passed = true
  for (const table of ['todos', 'lists', 'goals', 'goal_progress']) {
    const te = progressEvents.filter(e => e.table === table)
    const phases = te.map(e => e.phase)
    console.log(`  ${table}: ${phases.join(' → ')}`)
    if (!phases.includes('downloading')) { console.log(`  FAIL: ${table} no downloading`); passed = false }
    if (!phases.includes('done')) { console.log(`  FAIL: ${table} no done`); passed = false }
  }

  if (passed) console.log('ALL CHECKS PASSED')
  else { console.log('SOME CHECKS FAILED'); process.exit(1) }
}

main().catch(err => { console.error('FAIL:', err); process.exit(1) })
