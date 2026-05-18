import { createStore } from 'zustand/vanilla'
import type { DatabaseAPI } from '@/lib/db/databaseAPI'
import type { Goal } from '@/lib/db/types'
import { dispatchDataChange } from './events'

interface GoalState {
  goals: Goal[]
  addGoal: (partial: Partial<Goal>) => Promise<void>
  updateGoal: (id: string, updates: Partial<Goal>) => Promise<void>
  deleteGoal: (id: string) => Promise<void>
  setGoals: (goals: Goal[]) => void
}

export function createGoalStore(api: DatabaseAPI) {
  return createStore<GoalState>((set, get) => ({
    goals: [],

    async addGoal(partial) {
      const record = await api.addGoal(partial)
      set({ goals: [...get().goals, record] })
      dispatchDataChange('goals', { source: 'local', action: 'create', id: record.id, record, table: 'goals' })
    },

    async updateGoal(id, updates) {
      const updated = await api.updateGoal(id, updates)
      set({ goals: get().goals.map(g => g.id === id ? { ...g, ...updates } : g) })
      dispatchDataChange('goals', { source: 'local', action: 'update', id, record: updated, table: 'goals' })
    },

    async deleteGoal(id) {
      const deleted = await api.deleteGoal(id)
      set({ goals: get().goals.filter(g => g.id !== id) })
      dispatchDataChange('goals', { source: 'local', action: 'delete', id, record: deleted, table: 'goals' })
    },

    setGoals(goals) {
      set({ goals })
    },
  }))
}
