import { createStore } from 'zustand/vanilla'
import type { DatabaseAPI } from '@/lib/db/databaseAPI'
import type { List } from '@/lib/db/types'
import { dispatchDataChange } from './events'

interface ListState {
  lists: List[]
  addList: (partial: Partial<List>) => Promise<void>
  updateList: (id: string, updates: Partial<List>) => Promise<void>
  deleteList: (id: string) => Promise<void>
  setLists: (lists: List[]) => void
}

export function createListStore(api: DatabaseAPI) {
  return createStore<ListState>((set, get) => ({
    lists: [],

    async addList(partial) {
      const record = await api.addList(partial)
      set({ lists: [...get().lists, record] })
      dispatchDataChange('lists', { source: 'local', action: 'create', id: record.id, record, table: 'lists' })
    },

    async updateList(id, updates) {
      const updated = await api.updateList(id, updates)
      set({ lists: get().lists.map(l => l.id === id ? { ...l, ...updates } : l) })
      dispatchDataChange('lists', { source: 'local', action: 'update', id, record: updated, table: 'lists' })
    },

    async deleteList(id) {
      const deleted = await api.deleteList(id)
      set({ lists: get().lists.filter(l => l.id !== id) })
      dispatchDataChange('lists', { source: 'local', action: 'delete', id, record: deleted, table: 'lists' })
    },

    setLists(lists) {
      set({ lists })
    },
  }))
}
