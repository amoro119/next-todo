'use client'

import GoalsMainInterface from "@/components/goals/GoalsMainInterface"
import GoalDetails from "@/components/goals/GoalDetails"
import type { Todo, List, Goal } from "@/lib/types"
import type { GoalsMainInterfaceRef } from "@/components/goals/GoalsMainInterface"
import type { RefObject } from "react"

interface GoalsSectionProps {
  todos: Todo[]
  lists: List[]
  goals: Goal[]
  currentView: string
  selectedGoal: Goal | null
  setSelectedGoal: (g: Goal | null) => void
  handleUpdateTodo: (id: string, u: Partial<Omit<Todo, "id" | "list_name">>) => Promise<void>
  handleDeleteTodo: (id: string) => Promise<void>
  handleCreateTodoForGoal: (d: Partial<Todo>) => Promise<void>
  handleAssociateTasks: (ids: string[], gid: string) => Promise<void>
  handleEditGoal: (g: Goal) => void
  handleUpdateGoal: (g: Goal) => Promise<void>
  handleDeleteGoal: (id: string) => Promise<void>
  goalsMainInterfaceRef: RefObject<GoalsMainInterfaceRef | null>
}

export function GoalsSection({
  todos,
  lists,
  goals,
  currentView,
  selectedGoal,
  setSelectedGoal,
  handleUpdateTodo,
  handleDeleteTodo,
  handleCreateTodoForGoal,
  handleAssociateTasks,
  handleEditGoal,
  handleUpdateGoal,
  handleDeleteGoal,
  goalsMainInterfaceRef,
}: GoalsSectionProps) {
  return (
    <div className="flex flex-col flex-1 w-full mx-auto px-4">
      <div className="flex flex-col flex-1 w-full goals">
        <div className="flex flex-col flex-1 w-full">
          {selectedGoal ? (
            <GoalDetails
              goal={selectedGoal}
              todos={todos.filter((t) => t.goal_id === selectedGoal.id)}
              goals={goals}
              lists={lists}
              onUpdateGoal={handleUpdateGoal}
              onUpdateTodo={handleUpdateTodo}
              onDeleteTodo={handleDeleteTodo}
              onCreateTodo={handleCreateTodoForGoal}
              onAssociateTasks={handleAssociateTasks}
              onClose={() => setSelectedGoal(null)}
            />
          ) : (
            <div className="w-full">
              <GoalsMainInterface
                ref={goalsMainInterfaceRef}
                goals={
                  currentView === "goals-main"
                    ? goals
                    : goals.filter((goal) => goal.list_name === currentView)
                }
                todos={todos}
                lists={lists}
                onUpdateGoal={handleUpdateGoal}
                onUpdateTodo={handleUpdateTodo}
                onDeleteTodo={handleDeleteTodo}
                onDeleteGoal={handleDeleteGoal}
                onCreateTodo={handleCreateTodoForGoal}
                onAssociateTasks={handleAssociateTasks}
                onEditGoal={handleEditGoal}
                onArchiveGoal={(goalId) => console.log("Archive goal:", goalId)}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
