import Dexie from 'dexie'
import type {
  Goal,
  GoalProgress,
  List,
  Meta,
  PendingOperation,
  PendingOperationStatus,
  PendingOperationType,
  Todo,
} from './types'
import type { TodoDatabase } from './dexie'

export const LEGACY_DATABASE_NAME = 'todo-local-db'
export const CURRENT_DATABASE_NAME = 'todo-local-db-v2'
export const LEGACY_MIGRATION_MARKER = 'legacy_database_migration_v1'

const EPOCH = '1970-01-01T00:00:00.000Z'
const LEGACY_TABLES = [
  'todos',
  'lists',
  'goals',
  'goal_progress',
  'meta',
  'pendingOperations',
] as const

type LegacyTableName = typeof LEGACY_TABLES[number]
type UnknownRecord = Record<string, unknown>

interface LegacySnapshot {
  databaseVersion: number
  pendingPrimaryKey: string | string[] | null
  todos: Todo[]
  lists: List[]
  goals: Goal[]
  goalProgress: GoalProgress[]
  meta: Meta[]
  pendingOperations: UnknownRecord[]
}

export interface LegacyMigrationResult {
  status: 'already-migrated' | 'no-legacy-database' | 'migrated'
  sourceVersion: number | null
  counts: {
    todos: number
    lists: number
    goals: number
    goalProgress: number
    meta: number
    pendingOperations: number
    skippedPendingOperations: number
  }
}

export interface LegacyMigrationOptions {
  legacyDatabaseName?: string
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null
}

