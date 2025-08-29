// components/goals/GoalsMainInterface.tsx
import { useState, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Goal, Todo } from '@/lib/types';
import GoalsList from './GoalsList';
import GoalDetails from './GoalDetails';
import GoalHeader from './GoalHeader';

interface GoalsMainInterfaceProps {
  goals: Goal[];
  todos: Todo[];
  lists: List[];
  onUpdateGoal: (goal: Goal) => void;
  onUpdateTodo: (todo: Todo) => void;
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
    <div className="goals-main-interface goals-container mode-transition">

      {/* 在此区域内切换 GoalsList 和 GoalDetails */}
      <div className="goals-list-container">
        <GoalHeader 
          selectedGoal={selectedGoal}
          goalCount={goals.length}
          onBackToList={handleBackToList}
          onEditGoal={onEditGoal}
        />
        {selectedGoal ? (
          <div className="view-transition">
            <GoalDetails
              goal={selectedGoal}
              todos={todos.filter(todo => todo.goal_id === selectedGoal.id)}
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
        ) : (
          <div className="view-transition">
            <GoalsList 
              goals={goals}
              onGoalClick={handleGoalClick}
              onEditGoal={onEditGoal}
              onArchiveGoal={onArchiveGoal}
              onDeleteGoal={onDeleteGoal}
            />
            <div className="bar-message bar-bottom">
              <div className="bar-message-text">
                {goals.length > 0 ? (
                  <span>{goals.length} 项目标</span>
                ) : (
                  <span>暂无目标</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

GoalsMainInterface.displayName = 'GoalsMainInterface';

export default GoalsMainInterface;