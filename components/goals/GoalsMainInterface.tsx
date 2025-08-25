// components/goals/GoalsMainInterface.tsx
import { useState, useCallback } from 'react';
import { Goal, Todo } from '@/lib/types';
import GoalsList from './GoalsList';
import GoalDetails from './GoalDetails';

interface GoalsMainInterfaceProps {
  goals: Goal[];
  todos: Todo[];
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
      <div className="bar-message">
          {/* <button className="btn-small completed-all btn-allFinish">全部标为完成</button> */}
          <div className="bar-message-text">目标列表</div>
      </div>

      {/* 在此区域内切换 GoalsList 和 GoalDetails */}
      <div className="goals-list-container todo-list-container">
        {selectedGoal ? (
          <div className="view-transition">
            <GoalDetails
              goal={selectedGoal}
              todos={todos.filter(todo => todo.goal_id === selectedGoal.id)}
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

      <style jsx>{`
        .goals-actions {
          display: flex;
          gap: 2rem;
          margin-bottom: 2rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .goals-action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          border: var(--border);
          border-radius: var(--border-radius);
          background: var(--bg-normal);
          color: var(--font-color);
          font-family: var(--font);
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.35s ease;
          min-width: 160px;
          box-shadow: var(--box-shadow);
          position: relative;
          overflow: hidden;
        }

        .goals-action-btn:hover {
          transform: translateY(-4px);
          box-shadow: 6px 6px 0px var(--black);
        }

        .goals-action-btn:active {
          transform: translateY(-2px);
          box-shadow: 3px 3px 0px var(--black);
        }

        .goals-action-btn::after {
          content: "";
          position: absolute;
          top: 50%;
          left: 50%;
          width: 0;
          height: 0;
          background: rgba(255, 255, 255, 0.3);
          border-radius: 50%;
          transform: translate(-50%, -50%);
          transition: width 0.3s, height 0.3s;
        }

        .goals-action-btn:active::after {
          width: 300px;
          height: 300px;
        }

        .goals-action-btn.primary {
          background: var(--bg-submit);
        }

        .goals-action-btn.primary:hover {
          background: var(--bg-edit);
          box-shadow: var(--box-shadow);
          transform: translate(-2px, -2px);
        }

        .goals-action-btn.secondary {
          background: var(--bg-completed);
        }

        .goals-action-btn.secondary:hover {
          background: var(--completed);
          box-shadow: var(--box-shadow);
          transform: translate(-2px, -2px);
        }

        .btn-icon {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }

        .btn-text {
          font-size: 1.1rem;
        }

        .goals-list-container {
          width: 100%;
          margin-top: 1rem;
        }

        /* 添加过渡动画样式 */
        .view-transition {
          animation: fadeIn 0.3s ease-in-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 768px) {
          .goals-main-interface {
            padding: 1rem;
            min-height: 50vh;
          }

          .goals-actions {
            flex-direction: column;
            gap: 1rem;
            width: 100%;
            max-width: 300px;
          }

          .goals-action-btn {
            width: 100%;
            padding: 1.5rem 1rem;
          }
        }

        @media (max-width: 480px) {
          .goals-main-interface {
            padding: 0.5rem;
          }
          
          .goals-actions {
            gap: 0.5rem;
          }
          
          .goals-action-btn {
            padding: 1rem 0.5rem;
            min-width: 120px;
          }
        }

        @keyframes modeTransition {
          0% {
            opacity: 0;
            transform: scale(0.95);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes goalItemFadeIn {
          0% {
            opacity: 0;
            transform: translateY(20px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}