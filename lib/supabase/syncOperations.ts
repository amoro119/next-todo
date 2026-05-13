import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeSyncTable, SyncRecord, SyncOperationResult } from './realtime/types'

// Supabase 现有表没有 user_id / deleted_at / updated_at 字段
// 上传前需要剥离这些字段，并将 deleted_at 映射为 deleted boolean
function toSupabaseRecord(record: SyncRecord): Record<string, unknown> {
  const { user_id, deleted_at, updated_at, ...rest } = record as Record<string, unknown>
  return {
    ...rest,
    deleted: !!deleted_at,
    modified: updated_at || new Date().toISOString(),
  }
}

// 下载后将 Supabase 字段映射回 Dexie 字段
function fromSupabaseRow(row: Record<string, unknown>): SyncRecord {
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
  const { data, error } = await client
    .from(table)
    .select('modified')
    .order('modified', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) return null
  return (data as { modified: string }).modified
}

export async function fetchRemoteAllRecords(
  client: SupabaseClient,
  table: RealtimeSyncTable,
): Promise<SyncRecord[]> {
  const { data, error } = await client.from(table).select('*')

  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(fromSupabaseRow)
}

export async function upsertRecords(
  client: SupabaseClient,
  table: RealtimeSyncTable,
  records: SyncRecord[],
): Promise<SyncOperationResult> {
  const payload = records.map(toSupabaseRecord)
  const { data, error } = await client.from(table).upsert(payload)

  if (error) return { success: false, error: error.message }

  const rows = (data as SyncRecord[] | null) ?? records
  return { success: true, affectedRows: rows.length }
}

export async function markRecordsAsDeleted(
  client: SupabaseClient,
  table: RealtimeSyncTable,
  ids: string[],
): Promise<SyncOperationResult> {
  const { error } = await client
    .from(table)
    .update({ deleted: true, modified: new Date().toISOString() })
    .in('id', ids)

  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function uploadLocalChanges(
  client: SupabaseClient,
  table: RealtimeSyncTable,
  records: SyncRecord[],
): Promise<SyncOperationResult> {
  return upsertRecords(client, table, records)
}

export async function downloadRemoteChanges(
  client: SupabaseClient,
  table: RealtimeSyncTable,
  since: string,
): Promise<SyncRecord[]> {
  const { data, error } = await client
    .from(table)
    .select('*')
    .gt('modified', since)

  if (error || !data) return []
  return (data as Record<string, unknown>[]).map(fromSupabaseRow)
}
