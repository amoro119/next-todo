import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createGoalStore } from '../goalStore'
import type { DatabaseAPI } from '@/lib/db/databaseAPI'
import { GOAL_DATA_CHANGED } from '../events'
import type { Goal } from '@/lib/db/types'

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'goal-1',
    name: 'Test Goal',
    description: null,
    list_id: null,
    start_date: null,
    due_date: null,
    priority: 0,
    created_time: new Date().toISOString(),
    is_archived: false,
    user_id: 'user-1',
    updated_at: new Date().toISOString(),
    deleted_at: null,
    ...overrides,
  }
}

function makeMockApi(overrides: Partial<DatabaseAPI> = {}): DatabaseAPI {
  return {
    addGoal: vi.fn().mockResolvedValue(makeGoal()),
    updateGoal: vi.fn().mockResolvedValue(undefined),
    deleteGoal: vi.fn().mockResolvedValue(undefined),
    getTodos: vi.fn(),
    addTodo: vi.fn(),
    updateTodo: vi.fn(),
    deleteTodo: vi.fn(),
    getLists: vi.fn(),
    addList: vi.fn(),
    updateList: vi.fn(),
    deleteList: vi.fn(),
    getGoals: vi.fn(),
    ...overrides,
  } as unknown as DatabaseAPI
}

describe('createGoalStore', () => {
  let dispatchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    dispatchSpy = vi.spyOn(window, 'dispatchEvent')
  })

  afterEach(() => {
    dispatchSpy.mockRestore()
  })

  it('initializes with empty goals', () => {
    const api = makeMockApi()
    const store = createGoalStore(api)
    expect(store.getState().goals).toEqual([])
  })

  describe('addGoal', () => {
    it('calls api.addGoal with the provided partial', async () => {
      const api = makeMockApi()
      const store = createGoalStore(api)
      await store.getState().addGoal({ name: 'New Goal' })
      expect(api.addGoal).toHaveBeenCalledWith({ name: 'New Goal' })
    })

    it('adds the returned record to state', async () => {
      const record = makeGoal({ id: 'goal-new', name: 'New Goal' })
      const api = makeMockApi({ addGoal: vi.fn().mockResolvedValue(record) })
      const store = createGoalStore(api)
      await store.getState().addGoal({ name: 'New Goal' })
      expect(store.getState().goals).toContainEqual(record)
    })

    it('dispatches GOAL_DATA_CHANGED with action=create', async () => {
      const record = makeGoal({ id: 'goal-new' })
      const api = makeMockApi({ addGoal: vi.fn().mockResolvedValue(record) })
      const store = createGoalStore(api)
      await store.getState().addGoal({ name: 'New Goal' })

      expect(dispatchSpy).toHaveBeenCalledOnce()
      const event = dispatchSpy.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(GOAL_DATA_CHANGED)
      expect(event.detail.source).toBe('local')
      expect(event.detail.action).toBe('create')
      expect(event.detail.id).toBe(record.id)
      expect(event.detail.record).toEqual(record)
      expect(event.detail.table).toBe('goals')
    })
  })

  describe('updateGoal', () => {
    it('calls api.updateGoal with id and updates', async () => {
      const api = makeMockApi()
      const store = createGoalStore(api)
      await store.getState().updateGoal('goal-1', { name: 'Updated' })
      expect(api.updateGoal).toHaveBeenCalledWith('goal-1', { name: 'Updated' })
    })

    it('merges updates into state', async () => {
      const existing = makeGoal({ id: 'goal-1', name: 'Old' })
      const api = makeMockApi()
      const store = createGoalStore(api)
      store.setState({ goals: [existing] })
      await store.getState().updateGoal('goal-1', { name: 'Updated' })
      expect(store.getState().goals[0].name).toBe('Updated')
    })

    it('dispatches GOAL_DATA_CHANGED with action=update', async () => {
      const existing = makeGoal({ id: 'goal-1' })
      const api = makeMockApi()
      const store = createGoalStore(api)
      store.setState({ goals: [existing] })
      await store.getState().updateGoal('goal-1', { name: 'Updated' })

      expect(dispatchSpy).toHaveBeenCalledOnce()
      const event = dispatchSpy.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(GOAL_DATA_CHANGED)
      expect(event.detail.source).toBe('local')
      expect(event.detail.action).toBe('update')
      expect(event.detail.id).toBe('goal-1')
      expect(event.detail.table).toBe('goals')
    })
  })

  describe('deleteGoal', () => {
    it('calls api.deleteGoal with the id', async () => {
      const api = makeMockApi()
      const store = createGoalStore(api)
      await store.getState().deleteGoal('goal-1')
      expect(api.deleteGoal).toHaveBeenCalledWith('goal-1')
    })

    it('removes the goal from state', async () => {
      const existing = makeGoal({ id: 'goal-1' })
      const api = makeMockApi()
      const store = createGoalStore(api)
      store.setState({ goals: [existing] })
      await store.getState().deleteGoal('goal-1')
      expect(store.getState().goals).toEqual([])
    })

    it('dispatches GOAL_DATA_CHANGED with action=delete', async () => {
      const api = makeMockApi()
      const store = createGoalStore(api)
      await store.getState().deleteGoal('goal-1')

      expect(dispatchSpy).toHaveBeenCalledOnce()
      const event = dispatchSpy.mock.calls[0][0] as CustomEvent
      expect(event.type).toBe(GOAL_DATA_CHANGED)
      expect(event.detail.source).toBe('local')
      expect(event.detail.action).toBe('delete')
      expect(event.detail.id).toBe('goal-1')
      expect(event.detail.record).toBeNull()
      expect(event.detail.table).toBe('goals')
    })
  })

  describe('setGoals', () => {
    it('replaces state with provided goals', () => {
      const api = makeMockApi()
      const store = createGoalStore(api)
      const goals = [makeGoal({ id: 'a' }), makeGoal({ id: 'b' })]
      store.getState().setGoals(goals)
      expect(store.getState().goals).toEqual(goals)
    })

    it('does NOT dispatch any event (remote sync path)', () => {
      const api = makeMockApi()
      const store = createGoalStore(api)
      store.getState().setGoals([makeGoal()])
      expect(dispatchSpy).not.toHaveBeenCalled()
    })
  })
})
