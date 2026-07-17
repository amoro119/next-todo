import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeSyncTable, SyncRecord, SyncOperationResult } from './realtime/types'

// Supabase 现有表没有 user_id / deleted_at / updated_at 字段。
// todos 使用 deleted 标记软删除；lists/goals 的远端表不包含该字段。
function toSupabaseRecord(
  table: RealtimeSyncTable,
  record: SyncRecord,
): Record<string, unknown> {
  const { user_id, deleted_at, updated_at, deleted, ...rest } = record as Record<string, unknown>
  void user_id
  const payload: Record<string, unknown> = {
    ...rest,
    modified: updated_at || new Date().toISOString(),
  }

  if (table === 'todos') {
    payload.deleted = !!deleted_at || deleted === true
  }

  return payload
}

// 下载后将 Supabase 字段映射回 Dexie 字段
export function fromSupabaseRow(row: Record<string, unknown>): SyncRecord {
  return {
    ...row,
    user_id: 'default_user',
    deleted: !!row.deleted,
    deleted_at: row.deleted ? new Date().toISOString() : null,
    updated_at: (row.modified as string) || new Date().toISOString(),
  } as SyncRecord
}

export async function fetchRemoteLatestTimestamp(
  client: SupabaseClient,
  table: RealtimeSyncTable,
): Promise<string | null> {
  console.log(`[SyncOps] fetchRemoteLatestTimestamp: ${table}`)
  const { data, error } = await client
    .from(table)
    .select('modified')
    .order('modified', { ascending: false })
    .limit(1)
    .single()

  if (error) {
    console.error(`[SyncOps] fetchRemoteLatestTimestamp failed for ${table}:`, error.message)
    return null
  }
  const result = (data as { modified: string } | null)?.modified ?? null
  console.log(`[SyncOps] fetchRemoteLatestTimestamp: ${table} = ${result}`)
  return result
}

export async function fetchRemoteAllRecords(
  client: SupabaseClient,
  table: RealtimeSyncTable,
): Promise<SyncRecord[]> {
  console.log(`[SyncOps] fetchRemoteAllRecords: ${table}`)

  const BATCH_SIZE = 1000
  let offset = 0
  let hasMore = true
  const allRecords: SyncRecord[] = []

  while (hasMore) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .order('id')
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      console.error(`[SyncOps] fetchRemoteAllRecords failed for ${table} at offset ${offset}:`, error.message)
      break
    }

    const batch = (data as Record<string, unknown>[] | null) ?? []
    allRecords.push(...batch.map(fromSupabaseRow))
    console.log(`[SyncOps] fetchRemoteAllRecords: ${table} batch offset=${offset}, received ${batch.length} records`)
    offset += BATCH_SIZE
    hasMore = batch.length === BATCH_SIZE
  }

  console.log(`[SyncOps] fetchRemoteAllRecords: ${table} total returned ${allRecords.length} records`)
  return allRecords
}

export async function upsertRecords(
  client: SupabaseClient,
  table: RealtimeSyncTable,
  records: SyncRecord[],
): Promise<SyncOperationResult> {
  console.log(`[SyncOps] upsertRecords: ${table} count=${records.length}`)
  const payload = records.map((record) => toSupabaseRecord(table, record))
  const { data, error } = await client.from(table).upsert(payload)

  if (error) {
    console.error(`[SyncOps] upsertRecords failed for ${table}:`, error.message)
    return { success: false, error: error.message }
  }

  const rows = (data as SyncRecord[] | null) ?? records
  console.log(`[SyncOps] upsertRecords: ${table} succeeded, affectedRows=${rows.length}`)
  return { success: true, affectedRows: rows.length }
}

export async function markRecordsAsDeleted(
  client: SupabaseClient,
  table: RealtimeSyncTable,
  ids: string[],
): Promise<SyncOperationResult> {
  console.log(`[SyncOps] markRecordsAsDeleted: ${table} ids=${ids.length}`)
  const { error } = await client
    .from(table)
    .update({ deleted: true, modified: new Date().toISOString() })
    .in('id', ids)

  if (error) {
    console.error(`[SyncOps] markRecordsAsDeleted failed for ${table}:`, error.message)
    return { success: false, error: error.message }
  }
  console.log(`[SyncOps] markRecordsAsDeleted: ${table} succeeded`)
  return { success: true }
}

export async function deleteRecordsFromSupabase(
  client: SupabaseClient,
  table: RealtimeSyncTable,
  ids: string[],
): Promise<SyncOperationResult> {
  console.log(`[SyncOps] deleteRecordsFromSupabase: ${table} ids=${ids.length}`)
  const { error } = await client
    .from(table)
    .delete()
    .in('id', ids)

  if (error) {
    console.error(`[SyncOps] deleteRecordsFromSupabase failed for ${table}:`, error.message)
    return { success: false, error: error.message }
  }
  console.log(`[SyncOps] deleteRecordsFromSupabase: ${table} succeeded`)
  return { success: true }
}

export async function uploadLocalChanges(
  client: SupabaseClient,
  table: RealtimeSyncTable,
  records: SyncRecord[],
): Promise<SyncOperationResult> {
  console.log(`[SyncOps] uploadLocalChanges: ${table} count=${records.length}`)
  const result = await upsertRecords(client, table, records)
  console.log(`[SyncOps] uploadLocalChanges: ${table} result=`, result)
  return result
}

export async function downloadRemoteChanges(
  client: SupabaseClient,
  table: RealtimeSyncTable,
  since: string,
): Promise<SyncRecord[]> {
  console.log(`[SyncOps] downloadRemoteChanges: ${table} since=${since}`)

  const BATCH_SIZE = 1000
  let offset = 0
  let hasMore = true
  const allRecords: SyncRecord[] = []

  while (hasMore) {
    const { data, error } = await client
      .from(table)
      .select('*')
      .gt('modified', since)
      .order('modified', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)

    if (error) {
      console.error(`[SyncOps] downloadRemoteChanges failed for ${table} at offset ${offset}:`, error.message)
      break
    }

    const batch = (data as Record<string, unknown>[] | null) ?? []
    allRecords.push(...batch.map(fromSupabaseRow))
    console.log(`[SyncOps] downloadRemoteChanges: ${table} batch offset=${offset}, received ${batch.length} records`)
    offset += BATCH_SIZE
    hasMore = batch.length === BATCH_SIZE
  }

  console.log(`[SyncOps] downloadRemoteChanges: ${table} total returned ${allRecords.length} records`)
  return allRecords
}
