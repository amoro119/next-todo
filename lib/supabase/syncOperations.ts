import type { SupabaseClient } from '@supabase/supabase-js'
import type { RealtimeSyncTable, SyncRecord } from './realtime/types'
import type { PendingOperation } from '@/lib/db/types'

// 下载后将 Supabase 字段映射回 Dexie 字段
export function fromSupabaseRow(row: Record<string, unknown>): SyncRecord {
  if (!Number.isFinite(Number(row.revision)) || Number(row.revision) < 1) {
    throw new Error('sync-protocol-v2-record-missing-revision')
  }
  const modified = (row.modified as string | null) ?? null
  if (!modified) throw new Error('sync-protocol-v2-record-missing-modified')
  const deletedAt = (row.deleted_at as string | null | undefined)
    ?? (row.deleted ? modified : null)
  return {
    ...row,
    user_id: 'default_user',
    deleted: deletedAt != null,
    deleted_at: deletedAt,
    updated_at: modified,
    revision: Number(row.revision),
    server_modified: modified,
  } as unknown as SyncRecord
}

export interface SyncCapabilities {
  protocol_version: number
  min_client_version: string
  tables: RealtimeSyncTable[]
  features: string[]
}

export interface SyncApplyResult {
  status: 'applied' | 'partial' | 'conflict' | 'idempotent'
  record: SyncRecord
  applied_fields: string[]
  rejected_fields: string[]
}

export class SyncRpcError extends Error {
  readonly code?: string
  readonly details?: string
  readonly hint?: string

  constructor(error: { message: string; code?: string; details?: string; hint?: string }) {
    super(error.message)
    this.name = 'SyncRpcError'
    this.code = error.code
    this.details = error.details
    this.hint = error.hint
  }
}

function firstRpcRow<T>(data: unknown): T | null {
  if (Array.isArray(data)) return (data[0] as T | undefined) ?? null
  return (data as T | null) ?? null
}

export async function fetchSyncCapabilities(
  client: SupabaseClient,
): Promise<SyncCapabilities> {
  const { data, error } = await client.rpc('sync_capabilities')
  if (error) throw new Error(`sync-capabilities-unavailable: ${error.message}`)
  const capabilities = firstRpcRow<SyncCapabilities>(data)
  if (!capabilities || capabilities.protocol_version !== 2) {
    throw new Error('sync-protocol-v2-required')
  }
  return capabilities
}

export async function applyPendingOperation(
  client: SupabaseClient,
  operation: PendingOperation,
): Promise<SyncApplyResult> {
  const { data, error } = await client.rpc('sync_apply_change', {
    p_table_name: operation.table,
    p_record_id: operation.recordId,
    p_operation_id: operation.operationId,
    p_device_id: operation.deviceId,
    p_expected_revision: operation.expectedRevision,
    p_operation: operation.operation,
    p_patch: operation.patch,
    p_base_values: operation.baseValues,
  })
  if (error) throw new SyncRpcError(error)
  const result = firstRpcRow<Omit<SyncApplyResult, 'record'> & { record: Record<string, unknown> }>(data)
  if (!result?.record) throw new Error('sync-apply-change-returned-no-record')
  return {
    ...result,
    record: fromSupabaseRow(result.record),
  }
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
      throw new Error(`Snapshot download failed for ${table} at offset ${offset}: ${error.message}`)
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
