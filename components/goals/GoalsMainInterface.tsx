// components/goals/GoalsMainInterface.tsx
import { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Goal, Todo, List } from '@/lib/types';
import GoalsList from './GoalsList';
import GoalDetails from './GoalDetails';
import GoalHeader from './GoalHeader';
import GoalViewOptions, { type GoalView } from './GoalViewOptions';
import ArchivedGoalsList from './ArchivedGoalsList';

interface GoalsMainInterfaceProps {
  goals: Goal[];
  todos: Todo[];
  lists: List[];
  onUpdateGoal: (goal: Goal) => void;
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => void;
  onDeleteTodo: (todoId: string) => void;
  onDeleteGoal: (goalId: string) => void;
  onCreateTodo: (todo: Omit<Todo, 'id' | 'created_time'>) => void;
  onAssociateTasks: (taskIds: string[], goalId: string) => void;
  onEditGoal: (goal: Goal) => void;
  onArchiveGoal: (goalId: string) => void;
  onSelectGoal?: (goalId: string) => void;
}

export interface GoalsMainInterfaceRef {
  selectGoalById: (goalId: string) => void;
  selectGoalDirectly: (goal: Goal) => void;
  updateSelectedGoal: (updatedGoal: Goal) => void;
}

const GoalsMainInterface = forwardRef<GoalsMainInterfaceRef, GoalsMainInterfaceProps>(({
  goals,
  todos,
  lists,
  onUpdateGoal,
  onUpdateTodo,
  onDeleteTodo,
  onDeleteGoal,
  onCreateTodo,
  onAssociateTasks,
  onEditGoal,
  onArchiveGoal,
  onSelectGoal
}, ref) => {
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [goalView, setGoalView] = useState<GoalView>('active');

  const handleGoalClick = useCallback((goal: Goal) => {
    setSelectedGoal(goal);
  }, []);

  const handleSelectGoalById = useCallback((goalId: string) => {
    console.log('GoalsMainInterface: 尝试选择目标', goalId);
    console.log('GoalsMainInterface: 当前可用目标', goals.map(g => ({ id: g.id, name: g.name })));
    
    const goal = goals.find(g => g.id === goalId);
    if (goal) {
      console.log('GoalsMainInterface: 找到目标，设置为选中状态', goal);
      setSelectedGoal(goal);
      if (onSelectGoal) {
        onSelectGoal(goalId);
      }
    } else {
      console.warn('GoalsMainInterface: 未找到目标', goalId);
    }
  }, [goals, onSelectGoal]);

  const handleSelectGoalDirectly = useCallback((goal: Goal) => {
    console.log('GoalsMainInterface: 直接选择目标', goal);
    setSelectedGoal(goal);
    if (onSelectGoal) {
      onSelectGoal(goal.id);
    }
  }, [onSelectGoal]);

  useImperativeHandle(ref, () => ({
    selectGoalById: handleSelectGoalById,
    selectGoalDirectly: handleSelectGoalDirectly,
    updateSelectedGoal: (updatedGoal: Goal) => {
      setSelectedGoal(prevSelectedGoal => {
        if (prevSelectedGoal && prevSelectedGoal.id === updatedGoal.id) {
          return updatedGoal;
        }
        return prevSelectedGoal;
      });
    }
  }), [handleSelectGoalById, handleSelectGoalDirectly]);

  const handleBackToList = useCallback(() => {
    setSelectedGoal(null);
  }, []);

  return (
    <div className="w-full">

      {/* 在此区域内切换 GoalsList 和 GoalDetails */}
      <div className="w-full">
        {selectedGoal ? (
          <>
            <GoalHeader 
              selectedGoal={selectedGoal}
              goalCount={goals.length}
              onBackToList={handleBackToList}
              onEditGoal={onEditGoal}
            />
            <div>
              <GoalDetails
                goal={selectedGoal}
                todos={todos.filter(todo => todo.goal_id === selectedGoal.id && !todo.deleted)}
                goals={goals}
                lists={lists}
                onUpdateGoal={onUpdateGoal}
                onUpdateTodo={onUpdateTodo}
                onDeleteTodo={onDeleteTodo}
                onCreateTodo={onCreateTodo}
                onAssociateTasks={onAssociateTasks}
                onClose={handleBackToList}
              />
            </div>
          </>
        ) : (
          <>
            <div className="w-full px-4 py-3 bg-muted/50 border-b border-border">
              <div className="text-sm font-medium text-foreground mb-1">我的目标</div>
              <GoalViewOptions currentView={goalView} onViewChange={setGoalView} />
            </div>
            <div>
              {goalView === 'active' ? (
                <GoalsList
                  goals={goals.filter((g) => !g.is_archived)}
                  onGoalClick={handleGoalClick}
                  onEditGoal={onEditGoal}
                  onArchiveGoal={onArchiveGoal}
                  onDeleteGoal={onDeleteGoal}
                />
              ) : (
                <ArchivedGoalsList
                  goals={goals.filter((g) => g.is_archived)}
                  onRestoreGoal={(id) => onArchiveGoal(id)}
                  onDeleteGoal={onDeleteGoal}
                  onViewGoal={handleGoalClick}
                />
              )}
              <div className="w-full px-4 py-3 bg-muted/50 border-t border-border mt-auto">
                <div className="text-sm font-medium text-foreground">
                  {goalView === 'active' ? (
                    goals.filter((g) => !g.is_archived).length > 0 ? (
                      <span>{goals.filter((g) => !g.is_archived).length} 项目标</span>
                    ) : (
                      <span>暂无目标</span>
                    )
                  ) : (
                    goals.filter((g) => g.is_archived).length > 0 ? (
                      <span>{goals.filter((g) => g.is_archived).length} 项已存档目标</span>
                    ) : (
                      <span>暂无已存档目标</span>
                    )
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

GoalsMainInterface.displayName = 'GoalsMainInterface';

export default GoalsMainInterface;