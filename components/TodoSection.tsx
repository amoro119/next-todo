'use client'

import { TodoList } from "@/components/TodoList"
import GoalDetailsDrawer from "@/components/goals/GoalDetailsDrawer"
import { utcToLocalDateString } from "@/lib/hooks/useTodoOperations"
import type { Todo, List, Goal } from "@/lib/types"
import { TodoViewOptions } from "@/components/todos/TodoViewOptions"
import { TodoInput } from "@/components/todos/TodoInput"
import TodoDetailsDrawer from "@/components/todos/TodoDetailsDrawer"

interface TodoSectionProps {
  todos: Todo[]
  todosWithListNames: Todo[]
  lists: List[]
  goals: Goal[]
  displayTodos: Todo[]
  uncompletedTodos: Todo[]
  recycledTodos: Todo[]
  todosByList: Record<string, number>
  goalsByList: Record<string, number>
  todayStrInUTC8: string
  currentView: string
  setCurrentView: (v: string) => void
  newTodoTitle: string
  setNewTodoTitle: (v: string) => void
  newTodoDate: string | null
  selectedTodo: Todo | null
  setSelectedTodo: (t: Todo | null) => void
  selectedGoal: Goal | null
  setSelectedGoal: (g: Goal | null) => void
  handleAddTodo: () => void
  handleToggleComplete: (t: Todo) => Promise<void>
  handleDeleteTodo: (id: string) => Promise<void>
  handleRestoreTodo: (id: string) => Promise<void>
  handlePermanentDeleteTodo: (id: string) => Promise<void>
  handleSaveTodoDetails: (todo: Todo, dirtyPatch?: Partial<Todo>) => Promise<void>
  handleUpdateTodo: (id: string, u: Partial<Omit<Todo, "id" | "list_name">>) => Promise<void>
  handleCreateTodoForGoal: (d: Partial<Todo>) => Promise<void>
  handleEditGoal: (g: Goal) => void
  handleAssociateTasks: (ids: string[], gid: string) => Promise<void>
  handleUpdateGoal: (g: Goal) => Promise<void>
}

export function TodoSection({
  todosWithListNames,
  lists,
  goals,
  displayTodos,
  uncompletedTodos,
  recycledTodos,
  todosByList,
  todayStrInUTC8,
  currentView,
  setCurrentView,
  newTodoTitle,
  setNewTodoTitle,
  selectedTodo,
  setSelectedTodo,
  selectedGoal,
  setSelectedGoal,
  handleAddTodo,
  handleToggleComplete,
  handleDeleteTodo,
  handleRestoreTodo,
  handlePermanentDeleteTodo,
  handleSaveTodoDetails,
  handleUpdateTodo,
  handleCreateTodoForGoal,
  handleEditGoal,
  handleAssociateTasks,
  handleUpdateGoal,
}: TodoSectionProps) {
  return (
    <div className="flex flex-col h-full w-full mx-auto px-4">
      <div className="flex flex-col flex-1 w-full min-h-0">
        <div className="flex flex-col flex-1 w-full min-h-0">
          <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
            <div className={`flex min-w-0 flex-1 flex-col gap-0 overflow-hidden ${selectedGoal || selectedTodo ? 'sm:pr-5' : ''}`}>
              <div className="pt-4">
                <TodoInput
                  value={newTodoTitle}
                  onChange={setNewTodoTitle}
                  onSubmit={handleAddTodo}
                />
              </div>
              <div className="pt-4">
                <TodoViewOptions
                  lists={lists}
                  currentView={currentView}
                  setCurrentView={setCurrentView}
                  todosByList={todosByList}
                  uncompletedTodos={uncompletedTodos}
                  recycledTodos={recycledTodos}
                  todayCount={
                    todosWithListNames.filter(
                      (t) => !t.deleted && t.due_date && utcToLocalDateString(t.due_date) === todayStrInUTC8
                    ).length
                  }
                />
              </div>

              <div className="flex-1 min-h-0 mt-2">
                <TodoList
                  todos={displayTodos}
                  goals={goals}
                  currentView={currentView}
                  onToggleComplete={handleToggleComplete}
                  onRestore={handleRestoreTodo}
                  onSelectTodo={(todo) => {
                    setSelectedGoal(null)
                    setSelectedTodo(todo)
                  }}
                  onViewGoal={(goalId) => {
                    const goal = goals.find((g) => g.id === goalId)
                    if (goal) {
                      setSelectedTodo(null)
                      setSelectedGoal(goal)
                    }
                  }}
                  onOpenCreateTodo={handleAddTodo}
                />
              </div>

              <div className="mt-auto flex items-center py-3 px-1 border-t border-[oklch(var(--border))]">
                <span className="text-xs text-[oklch(var(--muted-foreground))]">
                  {currentView !== "recycle" ? (
                    <>{displayTodos.filter((t) => !t.completed_time).length} 项未完成</>
                  ) : (
                    <>共 {recycledTodos.length} 项</>
                  )}
                </span>
              </div>
            </div>

            <TodoDetailsDrawer
              todo={selectedTodo}
              goals={goals}
              lists={lists}
              onSubmit={handleSaveTodoDetails}
              onUpdate={handleUpdateTodo}
              onDelete={handleDeleteTodo}
              onRestore={handleRestoreTodo}
              onPermanentDelete={handlePermanentDeleteTodo}
              onClose={() => setSelectedTodo(null)}
            />

            <GoalDetailsDrawer
              goal={selectedGoal}
              todos={selectedGoal ? displayTodos.filter((todo) => todo.goal_id === selectedGoal.id) : []}
              goals={goals}
              lists={lists}
              onUpdateGoal={handleUpdateGoal}
              onUpdateTodo={handleUpdateTodo}
              onDeleteTodo={handleDeleteTodo}
              onCreateTodo={handleCreateTodoForGoal}
              onAssociateTasks={handleAssociateTasks}
              onEditGoal={handleEditGoal}
              onClose={() => setSelectedGoal(null)}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
