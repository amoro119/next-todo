'use client'

import { useEffect, useMemo, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useLiveQuery as useDexieLiveQuery } from "dexie-react-hooks"
import { useUIStore } from "@/lib/stores/uiStore"
import { useTodosQuery, useListsQuery, useGoalsQuery } from "@/lib/hooks/useDexieQuery"
import {
  useTodoOperations,
  normalizeTodo,
  normalizeList,
  utcToLocalDateString,
  localDateToEndOfDayUTC,
} from "@/lib/hooks/useTodoOperations"
import { useGoalOperations } from "@/lib/hooks/useGoalOperations"
import { db } from "@/lib/db/dexie"
import { LayoutShell } from "@/components/layout/LayoutShell"
import CalendarView from "@/components/calendar/CalendarView"
import { AppModals } from "@/components/layout/AppModals"
import { ModeIndicator } from "@/components/ModeIndicator"
import { TodoSection } from "@/components/TodoSection"
import { GoalsSection } from "@/components/GoalsSection"
import TodoDetailsDrawer from "@/components/todos/TodoDetailsDrawer"
import { useOptimizedInboxFilter } from "@/components/InboxPerformanceOptimizer"
import type { Todo, List, Goal } from "@/lib/types"

export default function Page() {
  const { activeSection, setActiveSection } = useUIStore()

  const { data: todosRaw } = useTodosQuery()
  const { data: listsRaw } = useListsQuery()
  const { data: goalsRaw } = useGoalsQuery()
  const sloganMeta = useDexieLiveQuery(() => db.meta.get("slogan"), [])

  const todos = useMemo(() => todosRaw.map(normalizeTodo), [todosRaw])
  const lists = useMemo(() => listsRaw.map(normalizeList), [listsRaw])

  const goals = useMemo(() => {
    return goalsRaw.map((goal) => {
      const list = listsRaw.find((l) => l.id === goal.list_id)
      const taskTodos = todosRaw.filter((t) => t.goal_id === goal.id && !t.deleted)
      const completedTasks = taskTodos.filter((t) => t.completed)
      return {
        ...goal,
        list_name: list?.name ?? null,
        total_tasks: taskTodos.length,
        completed_tasks: completedTasks.length,
        progress: taskTodos.length > 0 ? Math.round((completedTasks.length / taskTodos.length) * 100) : 0,
      } as Goal
    })
  }, [goalsRaw, listsRaw, todosRaw])

  const todoOps = useTodoOperations(todos, lists)
  const { setSlogan, todayStrInUTC8: operationTodayStr, currentView, setCurrentMode, setCurrentView, setSelectedGoal, sortInboxTodos } = todoOps
  const goalOps = useGoalOperations(goals, lists, todos, setSelectedGoal)

  useEffect(() => {
    if (sloganMeta?.value) setSlogan(String(sloganMeta.value))
  }, [sloganMeta, setSlogan])

  const todosWithListNames = useMemo(() => {
    const listMap = new Map(lists.map((list) => [list.id, list.name]))
    return todos.map((todo) => ({
      ...todo,
      list_name: todo.list_id ? listMap.get(todo.list_id) || null : null,
    }))
  }, [todos, lists])

  const { filterInboxTodos } = useOptimizedInboxFilter()

  const uncompletedTodos = useMemo(
    () => todosWithListNames.filter((t: Todo) => !t.completed && !t.deleted),
    [todosWithListNames]
  )

  const recycledTodos = useMemo(
    () => todosWithListNames.filter((t: Todo) => t.deleted),
    [todosWithListNames]
  )

  const todosByList = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const todo of uncompletedTodos) {
      if (todo.list_id) counts[todo.list_id] = (counts[todo.list_id] || 0) + 1
    }
    const nameCounts: Record<string, number> = {}
    for (const list of lists) {
      if (counts[list.id]) nameCounts[list.name] = counts[list.id]
    }
    return nameCounts
  }, [lists, uncompletedTodos])

  const goalsByList = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const goal of goals) {
      if (goal.list_id) {
        const list = lists.find((l: List) => l.id === goal.list_id)
        if (list) counts[list.name] = (counts[list.name] || 0) + 1
      }
    }
    return counts
  }, [goals, lists])

  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [todayStrInUTC8, setTodayStrInUTC8] = useState(() => operationTodayStr)

  useEffect(() => {
    const interval = setInterval(() => setTodayStrInUTC8(operationTodayStr), 60000)
    return () => clearInterval(interval)
  }, [operationTodayStr])

  const displayTodos = useMemo(() => {
    if (currentView === "inbox") {
      const filtered = filterInboxTodos(uncompletedTodos)
      return sortInboxTodos(filtered)
    }
    if (currentView === "today") {
      return todosWithListNames.filter((t: Todo) => {
        if (t.deleted) return false
        const sd = utcToLocalDateString(t.start_date)
        const dd = utcToLocalDateString(t.due_date)
        if (sd && dd) return sd <= todayStrInUTC8 && dd >= todayStrInUTC8
        if (dd) return dd <= todayStrInUTC8
        return false
      })
    }
    if (currentView === "recycle") return recycledTodos
    if (currentView === "calendar") return []
    return uncompletedTodos.filter((t: Todo) => {
      if (currentView === "all") return true
      return t.list_name === currentView
    })
  }, [currentView, uncompletedTodos, recycledTodos, todosWithListNames, todayStrInUTC8, filterInboxTodos, sortInboxTodos])

  useEffect(() => {
    const handler = (event: CustomEvent) => {
      setActiveSection(event.detail.mode === "goals" ? "goals" : "todo")
    }
    window.addEventListener("modeChanged", handler as EventListener)
    return () => window.removeEventListener("modeChanged", handler as EventListener)
  }, [setActiveSection])

  useEffect(() => {
    if (activeSection === "goals") { setCurrentMode("goals"); setCurrentView("goals-main") }
    else if (activeSection === "todo") {
      setCurrentMode("todo")
      setCurrentView("today")
    }
    else if (activeSection === "calendar") { setCurrentView("calendar") }
  }, [activeSection, setCurrentMode, setCurrentView])


  return (
    <><LayoutShell
      onOpenSettings={() => setIsSettingsOpen(true)}
      onSectionChange={(section) => {
        if (section !== "goals") setSelectedGoal(null)
        if (section !== "todo") todoOps.setSelectedTodo(null)
      }}
    >
      {process.env.NODE_ENV === "development" && <ModeIndicator />}

      <AnimatePresence mode="wait">
      {activeSection === "todo" && (
        <motion.div
          key="todo"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="h-full"
        >
        <TodoSection
          todos={todos}
          todosWithListNames={todosWithListNames}
          lists={lists}
          goals={goals}
          displayTodos={displayTodos}
          uncompletedTodos={uncompletedTodos}
          recycledTodos={recycledTodos}
          todosByList={todosByList}
          goalsByList={goalsByList}
          todayStrInUTC8={todayStrInUTC8}
          currentView={todoOps.currentView}
          setCurrentView={todoOps.setCurrentView}
          newTodoTitle={todoOps.newTodoTitle}
          setNewTodoTitle={todoOps.setNewTodoTitle}
          newTodoDate={todoOps.newTodoDate}
          selectedTodo={todoOps.selectedTodo}
          setSelectedTodo={todoOps.setSelectedTodo}
          selectedGoal={todoOps.selectedGoal}
          setSelectedGoal={todoOps.setSelectedGoal}
          handleAddTodo={todoOps.handleAddTodo}
          handleToggleComplete={todoOps.handleToggleComplete}
          handleDeleteTodo={todoOps.handleDeleteTodo}
          handleRestoreTodo={todoOps.handleRestoreTodo}
          handlePermanentDeleteTodo={todoOps.handlePermanentDeleteTodo}
          handleSaveTodoDetails={todoOps.handleSaveTodoDetails}
          handleUpdateTodo={todoOps.handleUpdateTodo}
          handleCreateTodoForGoal={todoOps.handleCreateTodoForGoal}
          handleEditGoal={goalOps.handleEditGoal}
          handleAssociateTasks={goalOps.handleAssociateTasks}
          handleUpdateGoal={goalOps.handleUpdateGoal}
        />
        </motion.div>
      )}

      {activeSection === "goals" && (
        <motion.div
          key="goals"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="h-full"
        >
        <GoalsSection
          todos={todos}
          lists={lists}
          goals={goals}
          currentView={todoOps.currentView}
          selectedGoal={todoOps.selectedGoal}
          setSelectedGoal={todoOps.setSelectedGoal}
          handleUpdateTodo={todoOps.handleUpdateTodo}
          handleDeleteTodo={todoOps.handleDeleteTodo}
          handleCreateTodoForGoal={todoOps.handleCreateTodoForGoal}
          handleAssociateTasks={goalOps.handleAssociateTasks}
          handleEditGoal={goalOps.handleEditGoal}
          handleCreateGoal={goalOps.handleCreateGoal}
          handleUpdateGoal={goalOps.handleUpdateGoal}
          handleDeleteGoal={goalOps.handleDeleteGoal}
          handleArchiveGoal={goalOps.handleArchiveGoal}
          goalsMainInterfaceRef={goalOps.goalsMainInterfaceRef}
        />
        </motion.div>
      )}

      {activeSection === "calendar" && (
        <motion.div
          key="calendar"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
          className="flex h-full min-h-0 overflow-hidden"
        >
        <div
          className={`min-h-0 min-w-0 flex-1 overflow-hidden ${todoOps.selectedTodo ? 'sm:pr-5' : ''}`}
          onPointerDown={todoOps.selectedTodo ? () => todoOps.setSelectedTodo(null) : undefined}
        >
          <CalendarView
            todos={todosWithListNames}
            currentDate={todoOps.currentDate}
            selectedTodoId={todoOps.selectedTodo?.id}
            onDateChange={todoOps.setCurrentDate}
            onUpdateTodo={todoOps.handleUpdateTodo}
            onOpenModal={todoOps.setSelectedTodo}
            onAddTodo={todoOps.handleAddTodoFromCalendar}
            onOpenCreateModal={todoOps.handleOpenCalendarCreateModal}
            onCloseTodoDetails={() => todoOps.setSelectedTodo(null)}
          />
        </div>
        <TodoDetailsDrawer
          todo={todoOps.selectedTodo}
          goals={goals}
          lists={lists}
          onSubmit={todoOps.handleSaveTodoDetails}
          onUpdate={todoOps.handleUpdateTodo}
          onDelete={todoOps.handleDeleteTodo}
          onRestore={todoOps.handleRestoreTodo}
          onPermanentDelete={todoOps.handlePermanentDeleteTodo}
          onClose={() => todoOps.setSelectedTodo(null)}
        />
        </motion.div>
      )}

      </AnimatePresence>


    </LayoutShell>
      <AppModals
        isSettingsOpen={isSettingsOpen}
        onCloseSettings={() => setIsSettingsOpen(false)}
        lists={lists}
        todos={todos}
        uncompletedTodos={uncompletedTodos}
        goals={goals}
        isManageListsModalOpen={todoOps.isManageListsModalOpen}
        onAddList={todoOps.handleAddList}
        onUpdateList={todoOps.handleUpdateList}
        onDeleteList={todoOps.handleDeleteList}
        onUpdateListsOrder={todoOps.handleUpdateListsOrder}
        onCloseManageListsModal={() => todoOps.setIsManageListsModalOpen(false)}
        isTodoModalOpen={todoOps.isTodoModalOpen}
        newTodoTitle={todoOps.newTodoTitle}
        newTodoDate={todoOps.newTodoDate}
        onCreateTodo={todoOps.handleCreateTodo as (todoData: Partial<Todo>) => Promise<string | undefined>}
        onCloseTodoModal={() => { todoOps.setIsTodoModalOpen(false); todoOps.setNewTodoTitle("") }}
        isSearchModalOpen={todoOps.isSearchModalOpen}
        onSelectTodo={(t) => {
          todoOps.setSelectedGoal(null)
          todoOps.setSelectedTodo(t)
        }}
        onSelectGoal={(g) => {
          setActiveSection("goals")
          todoOps.setSelectedTodo(null)
          todoOps.setSelectedGoal(g)
        }}
        onToggleTodoComplete={async (t) => { await todoOps.handleToggleComplete(t) }}
        onOpenSearchModal={() => todoOps.setIsSearchModalOpen(true)}
        onCloseSearchModal={() => todoOps.setIsSearchModalOpen(false)}
        isCalendarCreateModalOpen={todoOps.isCalendarCreateModalOpen}
        calendarSelectedDate={todoOps.calendarSelectedDate}
        onCalendarCreateTodo={async (todoData) => {
          const listId = todoData.list_id || null
          const dueDateUTC = todoOps.calendarSelectedDate ? localDateToEndOfDayUTC(todoOps.calendarSelectedDate) : null
          todoOps.setIsCalendarCreateModalOpen(false)
          await (todoOps.handleCreateTodo as (d: Partial<Todo>) => Promise<string | undefined>)({ ...todoData, list_id: listId, due_date: dueDateUTC, start_date: dueDateUTC })
        }}
        onCloseCalendarCreateModal={() => { todoOps.setIsCalendarCreateModalOpen(false); todoOps.setNewTodoTitle("") }}
        selectedTodo={todoOps.selectedTodo}
        showSelectedTodoModal={activeSection !== "todo" && activeSection !== "calendar"}
        onSaveTodoDetails={todoOps.handleSaveTodoDetails}
        onUpdateTodo={todoOps.handleUpdateTodo}
        onCloseSelectedTodo={() => todoOps.setSelectedTodo(null)}
        onDeleteTodo={async (todoId) => { todoOps.handleDeleteTodo(todoId); todoOps.setSelectedTodo(null) }}
        onRestoreTodo={todoOps.handleRestoreTodo}
        onPermanentDeleteTodo={todoOps.handlePermanentDeleteTodo}
        isGoalModalOpen={goalOps.isGoalModalOpen}
        editingGoalId={goalOps.editingGoalId}
        newGoalTitle={todoOps.newGoalTitle}
        onSaveGoal={goalOps.handleSaveGoal}
        onGoalCreated={goalOps.handleGoalCreated}
        onCloseGoalModal={() => { goalOps.handleCloseGoalModal(); todoOps.setNewGoalTitle("") }}
      />
    </>
  )
}
