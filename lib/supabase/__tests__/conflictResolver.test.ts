import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  resolveConflict,
  resolveConflictLWW,
  extractTimestamp,
  batchResolveConflicts,
  shouldAcceptRemoteChange,
  setLastSyncTime,
  getLastSyncTime,
  clearLastSyncTime,
} from '../realtime/conflictResolver'
import type { SyncRecord } from '../realtime/types'

const makeRecord = (updated_at: string, deleted_at: string | null = null): SyncRecord => ({
  id: 'test-id',
  user_id: 'user-1',
  updated_at,
  deleted_at,
})

describe('conflictResolver', () => {
  describe('resolveConflict (LWW)', () => {
    it('returns remote when remote.updated_at is newer', () => {
      const local = makeRecord('2024-01-01T10:00:00.000Z')
      const remote = makeRecord('2024-01-01T11:00:00.000Z')
      expect(resolveConflict(local, remote)).toBe(remote)
    })

    it('returns local when local.updated_at is newer', () => {
      const local = makeRecord('2024-01-01T11:00:00.000Z')
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(resolveConflict(local, remote)).toBe(local)
    })

    it('returns remote when timestamps are equal (remote wins tie)', () => {
      const local = makeRecord('2024-01-01T10:00:00.000Z')
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(resolveConflict(local, remote)).toBe(remote)
    })

    it('returns remote when local is null', () => {
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(resolveConflict(null, remote)).toBe(remote)
    })

    it('returns remote when local is undefined', () => {
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(resolveConflict(undefined, remote)).toBe(remote)
    })

    it('returns local when remote is null', () => {
      const local = makeRecord('2024-01-01T10:00:00.000Z')
      expect(resolveConflict(local, null)).toBe(local)
    })

    it('returns local when remote is undefined', () => {
      const local = makeRecord('2024-01-01T10:00:00.000Z')
      expect(resolveConflict(local, undefined)).toBe(local)
    })

    it('returns null when both are null', () => {
      expect(resolveConflict(null, null)).toBeNull()
    })

    it('handles deleted_at records correctly (tombstone wins over non-deleted if newer)', () => {
      const local = makeRecord('2024-01-01T10:00:00.000Z', null)
      const remote = makeRecord('2024-01-01T11:00:00.000Z', '2024-01-01T11:00:00.000Z')
      expect(resolveConflict(local, remote)).toBe(remote)
    })
  })

  describe('setLastSyncTime / getLastSyncTime', () => {
    beforeEach(() => {
      clearLastSyncTime()
    })

    afterEach(() => {
      clearLastSyncTime()
    })

    it('stores and retrieves sync time in localStorage', () => {
      const ts = '2024-01-01T10:00:00.000Z'
      setLastSyncTime(ts)
      expect(getLastSyncTime()).toBe(ts)
    })

    it('returns null when no sync time stored', () => {
      expect(getLastSyncTime()).toBeNull()
    })

    it('clearLastSyncTime removes stored value', () => {
      setLastSyncTime('2024-01-01T10:00:00.000Z')
      clearLastSyncTime()
      expect(getLastSyncTime()).toBeNull()
    })
  })

  describe('extractTimestamp', () => {
    it('extracts from updatedAt field', () => {
      const record = { id: '1', updatedAt: '2024-06-15T12:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }
      const ts = extractTimestamp(record as unknown as SyncRecord)
      expect(ts).toBe(new Date('2024-06-15T12:00:00.000Z').getTime())
    })

    it('extracts from timestamp field when updatedAt missing', () => {
      const record = { id: '1', timestamp: '2024-06-15T12:00:00.000Z', updated_at: '2024-01-01T00:00:00.000Z' }
      const ts = extractTimestamp(record as unknown as SyncRecord)
      expect(ts).toBe(new Date('2024-06-15T12:00:00.000Z').getTime())
    })

    it('extracts from updated_at field as fallback', () => {
      const record = { id: '1', updated_at: '2024-06-15T12:00:00.000Z' }
      const ts = extractTimestamp(record as unknown as SyncRecord)
      expect(ts).toBe(new Date('2024-06-15T12:00:00.000Z').getTime())
    })

    it('returns 0 when no timestamp fields exist', () => {
      const record = { id: '1', title: 'no timestamp' }
      const ts = extractTimestamp(record as unknown as SyncRecord)
      expect(ts).toBe(0)
    })

    it('returns 0 for invalid date strings', () => {
      const record = { id: '1', updated_at: 'not-a-date' }
      const ts = extractTimestamp(record as unknown as SyncRecord)
      expect(ts).toBe(0)
    })
  })

  describe('resolveConflictLWW', () => {
    it('returns remote when remote is newer', () => {
      const local = makeRecord('2024-01-01T10:00:00.000Z')
      const remote = makeRecord('2024-01-01T11:00:00.000Z')
      expect(resolveConflictLWW(local, remote)).toBe(remote)
    })

    it('returns local when local is newer', () => {
      const local = makeRecord('2024-01-01T11:00:00.000Z')
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(resolveConflictLWW(local, remote)).toBe(local)
    })

    it('returns remote when timestamps are equal (Cloud-Authoritative)', () => {
      const local = makeRecord('2024-01-01T10:00:00.000Z')
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(resolveConflictLWW(local, remote)).toBe(remote)
    })

    it('returns remote when local is null', () => {
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(resolveConflictLWW(null, remote)).toBe(remote)
    })

    it('returns local when remote is null', () => {
      const local = makeRecord('2024-01-01T10:00:00.000Z')
      expect(resolveConflictLWW(local, null)).toBe(local)
    })

    it('returns null when both are null', () => {
      expect(resolveConflictLWW(null, null)).toBeNull()
    })
  })

  describe('batchResolveConflicts', () => {
    const makeWithId = (id: string, updated_at: string, deleted_at: string | null = null): SyncRecord => ({
      id,
      user_id: 'user-1',
      updated_at,
      deleted_at,
    })

    it('remote deleted, local exists → toDeleteLocal', () => {
      const local = [makeWithId('1', '2024-01-01T10:00:00.000Z')]
      const remote = [makeWithId('1', '2024-01-01T11:00:00.000Z', '2024-01-01T11:00:00.000Z')]
      const result = batchResolveConflicts(local, remote, 0)
      expect(result.toDeleteLocal).toEqual(['1'])
      expect(result.toDownload).toEqual([])
      expect(result.toUpload).toEqual([])
    })

    it('remote only → toDownload', () => {
      const local: SyncRecord[] = []
      const remote = [makeWithId('1', '2024-01-01T10:00:00.000Z')]
      const result = batchResolveConflicts(local, remote, 0)
      expect(result.toDownload).toEqual(remote)
      expect(result.merged).toEqual(remote)
      expect(result.toUpload).toEqual([])
    })

    it('local only with timestamp > lastSyncTime → toUpload', () => {
      const lastSync = new Date('2024-01-01T00:00:00.000Z').getTime()
      const local = [makeWithId('1', '2024-06-15T12:00:00.000Z')]
      const result = batchResolveConflicts(local, [], lastSync)
      expect(result.toUpload).toEqual(local)
      expect(result.toDownload).toEqual([])
      expect(result.merged).toEqual([])
    })

    it('both exist, remote newer → toDownload', () => {
      const local = [makeWithId('1', '2024-01-01T10:00:00.000Z')]
      const remote = [makeWithId('1', '2024-01-01T11:00:00.000Z')]
      const result = batchResolveConflicts(local, remote, 0)
      expect(result.toDownload).toEqual(remote)
      expect(result.merged).toContainEqual(remote[0])
      expect(result.toUpload).toEqual([])
      expect(result.toDeleteLocal).toEqual([])
    })

    it('both exist, local newer → kept in merged, not in toDownload', () => {
      const local = [makeWithId('1', '2024-01-01T11:00:00.000Z')]
      const remote = [makeWithId('1', '2024-01-01T10:00:00.000Z')]
      const result = batchResolveConflicts(local, remote, 0)
      expect(result.toDownload).toEqual([])
      expect(result.merged).toContainEqual(local[0])
    })
  })

  describe('shouldAcceptRemoteChange', () => {
    it('returns true when local is null', () => {
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(shouldAcceptRemoteChange(null, remote)).toBe(true)
    })

    it('returns true when local is undefined', () => {
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(shouldAcceptRemoteChange(undefined, remote)).toBe(true)
    })

    it('returns true when remote is newer', () => {
      const local = makeRecord('2024-01-01T10:00:00.000Z')
      const remote = makeRecord('2024-01-01T11:00:00.000Z')
      expect(shouldAcceptRemoteChange(local, remote)).toBe(true)
    })

    it('returns false when local is newer', () => {
      const local = makeRecord('2024-01-01T11:00:00.000Z')
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(shouldAcceptRemoteChange(local, remote)).toBe(false)
    })

    it('returns true when timestamps are equal (Cloud-Auth)', () => {
      const local = makeRecord('2024-01-01T10:00:00.000Z')
      const remote = makeRecord('2024-01-01T10:00:00.000Z')
      expect(shouldAcceptRemoteChange(local, remote)).toBe(true)
    })
  })
})
