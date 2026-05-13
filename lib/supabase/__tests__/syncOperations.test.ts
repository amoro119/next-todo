import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  fetchRemoteLatestTimestamp,
  fetchRemoteAllRecords,
  upsertRecords,
  markRecordsAsDeleted,
  uploadLocalChanges,
  downloadRemoteChanges,
} from '../syncOperations'

function createMockChain<T = unknown>(data: T | null = null, error: Error | null = null) {
  const methods = [
    'select', 'order', 'limit', 'single', 'maybeSingle',
    'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'range',
    'contains', 'textSearch', 'or', 'filter', 'match', 'not', 'csv',
  ] as const

  const chain: Record<string, ReturnType<typeof vi.fn> | T | Error | null> = {}

  for (const method of methods) {
    chain[method] = vi.fn(() => chain)
  }

  chain.upsert = vi.fn(() => chain)
  chain.update = vi.fn(() => chain)
  chain.insert = vi.fn(() => chain)
  chain.delete = vi.fn(() => chain)

  chain.data = data
  chain.error = error
  chain.then = vi.fn((resolve: (value: { data: T | null; error: Error | null }) => unknown) =>
    Promise.resolve(resolve({ data, error })),
  )

  return chain as Record<(typeof methods)[number], ReturnType<typeof vi.fn>> & {
    upsert: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    insert: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    data: T | null
    error: Error | null
    then: ReturnType<typeof vi.fn>
  }
}

const mockFrom = vi.fn()
const mockClient = { from: mockFrom }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('fetchRemoteLatestTimestamp', () => {
  it('returns max modified timestamp for a table', async () => {
    const chain = createMockChain({ modified: '2024-01-15T10:30:00Z' })
    mockFrom.mockReturnValue(chain)

    const result = await fetchRemoteLatestTimestamp(mockClient, 'todos')

    expect(mockFrom).toHaveBeenCalledWith('todos')
    expect(chain.select).toHaveBeenCalledWith('modified')
    expect(chain.order).toHaveBeenCalledWith('modified', { ascending: false })
    expect(chain.limit).toHaveBeenCalledWith(1)
    expect(chain.single).toHaveBeenCalled()
    expect(result).toBe('2024-01-15T10:30:00Z')
  })

  it('returns null when table is empty', async () => {
    const chain = createMockChain(null)
    mockFrom.mockReturnValue(chain)

    const result = await fetchRemoteLatestTimestamp(mockClient, 'todos')

    expect(result).toBeNull()
  })

  it('returns null on query error', async () => {
    const chain = createMockChain(null, new Error('DB error'))
    mockFrom.mockReturnValue(chain)

    const result = await fetchRemoteLatestTimestamp(mockClient, 'todos')

    expect(result).toBeNull()
  })
})

describe('fetchRemoteAllRecords', () => {
  it('returns all records', async () => {
    const chain = createMockChain([
      { id: '1', title: 'A', modified: '2024-01-01T00:00:00Z', deleted: false },
      { id: '2', title: 'B', modified: '2024-01-02T00:00:00Z', deleted: true },
    ])
    mockFrom.mockReturnValue(chain)

    const result = await fetchRemoteAllRecords(mockClient, 'todos')

    expect(mockFrom).toHaveBeenCalledWith('todos')
    expect(chain.select).toHaveBeenCalledWith('*')
    expect(result.length).toBe(2)
    expect(result[0].id).toBe('1')
  })

  it('returns empty array when no records', async () => {
    const chain = createMockChain([])
    mockFrom.mockReturnValue(chain)

    const result = await fetchRemoteAllRecords(mockClient, 'todos')

    expect(result).toEqual([])
  })

  it('returns empty array on error', async () => {
    const chain = createMockChain(null, new Error('DB error'))
    mockFrom.mockReturnValue(chain)

    const result = await fetchRemoteAllRecords(mockClient, 'todos')

    expect(result).toEqual([])
  })
})

describe('upsertRecords', () => {
  it('calls supabase upsert with correct table and records', async () => {
    const chain = createMockChain([{ id: '1' }])
    mockFrom.mockReturnValue(chain)

    const records = [
      { id: '1', user_id: 'default_user', updated_at: '2024-01-01T00:00:00Z', deleted_at: null, title: 'Test' },
    ]
    const result = await upsertRecords(mockClient, 'todos', records)

    expect(mockFrom).toHaveBeenCalledWith('todos')
    expect(chain.upsert).toHaveBeenCalled()
    expect(result.success).toBe(true)
    expect(result.affectedRows).toBe(1)
  })

  it('strips Dexie-specific fields before upsert', async () => {
    const chain = createMockChain([{ id: '1' }])
    mockFrom.mockReturnValue(chain)

    const records = [
      { id: '1', user_id: 'default_user', updated_at: '2024-01-01T00:00:00Z', deleted_at: null, title: 'Test' },
    ]
    await upsertRecords(mockClient, 'todos', records)

    const upsertCall = (chain.upsert as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(upsertCall[0]).not.toHaveProperty('user_id')
    expect(upsertCall[0]).not.toHaveProperty('deleted_at')
    expect(upsertCall[0]).not.toHaveProperty('updated_at')
    expect(upsertCall[0]).toHaveProperty('deleted', false)
    expect(upsertCall[0]).toHaveProperty('modified')
  })

  it('returns error result on failure', async () => {
    const chain = createMockChain(null, new Error('upsert failed'))
    mockFrom.mockReturnValue(chain)

    const result = await upsertRecords(mockClient, 'todos', [])

    expect(result.success).toBe(false)
    expect(result.error).toBe('upsert failed')
  })
})

describe('markRecordsAsDeleted', () => {
  it('sets deleted=true and modified timestamp', async () => {
    const chain = createMockChain(null)
    mockFrom.mockReturnValue(chain)

    const result = await markRecordsAsDeleted(mockClient, 'todos', ['id-1', 'id-2'])

    expect(mockFrom).toHaveBeenCalledWith('todos')
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ deleted: true }))
    expect(chain.in).toHaveBeenCalledWith('id', ['id-1', 'id-2'])
    expect(result.success).toBe(true)
  })
})

describe('downloadRemoteChanges', () => {
  it('filters records modified after given timestamp', async () => {
    const chain = createMockChain([
      { id: '1', modified: '2024-01-15T10:30:00Z', deleted: false },
    ])
    mockFrom.mockReturnValue(chain)

    const result = await downloadRemoteChanges(mockClient, 'todos', '2024-01-01T00:00:00Z')

    expect(mockFrom).toHaveBeenCalledWith('todos')
    expect(chain.select).toHaveBeenCalledWith('*')
    expect(chain.gt).toHaveBeenCalledWith('modified', '2024-01-01T00:00:00Z')
    expect(result.length).toBe(1)
  })
})
