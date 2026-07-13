'use client'

import { forwardRef, useCallback, useImperativeHandle, useMemo, useState } from 'react'
import { Plus } from 'lucide-react'
import type { Goal, Todo, List } from '@/lib/types'
import GoalsList from './GoalsList'
import GoalViewOptions, { type GoalView } from './GoalViewOptions'
import ArchivedGoalsList from './ArchivedGoalsList'
import { Button } from '@/components/ui/button'

interface GoalsMainInterfaceProps {
  goals: Goal[]
  todos: Todo[]
  lists: List[]
  selectedGoal: Goal | null
  onSelectGoal: (goal: Goal | null) => void
  onUpdateGoal: (goal: Goal) => void
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => void
  onDeleteTodo: (todoId: string) => void
  onDeleteGoal: (goalId: string) => void
  onCreateTodo: (todo: Omit<Todo, 'id' | 'created_time'>) => void
  onAssociateTasks: (taskIds: string[], goalId: string) => void
  onEditGoal: (goal: Goal) => void
  onArchiveGoal: (goalId: string) => void
  onCreateGoal: () => void
}

export interface GoalsMainInterfaceRef {
  selectGoalById: (goalId: string) => void
  selectGoalDirectly: (goal: Goal) => void
  updateSelectedGoal: (updatedGoal: Goal) => void
}

const GoalsMainInterface = forwardRef<GoalsMainInterfaceRef, GoalsMainInterfaceProps>((props, ref) => {
  const {
    goals,
    selectedGoal,
    onSelectGoal,
    onArchiveGoal,
    onCreateGoal,
    onEditGoal,
    onDeleteGoal,
  } = props
  const [goalView, setGoalView] = useState<GoalView>('active')

  const visibleGoals = useMemo(
    () => goals.filter((goal) => (goalView === 'active' ? !goal.is_archived : goal.is_archived)),
    [goals, goalView]
  )
  const goalCounts = useMemo(() => ({
    active: goals.filter((goal) => !goal.is_archived).length,
    archived: goals.filter((goal) => goal.is_archived).length,
  }), [goals])

  const selectGoalById = useCallback((goalId: string) => {
    const goal = goals.find((item) => item.id === goalId)
    if (goal) onSelectGoal(goal)
  }, [goals, onSelectGoal])

  const selectGoalDirectly = useCallback((goal: Goal) => onSelectGoal(goal), [onSelectGoal])

  useImperativeHandle(ref, () => ({
    selectGoalById,
    selectGoalDirectly,
    updateSelectedGoal: (updatedGoal) => {
      if (selectedGoal?.id === updatedGoal.id) onSelectGoal(updatedGoal)
    },
  }), [onSelectGoal, selectGoalById, selectGoalDirectly, selectedGoal?.id])

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <div className="pt-4">
        <header className="flex min-h-[49px] items-center justify-between gap-3 py-2">
          <div className="min-w-0">
            <h1 className="text-left text-sm font-semibold text-foreground">我的目标</h1>
          </div>
          <Button type="button" size="sm" className="h-11 shrink-0 md:h-8" onClick={onCreateGoal}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            创建目标
          </Button>
        </header>
      </div>

      <div className="pt-4">
        <GoalViewOptions currentView={goalView} onViewChange={setGoalView} counts={goalCounts} />
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto">
        {goalView === 'active' ? (
          <GoalsList
            goals={visibleGoals}
            onGoalClick={onSelectGoal}
            onEditGoal={onEditGoal}
            onArchiveGoal={onArchiveGoal}
            onDeleteGoal={onDeleteGoal}
            onCreateGoal={onCreateGoal}
          />
        ) : (
          <ArchivedGoalsList
            goals={visibleGoals}
            onRestoreGoal={onArchiveGoal}
            onDeleteGoal={onDeleteGoal}
            onViewGoal={onSelectGoal}
          />
        )}
      </div>

      <div className="mt-auto flex items-center border-t border-border px-1 py-3">
        <span className="text-xs text-muted-foreground">
          {goalView === 'active' ? `${visibleGoals.length} 项进行中` : `共 ${visibleGoals.length} 项已存档`}
        </span>
      </div>
    </div>
  )
})

GoalsMainInterface.displayName = 'GoalsMainInterface'

export default GoalsMainInterface
