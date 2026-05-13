import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { resolveConflict, setLastSyncTime, getLastSyncTime, clearLastSyncTime } from '../realtime/conflictResolver'
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
})