function numberValue(value: unknown, fallback: number): number {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function randomUuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()

  const bytes = new Uint8Array(16)
  globalThis.crypto?.getRandomValues?.(bytes)
  if (bytes.every((byte) => byte === 0)) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0'))
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-')
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function normalizeSyncMetadata<T extends UnknownRecord>(
  input: T,
  isTodo: boolean,
): T {
  const revision = Math.max(0, numberValue(input.revision, 0))
  const updatedAt = nullableString(input.updated_at)
    ?? nullableString(input.modified)
    ?? EPOCH
  const serverModified = nullableString(input.server_modified)
    ?? (revision > 0 ? nullableString(input.modified) : null)
  const deletedAt = input.deleted_at === null
    ? null
    : nullableString(input.deleted_at)
      ?? (input.deleted === true ? updatedAt : null)

  return {
    ...input,
    ...(isTodo ? { deleted: deletedAt !== null } : {}),
    updated_at: updatedAt,
    deleted_at: deletedAt,
    revision,
    server_modified: serverModified,
  }
}

export function normalizeLegacyPendingOperation(
  input: unknown,
  fallbackDeviceId: string,
  migratedAt: string,
): PendingOperation | null {
  if (!isRecord(input)) return null
  if (input.table !== 'todos' && input.table !== 'lists' && input.table !== 'goals') {
    return null
  }

  const legacyRecord = isRecord(input.record)
    ? input.record
    : isRecord(input.legacyRecord) ? input.legacyRecord : undefined
  const recordId = nullableString(input.recordId)
    ?? (legacyRecord ? nullableString(legacyRecord.id) : null)
  if (!recordId) return null

  const operationId = isUuid(input.operationId)
    ? input.operationId
    : isUuid(input.id) ? input.id : randomUuid()
  const operation: PendingOperationType = input.operation === 'insert'
    || input.operation === 'update'
    || input.operation === 'delete'
    || input.operation === 'restore'
    ? input.operation
    : 'update'
  const isProtocolV2 = isRecord(input.patch)
    && isRecord(input.baseValues)
    && typeof input.operationId === 'string'
  const inputStatus = input.status as PendingOperationStatus | undefined
  const status: PendingOperationStatus = isProtocolV2
    ? inputStatus === 'blocked'
      ? 'blocked'
      : 'pending'
    : 'blocked'

  return {
    operationId,
    deviceId: stringValue(input.deviceId, fallbackDeviceId),
    table: input.table,
    recordId,
    operation,
    expectedRevision: isProtocolV2
      && input.expectedRevision !== null
      && input.expectedRevision !== undefined
      && Number.isFinite(Number(input.expectedRevision))
      ? Number(input.expectedRevision)
      : null,
    patch: isProtocolV2 ? { ...input.patch as UnknownRecord } : {},
    baseValues: isProtocolV2 ? { ...input.baseValues as UnknownRecord } : {},
    generation: Math.max(1, numberValue(input.generation, 1)),
    status,
    retryCount: Math.max(0, numberValue(input.retryCount, 0)),
    nextAttemptAt: status === 'pending' ? nullableString(input.nextAttemptAt) : null,
    lastError: isProtocolV2
      ? nullableString(input.lastError)
      : 'legacy-operation-requires-review',
    createdAt: stringValue(input.createdAt, stringValue(input.timestamp, EPOCH)),
    updatedAt: stringValue(input.updatedAt, migratedAt),
    ...(legacyRecord ? { legacyRecord: { ...legacyRecord } } : {}),
  }
}

async function readLegacySnapshot(databaseName: string): Promise<LegacySnapshot> {
  const legacy = new Dexie(databaseName)
  await legacy.open()

  try {
    const tables = new Map(legacy.tables.map((table) => [table.name, table]))
    const presentTables = LEGACY_TABLES
      .filter((name) => tables.has(name))
      .map((name) => tables.get(name)!)

    const records = new Map<LegacyTableName, UnknownRecord[]>()
    if (presentTables.length > 0) {
      await legacy.transaction('r', presentTables, async () => {
        await Promise.all(LEGACY_TABLES.map(async (name) => {
          const table = tables.get(name)
          records.set(name, table ? await table.toArray() as UnknownRecord[] : [])
        }))
      })
    }

    const pendingTable = tables.get('pendingOperations')
    return {
      databaseVersion: legacy.verno,
      pendingPrimaryKey: pendingTable?.schema.primKey.keyPath ?? null,
      todos: (records.get('todos') ?? [])
        .map((record) => normalizeSyncMetadata(record, true) as unknown as Todo),
      lists: (records.get('lists') ?? [])
        .map((record) => normalizeSyncMetadata(record, false) as unknown as List),
      goals: (records.get('goals') ?? [])
        .map((record) => normalizeSyncMetadata(record, false) as unknown as Goal),
      goalProgress: (records.get('goal_progress') ?? []) as unknown as GoalProgress[],
      meta: (records.get('meta') ?? []).map((record) => ({
        ...record,
        key: stringValue(record.key, randomUuid()),
        value: stringValue(record.value, ''),
        deleted_at: record.deleted_at === null ? null : nullableString(record.deleted_at),
        updated_at: stringValue(record.updated_at, EPOCH),
      } as Meta)),
      pendingOperations: records.get('pendingOperations') ?? [],
    }
  } finally {
    legacy.close()
  }
}

function emptyResult(status: LegacyMigrationResult['status']): LegacyMigrationResult {
  return {
    status,
    sourceVersion: null,
    counts: {
      todos: 0,
      lists: 0,
      goals: 0,
      goalProgress: 0,
      meta: 0,
      pendingOperations: 0,
      skippedPendingOperations: 0,
    },
  }
}

async function writeNoLegacyMarker(target: TodoDatabase): Promise<LegacyMigrationResult> {
  const result = emptyResult('no-legacy-database')
  const now = new Date().toISOString()
  await target.meta.put({
    key: LEGACY_MIGRATION_MARKER,
    value: JSON.stringify(result),
    deleted_at: null,
    updated_at: now,
  })
  return result
}

/**
 * Copies the legacy database into a new physical database without ever altering
 * the legacy pendingOperations object store. The target write and marker are one
 * transaction, so an interrupted migration is safe to retry.
 */
export async function migrateLegacyDatabase(
  target: TodoDatabase,
  options: LegacyMigrationOptions = {},
): Promise<LegacyMigrationResult> {
  const existingMarker = await target.meta.get(LEGACY_MIGRATION_MARKER)
  if (existingMarker) {
    try {
      const previous = JSON.parse(existingMarker.value) as LegacyMigrationResult
      return { ...previous, status: 'already-migrated' }
    } catch (error) {
      throw new Error('Legacy database migration marker is invalid', {
        cause: error,
      })
    }
  }

  const legacyDatabaseName = options.legacyDatabaseName ?? LEGACY_DATABASE_NAME
  if (legacyDatabaseName === target.name || !(await Dexie.exists(legacyDatabaseName))) {
    return writeNoLegacyMarker(target)
  }

  const snapshot = await readLegacySnapshot(legacyDatabaseName)
  const migratedAt = new Date().toISOString()
  const fallbackDeviceId = snapshot.meta
    .find((record) => record.key === 'sync_device_id')?.value
    ?? 'legacy-device'
  const normalizedPending = snapshot.pendingOperations
    .map((operation) => normalizeLegacyPendingOperation(
      operation,
      fallbackDeviceId,
      migratedAt,
    ))
  const pendingOperations = normalizedPending
    .filter((operation): operation is PendingOperation => operation !== null)
  const skippedPendingOperations = normalizedPending.length - pendingOperations.length

  const result: LegacyMigrationResult = {
    status: 'migrated',
    sourceVersion: snapshot.databaseVersion,
    counts: {
      todos: snapshot.todos.length,
      lists: snapshot.lists.length,
      goals: snapshot.goals.length,
      goalProgress: snapshot.goalProgress.length,
      meta: snapshot.meta.length,
      pendingOperations: pendingOperations.length,
      skippedPendingOperations,
    },
  }

  await target.transaction(
    'rw',
    [
      target.todos,
      target.lists,
      target.goals,
      target.goal_progress,
      target.meta,
      target.pendingOperations,
    ],
    async () => {
      if (snapshot.todos.length > 0) await target.todos.bulkPut(snapshot.todos)
      if (snapshot.lists.length > 0) await target.lists.bulkPut(snapshot.lists)
      if (snapshot.goals.length > 0) await target.goals.bulkPut(snapshot.goals)
      if (snapshot.goalProgress.length > 0) {
        await target.goal_progress.bulkPut(snapshot.goalProgress)
      }
      if (snapshot.meta.length > 0) await target.meta.bulkPut(snapshot.meta)
      if (pendingOperations.length > 0) {
        await target.pendingOperations.bulkPut(pendingOperations)
      }

      const targetCounts = await Promise.all([
        target.todos.count(),
        target.lists.count(),
        target.goals.count(),
        target.goal_progress.count(),
        target.pendingOperations.count(),
      ])
      const minimumCounts = [
        snapshot.todos.length,
        snapshot.lists.length,
        snapshot.goals.length,
        snapshot.goalProgress.length,
        pendingOperations.length,
      ]
      if (targetCounts.some((count, index) => count < minimumCounts[index])) {
        throw new Error('Legacy database migration verification failed')
      }

      await target.meta.put({
        key: LEGACY_MIGRATION_MARKER,
        value: JSON.stringify({
          ...result,
          sourceDatabase: legacyDatabaseName,
          pendingPrimaryKey: snapshot.pendingPrimaryKey,
        }),
        deleted_at: null,
        updated_at: migratedAt,
      })
    },
  )

  if (skippedPendingOperations > 0) {
    console.warn(
      `[DatabaseMigration] Preserved legacy database but skipped ${skippedPendingOperations} invalid pending operations`,
    )
  }
  console.log('[DatabaseMigration] Legacy database copied successfully:', result)
  return result
}
