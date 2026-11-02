import { describe, expect, it, vi } from 'vitest'
import { formatDbDate, normalizeTodo } from '../useTodoOperations'
import type { Todo } from '@/lib/types'

describe('task date normalization', () => {
  it('preserves Shanghai dates, legacy input and invalid date handling', () => {
    expect(formatDbDate('2026-11-01 16:00:00+00')).toBe('2026-11-02')
    expect(formatDbDate('2026-11-01 160000')).toBe('2026-11-02')
    expect(formatDbDate('2026-11-02')).toBe('2026-11-02')
    expect(formatDbDate('2026-11-01T16:00:00.000Z')).toBe('2026-11-02')
    expect(formatDbDate('invalid')).toBeNull()
    expect(formatDbDate(null)).toBeNull()
  })
  it('does not allocate internationalization formatters when refreshing many tasks', () => {
    const spy = vi.spyOn(Intl, 'DateTimeFormat')
    try {
      for (let i = 0; i < 2000; i++) {
        const todo = normalizeTodo({ id: String(i), due_date: '2026-11-01T16:00:00Z', start_date: '2026-11-01T16:00:00Z', next_due_date: '2026-11-02T16:00:00Z' } as Todo)
        expect(todo.due_date).toBe('2026-11-02')
      }
      expect(spy).not.toHaveBeenCalled()
    } finally { spy.mockRestore() }
  })
})
