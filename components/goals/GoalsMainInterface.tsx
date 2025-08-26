// components/goals/GoalsMainInterface.tsx
import { useState, useCallback } from 'react';
import { Goal, Todo } from '@/lib/types';
import GoalsList from './GoalsList';
import GoalDetails from './GoalDetails';

interface GoalsMainInterfaceProps {
  goals: Goal[];
  todos: Todo[];
  lists: List[];
  onUpdateGoal: (goal: Goal) => void;
  onUpdateTodo: (todo: Todo) => void;
  onDeleteTodo: (todoId: string) => void;
  onCreateTodo: (todo: Omit<Todo, 'id' | 'created_time'>) => void;
  onEditGoal: (goal: Goal) => void;
  onArchiveGoal: (goalId: string) => void;
}

export default function GoalsMainInterface({
  goals,
  todos,
  lists,
  onUpdateGoal,
  onUpdateTodo,
  onDeleteTodo,
  onCreateTodo,
  onEditGoal,
  onArchiveGoal
}: GoalsMainInterfaceProps) {
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);

  const handleGoalClick = useCallback((goal: Goal) => {
    setSelectedGoal(goal);
  }, []);

  const handleBackToList = useCallback(() => {
    setSelectedGoal(null);
  }, []);

  return (
    <div className="goals-main-interface goals-container mode-transition">

      {/* 在此区域内切换 GoalsList 和 GoalDetails */}
      <div className="goals-list-container">
        <div className="bar-message">
          {/* <button className="btn-small completed-all btn-allFinish">全部标为完成</button> */}
          <div className="bar-message-text">我的目标</div>
        </div>
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
}