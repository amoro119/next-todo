'use client'
import React from 'react'
import type { Todo, List, Goal } from '@/lib/types'
import { GoalFormData } from '@/components/goals/GoalModal'
import TodoModal from '@/components/TodoModal'
import ManageListsModal from '@/components/ManageListsModal'
import GoalModal from '@/components/goals/GoalModal'
import SettingsModal from '@/components/layout/SettingsModal'
import { CommandPalette } from '@/components/command/CommandPalette'

export interface AppModalsProps {
  lists: List[]
  todos: Todo[]
  uncompletedTodos: Todo[]
  goals: Goal[]

  isManageListsModalOpen: boolean
  onAddList: (name: string) => Promise<List | null>
  onUpdateList: (listId: string, updates: Partial<List>) => Promise<void>
  onDeleteList: (listId: string) => Promise<void>
  onUpdateListsOrder: (lists: List[]) => Promise<void>
  onCloseManageListsModal: () => void

  isTodoModalOpen: boolean
  newTodoTitle: string
  newTodoDate: string | null
  onCreateTodo: (todoData: Partial<Todo>) => Promise<string | undefined>
  onCloseTodoModal: () => void

  isSearchModalOpen: boolean
  onSelectTodo: (todo: Todo) => void
  onSelectGoal: (goal: Goal) => void
  onToggleTodoComplete: (todo: Todo) => Promise<void>
  onOpenSearchModal: () => void
  onCloseSearchModal: () => void

  isCalendarCreateModalOpen: boolean
  calendarSelectedDate: string | undefined
  onCalendarCreateTodo: (todoData: Partial<Todo>) => Promise<void>
  onCloseCalendarCreateModal: () => void

  selectedTodo: Todo | null
  onSaveTodoDetails: (todoData: Todo) => Promise<void>
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => Promise<void>
  onCloseSelectedTodo: () => void
  onDeleteTodo: (todoId: string) => Promise<void>
  onRestoreTodo: (todoId: string) => void | Promise<void>
  onPermanentDeleteTodo: (todoId: string) => Promise<void>

  isGoalModalOpen: boolean
  editingGoalId: string | null | undefined
  newGoalTitle: string
  onSaveGoal: (goalData: GoalFormData) => Promise<string>
  onGoalCreated: (goalId: string) => Promise<void>
  onCloseGoalModal: () => void

  isSettingsOpen: boolean
  onCloseSettings: () => void
}

export function AppModals(props: AppModalsProps) {
  const {
    lists, todos, uncompletedTodos, goals,
    isManageListsModalOpen,
    onAddList, onUpdateList, onDeleteList, onUpdateListsOrder, onCloseManageListsModal,
    isTodoModalOpen, newTodoTitle, newTodoDate, onCreateTodo, onCloseTodoModal,
    isSearchModalOpen, onSelectTodo, onSelectGoal, onOpenSearchModal, onCloseSearchModal,
    isCalendarCreateModalOpen, calendarSelectedDate, onCalendarCreateTodo, onCloseCalendarCreateModal,
    selectedTodo, onSaveTodoDetails, onUpdateTodo, onCloseSelectedTodo,
    onDeleteTodo, onRestoreTodo, onPermanentDeleteTodo,
    isGoalModalOpen, editingGoalId, newGoalTitle,
    onSaveGoal, onGoalCreated, onCloseGoalModal,
    isSettingsOpen, onCloseSettings,
  } = props

  return (
    <>
      {isManageListsModalOpen && (
        <ManageListsModal
          lists={lists}
          onAddList={onAddList}
          onUpdateList={onUpdateList}
          onDeleteList={onDeleteList}
          onUpdateListsOrder={onUpdateListsOrder}
          onClose={onCloseManageListsModal}
        />
      )}

      {isTodoModalOpen && (
        <TodoModal
          isOpen={isTodoModalOpen}
          mode="create"
          lists={lists}
          goals={goals}
          initialData={{ title: newTodoTitle, start_date: newTodoDate, due_date: newTodoDate }}
          onSubmit={onCreateTodo}
          onClose={onCloseTodoModal}
        />
      )}

      <CommandPalette
        open={isSearchModalOpen}
        todos={todos}
        goals={goals}
        onOpenChange={(open) => {
          if (open) onOpenSearchModal()
          else onCloseSearchModal()
        }}
        onSelectTodo={onSelectTodo}
        onSelectGoal={onSelectGoal}
      />

      {isCalendarCreateModalOpen && (
        <TodoModal
          isOpen={isCalendarCreateModalOpen}
          mode="create"
          lists={lists}
          goals={goals}
          initialData={{ title: newTodoTitle, start_date: calendarSelectedDate, due_date: calendarSelectedDate }}
          onSubmit={onCalendarCreateTodo}
          onClose={onCloseCalendarCreateModal}
        />
      )}

      {selectedTodo && (
        <TodoModal
          isOpen={!!selectedTodo}
          mode="edit"
          lists={lists}
          goals={goals}
          initialData={selectedTodo}
          onSubmit={onSaveTodoDetails}
          onUpdate={onUpdateTodo}
          onClose={onCloseSelectedTodo}
          onDelete={onDeleteTodo}
          onRestore={onRestoreTodo}
          onPermanentDelete={onPermanentDeleteTodo}
        />
      )}

      {isGoalModalOpen && (
        <GoalModal
          isOpen={isGoalModalOpen}
          goal={editingGoalId && editingGoalId !== "new" ? goals.find((g) => g.id === editingGoalId) || undefined : undefined}
          goalId={editingGoalId ?? undefined}
          initialName={editingGoalId === "new" ? newGoalTitle : undefined}
          lists={lists}
          availableTodos={uncompletedTodos}
          goalTodos={editingGoalId && editingGoalId !== "new" ? todos.filter((t) => t.goal_id === editingGoalId) : undefined}
          onSave={onSaveGoal}
          onGoalCreated={onGoalCreated}
          onClose={onCloseGoalModal}
        />
      )}

      <SettingsModal isOpen={isSettingsOpen} onClose={onCloseSettings} />
    </>
  )
}
