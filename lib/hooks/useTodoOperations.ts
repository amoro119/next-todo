'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { v4 as uuid, v5 as uuidv5 } from "uuid"
import debounce from "lodash.debounce"
import { db } from "@/lib/db/dexie"
import { createDexieDatabaseAPI, type DatabaseAPI } from "@/lib/db/databaseAPI"
import type { Todo as DbTodo } from "@/lib/db/types"
import { useStores } from "@/lib/stores/createStores"
import { RecurringTaskGenerator } from "@/lib/recurring/RecurringTaskGenerator"
import type { Todo, List, Goal } from "@/lib/types"
import { useOptimizedInboxFilter, useOptimizedInboxSort } from "@/components/InboxPerformanceOptimizer"
import { useAppDialog } from "@/lib/hooks/useAppDialog"

/* ------------------------------------------------------------------ */
/*  Helpers & utilities (extracted verbatim from old page.tsx)        */
/* ------------------------------------------------------------------ */

/** 清理 UUID 字段，确保只有有效的 UUID 字符串被保留 */
export function sanitizeUuidField(value: unknown): string | null {
  if (!value) return null
  const stringValue = String(value)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (uuidRegex.test(stringValue)) return stringValue
  console.warn(`Invalid UUID value received: ${stringValue}, setting to null`)
  return null
}

// Backward-compat wrapper for RecurringTaskIntegration
export function createBackwardCompatApi(base: DatabaseAPI): DatabaseAPI & {
  insert: (table: string, data: Record<string, unknown>) => Promise<unknown>
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>
  transaction: (queries: Array<{ sql: string; params?: unknown[] }>) => Promise<void>
} {
  return {
    ...base,
    async insert(table: string, data: Record<string, unknown>) {
      if (table === "todos") {
        const mapped: Record<string, unknown> = { ...data, content: data.content ?? data.notes ?? null }
        delete mapped.notes
        delete mapped.list_name
        return base.addTodo(mapped as Partial<DbTodo>)
      }
      if (table === "lists") return base.addList(data as Partial<List>)
      if (table === "goals") return base.addGoal(data as Partial<Goal>)
      throw new Error(`Unsupported table: ${table}`)
    },
    async query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes("SELECT * FROM todos WHERE id = ANY(")) {
        const todos = await base.getTodos()
        const ids = (params?.[0] as string[]) || []
        const matched = todos.filter(t => ids.includes(t.id))
        return { rows: matched as T[] }
      }
      if (sql.includes("SELECT * FROM todos WHERE id")) {
        const todos = await base.getTodos()
        const id = params?.[0] as string
        const matched = todos.filter(t => t.id === id)
        return { rows: matched as T[] }
      }
      if (sql.includes("SELECT id FROM todos WHERE is_recurring")) {
        const todos = await base.getTodos()
        const matched = todos.filter(t => t.is_recurring && !t.completed).map(t => ({ id: t.id }))
        return { rows: matched as T[] }
      }
      console.warn("Unsupported query pattern:", sql.substring(0, 80))
      return { rows: [] as T[] }
    },
    async transaction(queries: Array<{ sql: string; params?: unknown[] }>) {
      for (const q of queries) {
        if (q.sql.toUpperCase().startsWith("INSERT INTO TODOS")) {
          const p = (q.params || []) as unknown[]
          const data: Record<string, unknown> = {
            id: p[0], title: p[1], content: p[2] ?? null, completed: p[3] ?? false,
            due_date: p[4] ?? null, created_time: p[5] ?? new Date().toISOString(),
            repeat: p[7] ?? null, is_recurring: p[8] ?? false,
            instance_number: p[9] ?? null, next_due_date: p[10] ?? null,
          }
          await base.addTodo(data as Partial<DbTodo>)
        }
      }
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Date helpers                                                      */
/* ------------------------------------------------------------------ */

class DateCache {
  private dateCache = new Map<string, string>()
  private todayCache: { date: string; timestamp: number } | null = null
  private readonly CACHE_DURATION = 60000

  getTodayString(): string {
    const now = Date.now()
    if (!this.todayCache || now - this.todayCache.timestamp > this.CACHE_DURATION) {
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      }).format(new Date())
      this.todayCache = { date, timestamp: now }
    }
    return this.todayCache.date
  }
  getDateCache(utcDate: string | null | undefined): string {
    if (!utcDate) return ""
    return this.dateCache.get(utcDate) || ""
  }
  setDateCache(utcDate: string, result: string) { this.dateCache.set(utcDate, result) }
  clear() { this.dateCache.clear() }
}

