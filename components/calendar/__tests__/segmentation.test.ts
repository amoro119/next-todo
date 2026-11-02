import { describe, expect, it } from 'vitest'
import { segmentTodosByDate } from '../CalendarView'
import { dbUTCToDisplayDate } from '@/lib/utils/dateUtils'
import type { Todo } from '@/lib/types'

const task = (id: string, fields: Partial<Todo> = {}) => ({
  id, title: id, completed: false, start_date: '2026-11-01', due_date: '2026-11-03', ...fields,
}) as Todo

describe('calendar visible date segmentation', () => {
  it('bounds even millennia-long tasks to visible dates', () => {
    const todo = task('long', { start_date: '1000-01-01', due_date: '9999-12-31' })
    expect(segmentTodosByDate([todo], ['2026-11-02', '2026-11-04'])).toEqual({
      '2026-11-02': [todo], '2026-11-04': [todo],
    })
  })
  it('keeps inclusive boundaries, priority order and excludes deleted/outside tasks', () => {
    const low = task('low', { priority: 0 })
    const high = task('high', { priority: 2 })
    const done = task('done', { completed: true })
    const result = segmentTodosByDate([done, low, high, task('deleted', { deleted: true })], ['2026-11-01', '2026-11-03', '2026-11-04'])
    expect(result['2026-11-01']).toEqual([high, low, done])
    expect(result['2026-11-03']).toEqual([high, low, done])
    expect(result['2026-11-04']).toEqual([])
    expect(segmentTodosByDate([low], [])).toEqual({})
  })
  it('retains Shanghai conversion, date fallback and reversed range handling', () => {
    expect(dbUTCToDisplayDate('2026-11-01T16:00:00Z')).toBe('2026-11-02')
    const dueOnly = task('due', { start_date: null, due_date: '2026-11-01T16:00:00Z' })
    const reversed = task('reversed', { start_date: '2026-11-02', due_date: '2026-11-01' })
    expect(segmentTodosByDate([dueOnly, reversed], ['2026-11-02'])['2026-11-02']).toEqual([dueOnly, reversed])
  })
})