const dateCache = new DateCache()

export const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  if (!utcDate) return ""
  const cached = dateCache.getDateCache(utcDate)
  if (cached) return cached
  try {
    const date = new Date(utcDate)
    if (isNaN(date.getTime())) return ""
    const result = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date)
    dateCache.setDateCache(utcDate, result)
    return result
  } catch { return "" }
}

export const localDateToEndOfDayUTC = (localDate: string | null | undefined): string | null => {
  if (!localDate) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    const [year, month, day] = localDate.split("-").map(Number)
    const d = new Date(Date.UTC(year, month - 1, day, 16, 0))
    d.setUTCDate(d.getUTCDate() - 1)
    const pad = (n: number) => n.toString().padStart(2, "0")
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} 16:00:00+00`
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(localDate)) return localDate
  return null
}

export function formatDbDate(val: unknown): string | null {
  if (!val) return null
  if (typeof val !== "string") return null
  let s: string = val
  if (/^\d{4}-\d{2}-\d{2} 160000$/.test(s)) s = s.replace(' 160000', ' 16:00:00+00')
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}$/.test(s)) {
    try {
      const date = new Date(s)
      if (!isNaN(date.getTime())) {
        return new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(date)
      }
    } catch { /* fall through */ }
    return null
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = new Date(s)
  if (!isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d)
  }
  return null
}

export const normalizeTodo = (raw: Todo): Todo => ({
  id: String(raw.id),
  title: String(raw.title || ""),
  completed: Boolean(raw.completed),
  deleted: Boolean(raw.deleted),
  sort_order: Number(raw.sort_order) || 0,
  due_date: formatDbDate(raw.due_date),
  content: raw.content ? String(raw.content) : null,
  tags: raw.tags ? String(raw.tags) : null,
  priority: Number(raw.priority) || 0,
  created_time: raw.created_time ? String(raw.created_time) : new Date().toISOString(),
  completed_time: raw.completed_time ? String(raw.completed_time) : null,
  start_date: formatDbDate(raw.start_date),
  list_id: raw.list_id ? String(raw.list_id) : null,
  list_name: raw.list_name ? String(raw.list_name) : null,
  repeat: raw.repeat ? String(raw.repeat) : null,
  reminder: raw.reminder ? String(raw.reminder) : null,
  is_recurring: Boolean(raw.is_recurring),
  recurring_parent_id: raw.recurring_parent_id ? String(raw.recurring_parent_id) : null,
  instance_number: raw.instance_number ? Number(raw.instance_number) : null,
  next_due_date: formatDbDate(raw.next_due_date),
  goal_id: sanitizeUuidField(raw.goal_id),
  sort_order_in_goal: raw.sort_order_in_goal ? Number(raw.sort_order_in_goal) : null,
})

export const normalizeList = (raw: List): List => ({
  id: String(raw.id),
  name: String(raw.name || ""),
  sort_order: Number(raw.sort_order) || 0,
  is_hidden: Boolean(raw.is_hidden),
  modified: raw.modified ? String(raw.modified) : new Date().toISOString(),
})

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export type LastAction =
  | { type: "toggle-complete"; data: { id: string; previousCompletedTime: string | null; previousCompleted: boolean } }
  | { type: "delete"; data: Todo }
  | { type: "restore"; data: Todo }
  | { type: "batch-complete"; data: { id: string; previousCompletedTime: string | null; previousCompleted: boolean }[] }

/* ------------------------------------------------------------------ */
/*  Hook                                                              */
/* ------------------------------------------------------------------ */

export function useTodoOperations(todos: Todo[], lists: List[]) {
  const api = useMemo(() => {
    const base = createDexieDatabaseAPI(db)
    return createBackwardCompatApi(base)
  }, [])

  const { todoStore, listStore } = useStores()
  const { alert, confirm } = useAppDialog()

  // ── State ───────────────────────────────────────────────────────
  const [currentMode, setCurrentMode] = useState<"todo" | "goals">(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("app_mode") as "todo" | "goals"
      return saved || "todo"
    }
    return "todo"
  })
  const [currentView, setCurrentView] = useState<string>(() => {
    if (typeof window !== "undefined") return localStorage.getItem("currentView") || "today"
    return "today"
  })
  const [searchRefreshTrigger, setSearchRefreshTrigger] = useState(0)
  const [newTodoTitle, setNewTodoTitle] = useState("")
  const [newTodoDate, setNewTodoDate] = useState<string | null>(null)
  const [newGoalTitle, setNewGoalTitle] = useState("")
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null)
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null)
  const [slogan, setSlogan] = useState("今日事今日毕，勿将今事待明日!.☕")
  const [originalSlogan, setOriginalSlogan] = useState(slogan)
  const [isEditingSlogan, setIsEditingSlogan] = useState(false)
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  const [isManageListsModalOpen, setIsManageListsModalOpen] = useState(false)
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false)
  const [isCalendarCreateModalOpen, setIsCalendarCreateModalOpen] = useState(false)
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string>("")
  const [currentDate, setCurrentDate] = useState<Date>(new Date())
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const addTodoInputRef = useRef<HTMLInputElement>(null)

  // Date state
  const [todayStrInUTC8, setTodayStrInUTC8] = useState(() => dateCache.getTodayString())
  useEffect(() => {
    const interval = setInterval(() => setTodayStrInUTC8(dateCache.getTodayString()), 60000)
    return () => clearInterval(interval)
  }, [])

  // Persist currentView
  useEffect(() => { localStorage.setItem("currentView", currentView) }, [currentView])

  // Persist currentMode
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("app_mode", currentMode)
  }, [currentMode])

  // Clear input on view change
  useEffect(() => {
    setNewTodoTitle("")
    setNewGoalTitle("")
  }, [currentView])

  // Keep the open details view attached to the live Dexie record. TodoModal
  // preserves dirty fields and refreshes only untouched fields from this value.
  useEffect(() => {
    if (!selectedTodo) return
    const latest = todos.find((todo) => todo.id === selectedTodo.id)
    if (latest && latest !== selectedTodo) setSelectedTodo(latest)
  }, [todos, selectedTodo])

  // Date cache cleanup
  useEffect(() => {
    const interval = setInterval(() => dateCache.clear(), 60000)
    return () => clearInterval(interval)
  }, [])

  // Optimized filter/sort
  const { filterInboxTodos } = useOptimizedInboxFilter()
  const { sortInboxTodos } = useOptimizedInboxSort()

  // ── Slogan handlers ─────────────────────────────────────────────
  const handleEditSlogan = useCallback(() => {
    setOriginalSlogan(slogan)
    setIsEditingSlogan(true)
  }, [slogan])

  const handleUpdateSlogan = useMemo(() => debounce(async () => {
      setIsEditingSlogan(false)
      if (slogan === originalSlogan) return
      await db.meta.put({ key: "slogan", value: slogan, updated_at: new Date().toISOString(), deleted_at: null })
    }, 500),
    [slogan, originalSlogan]
  )

  const handleSloganKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") handleUpdateSlogan()
      else if (e.key === "Escape") {
        setSlogan(originalSlogan)
        setIsEditingSlogan(false)
      }
    },
    [handleUpdateSlogan, originalSlogan]
  )

  // ── Todo CRUD handlers ──────────────────────────────────────────
  const handleAddTodo = useCallback(() => {
    if (!newTodoTitle.trim()) return
    setIsTodoModalOpen(true)
  }, [newTodoTitle])

  const handleCreateTodo = useCallback(
    async (todoData: Omit<Todo, "id" | "created_time">) => {
      const newTodoData = { ...todoData, id: uuid(), created_time: new Date().toISOString() }
      await todoStore.getState().addTodo(newTodoData)
      setIsTodoModalOpen(false)
      setNewTodoTitle("")
      if (currentView !== "calendar") setNewTodoDate(null)
    },
    [currentView, todoStore]
  )

  const handleCreateTodoFromCalendar = useCallback(
    async (title: string, listId: string | null, startDate: string | null, dueDate: string | null) => {
      const newTodoData = {
        id: uuid(), title, list_id: listId, start_date: startDate, due_date: dueDate,
        created_time: new Date().toISOString(), completed: false, deleted: false,
      }
      await todoStore.getState().addTodo(newTodoData)
      setIsCalendarCreateModalOpen(false)
    },
    [todoStore]
  )

  const handleUpdateTodo = useCallback(
    async (todoId: string, updates: Partial<Omit<Todo, "id" | "list_name">>) => {
      if (!updates || Object.keys(updates).length === 0) return
      const current = todos.find((todo) => todo.id === todoId)
      if (updates.completed === true
        && current
        && !current.completed
        && RecurringTaskGenerator.isRecurringTask(current)) {
        const completed = { ...current, ...updates } as Todo
        const baseDate = new Date(current.due_date || current.created_time || Date.now())
        const generation = RecurringTaskGenerator.handleRecurringTaskCompletion(completed, baseDate)
        if (generation.shouldGenerateNext && generation.newRecurringTask) {
          const occurrence = generation.newRecurringTask.due_date
            ?? generation.newRecurringTask.start_date
            ?? String(generation.newRecurringTask.instance_number ?? '')
          const successorId = uuidv5(
            `${todoId}:${occurrence}:${current.repeat ?? ''}`,
            'ad8f4ca4-4df5-5f60-91ae-884508a52911',
          )
          const result = await api.completeTodoWithSuccessor(
            todoId,
            updates as Partial<DbTodo>,
            { ...generation.newRecurringTask, id: successorId } as Partial<DbTodo>,
          )
          const storeTodos = todoStore.getState().todos
          todoStore.getState().setTodos([
            ...storeTodos.map((todo) => todo.id === todoId ? result.todo : todo),
            ...storeTodos.some((todo) => todo.id === result.successor.id)
              ? []
              : [result.successor],
          ])
          return
        }
      }
      await todoStore.getState().updateTodo(todoId, updates)
    },
    [api, todoStore, todos]
  )

  const handleToggleComplete = useCallback(
    async (todo: Todo) => {
      setLastAction({
        type: "toggle-complete",
        data: { id: todo.id, previousCompletedTime: todo.completed_time, previousCompleted: !!todo.completed },
      })
      const updates = {
        completed_time: todo.completed ? null : new Date().toISOString(),
        completed: !todo.completed,
      }
      await handleUpdateTodo(todo.id, updates)
      setSearchRefreshTrigger(prev => prev + 1)
    },
    [handleUpdateTodo]
  )

  const handleDeleteTodo = useCallback(
    async (todoId: string) => {
      const todoToDelete = todos.find((t: Todo) => t.id === todoId)
      if (!todoToDelete) return
      setLastAction({ type: "delete", data: todoToDelete })
      if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null)
      await todoStore.getState().updateTodo(todoId, { deleted: true })
      setSearchRefreshTrigger(prev => prev + 1)
    },
    [todos, selectedTodo, todoStore]
  )

  const handleRestoreTodo = useCallback(
    async (todoId: string) => {
      const recycledTodos = todos.filter((t: Todo) => t.deleted)
      const todoToRestore = recycledTodos.find((t: Todo) => t.id === todoId)
      if (!todoToRestore) return
      setLastAction({ type: "restore", data: todoToRestore })
      if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null)
      await todoStore.getState().updateTodo(todoId, { deleted: false })
      setSearchRefreshTrigger(prev => prev + 1)
    },
    [todos, selectedTodo, todoStore]
  )

  const handlePermanentDeleteTodo = useCallback(
    async (todoId: string) => {
      const recycledTodos = todos.filter((t: Todo) => t.deleted)
      const todoToDelete = recycledTodos.find((t: Todo) => t.id === todoId)
      if (!todoToDelete) return
      // “永久删除”在多设备协议中仍写 tombstone；物理删除会导致离线设备复活记录。
      await api.deleteTodo(todoId)
      todoStore.setState((s) => ({ todos: s.todos.filter((t) => t.id !== todoId) }))
      if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null)
    },
    [todos, selectedTodo, api, todoStore]
  )

  const handleSaveTodoDetails = useCallback(
    async (updatedTodo: Todo, dirtyPatch?: Partial<Todo>) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { list_name: _, ...updateData } = dirtyPatch ?? updatedTodo
      await handleUpdateTodo(updatedTodo.id, updateData)
      setSelectedTodo(null)
      setSearchRefreshTrigger(prev => prev + 1)
    },
    [handleUpdateTodo]
  )

  // ── List CRUD handlers ──────────────────────────────────────────
  const handleAddList = useCallback(
    async (name: string): Promise<List | null> => {
      try {
        const newList = { id: uuid(), name, sort_order: lists.length, is_hidden: false, modified: new Date().toISOString() }
        await listStore.getState().addList(newList)
        return newList
      } catch (error) {
        console.error("Failed to add list:", error)
        await alert({
          title: "添加清单失败",
          description: error instanceof Error ? error.message : "未知错误",
        })
        return null
      }
    },
    [lists, listStore, alert]
  )

  const handleDeleteList = useCallback(
    async (listId: string) => {
      const listToDelete = lists.find((l: List) => l.id === listId)
      if (!listToDelete) return
      const allTodos = await api.getTodos()
      const todosToUpdate = allTodos.filter((t) => t.list_id === listId)
      for (const todo of todosToUpdate) await todoStore.getState().updateTodo(todo.id, { list_id: null })
      await listStore.getState().deleteList(listId)
      if (currentView === listToDelete.name) setCurrentView("inbox")
    },
    [lists, currentView, api, todoStore, listStore]
  )

  const handleUpdateList = useCallback(
    async (listId: string, updates: Partial<Omit<List, "id">>) => {
      if (Object.keys(updates).length === 0) return
      await listStore.getState().updateList(listId, updates)
    },
    [listStore]
  )

  const handleUpdateListsOrder = useCallback(
    async (reorderedLists: List[]) => {
      for (let index = 0; index < reorderedLists.length; index++) {
        await listStore.getState().updateList(reorderedLists[index].id, { sort_order: index })
      }
    },
    [listStore]
  )

  // ── Calendar handlers ───────────────────────────────────────────
  const handleAddTodoFromCalendar = useCallback((date: string) => {
    setNewTodoDate(date)
    addTodoInputRef.current?.focus()
  }, [])

  const handleOpenCalendarCreateModal = useCallback((date: string) => {
    setCalendarSelectedDate(date)
    setIsCalendarCreateModalOpen(true)
  }, [])

  // ── Undo ────────────────────────────────────────────────────────
  const handleUndo = useCallback(async () => {
    if (!lastAction) {
      await alert({ title: "无法撤销", description: "没有可撤销的操作。" })
      return
    }
    try {
      switch (lastAction.type) {
        case "toggle-complete":
          await handleUpdateTodo(lastAction.data.id, { completed_time: lastAction.data.previousCompletedTime, completed: lastAction.data.previousCompleted })
          break
        case "delete":
          await handleUpdateTodo(lastAction.data.id, { deleted: false })
          break
        case "restore":
          await handleUpdateTodo(lastAction.data.id, { deleted: true })
          break
        case "batch-complete":
          for (const d of lastAction.data) {
            await handleUpdateTodo(d.id, { completed_time: d.previousCompletedTime, completed: d.previousCompleted })
          }
          break
      }
    } catch (error) {
      await alert({
        title: "撤销操作失败",
        description: error instanceof Error ? error.message : "未知错误",
      })
    }
    setLastAction(null)
  }, [lastAction, handleUpdateTodo, alert])

  // ── Mark all completed ──────────────────────────────────────────
  const handleMarkAllCompleted = useCallback(
    async (displayTodos: Todo[]) => {
      const todosToUpdate = displayTodos.filter((t: Todo) => !t.completed_time)
      if (todosToUpdate.length === 0) return
      const confirmed = await confirm({
        title: "批量完成任务",
        description: `确认将当前视图的 ${todosToUpdate.length} 项全部标记为完成吗？`,
        confirmLabel: "全部完成",
      })
      if (!confirmed) return
      const newCompletedTime = new Date().toISOString()
      setLastAction({
        type: "batch-complete",
        data: todosToUpdate.map((t: Todo) => ({ id: t.id, previousCompletedTime: t.completed_time, previousCompleted: !!t.completed })),
      })
      const updates = { completed: true, completed_time: newCompletedTime }
      for (const todo of todosToUpdate) await handleUpdateTodo(todo.id, updates)
    },
    [handleUpdateTodo, confirm]
  )

  // ── Create todo for goal (used by goal components) ─────────────
  const handleCreateTodoForGoal = useCallback(
    async (todoData: Partial<Todo>) => {
      try {
        const newTodo = { ...todoData, id: uuid(), created_time: new Date().toISOString() }
        await todoStore.getState().addTodo(newTodo)
      } catch (error) {
        console.error("创建待办事项失败:", error)
        await alert({
          title: "创建待办事项失败",
          description: error instanceof Error ? error.message : "未知错误",
        })
      }
    },
    [todoStore, alert]
  )

  // ── Return ──────────────────────────────────────────────────────
  return {
    // API
    api,
    // State
    currentMode, setCurrentMode,
    currentView, setCurrentView,
    searchRefreshTrigger, setSearchRefreshTrigger,
    newTodoTitle, setNewTodoTitle,
    newTodoDate, setNewTodoDate,
    newGoalTitle, setNewGoalTitle,
    selectedTodo, setSelectedTodo,
    selectedGoal, setSelectedGoal,
    slogan, setSlogan,
    originalSlogan, setOriginalSlogan,
    isEditingSlogan, setIsEditingSlogan,
    lastAction, setLastAction,
    isManageListsModalOpen, setIsManageListsModalOpen,
    isTodoModalOpen, setIsTodoModalOpen,
    isCalendarCreateModalOpen, setIsCalendarCreateModalOpen,
    calendarSelectedDate, setCalendarSelectedDate,
    currentDate, setCurrentDate,
    isSearchModalOpen, setIsSearchModalOpen,
    isSettingsOpen, setIsSettingsOpen,
    todayStrInUTC8,
    addTodoInputRef,
    // Slogan handlers
    handleEditSlogan, handleUpdateSlogan, handleSloganKeyDown,
    // Todo CRUD
    handleAddTodo, handleCreateTodo, handleCreateTodoFromCalendar,
    handleUpdateTodo, handleToggleComplete, handleDeleteTodo,
    handleRestoreTodo, handlePermanentDeleteTodo, handleSaveTodoDetails,
    // List CRUD
    handleAddList, handleDeleteList, handleUpdateList, handleUpdateListsOrder,
    // Calendar
    handleAddTodoFromCalendar, handleOpenCalendarCreateModal,
    // Undo / Batch
    handleUndo, handleMarkAllCompleted,
    // Goal-related todo creation
    handleCreateTodoForGoal,
    // Optimized filter/sort
    filterInboxTodos, sortInboxTodos,
  }
}
