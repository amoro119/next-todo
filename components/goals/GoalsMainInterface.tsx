// components/goals/GoalsMainInterface.tsx
import { useCallback } from 'react';

interface GoalsMainInterfaceProps {
  onCreateGoal: () => void;
  onViewGoalsList: () => void;
}

export default function GoalsMainInterface({
  onCreateGoal,
  onViewGoalsList
}: GoalsMainInterfaceProps) {
  
  const handleCreateGoal = useCallback(() => {
    onCreateGoal();
  }, [onCreateGoal]);

  const handleViewGoalsList = useCallback(() => {
    onViewGoalsList();
  }, [onViewGoalsList]);

  return (
    <div className="goals-main-interface">
      <div className="goals-welcome">
        <h2 className="goals-title">目标管理</h2>
        <p className="goals-subtitle">将大目标分解为可执行的任务，跟踪进度并实现成功</p>
      </div>
      
      <div className="goals-actions">
        <button 
          className="goals-action-btn primary"
          onClick={handleCreateGoal}
          data-testid="create-goal-button"
        >
          <span className="btn-icon">➕</span>
          <span className="btn-text">新建目标</span>
        </button>
        
        <button 
          className="goals-action-btn secondary"
          onClick={handleViewGoalsList}
          data-testid="view-goals-list-button"
        >
          <span className="btn-icon">📋</span>
          <span className="btn-text">目标列表</span>
        </button>
      </div>

      <div className="goals-tips">
        <div className="tip-item">
          <span className="tip-icon">💡</span>
          <span className="tip-text">创建目标时可以关联现有任务或添加新任务</span>
        </div>
        <div className="tip-item">
          <span className="tip-icon">📊</span>
          <span className="tip-text">通过进度条直观地跟踪目标完成情况</span>
        </div>
        <div className="tip-item">
          <span className="tip-icon">🎯</span>
          <span className="tip-text">设置优先级和截止日期来更好地管理目标</span>
        </div>
      </div>

      <style jsx>{`
        .goals-main-interface {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          min-height: 60vh;
          padding: 2rem;
          text-align: center;
        }

        .goals-welcome {
          margin-bottom: 3rem;
        }

        .goals-title {
          font-size: 2.5rem;
          font-weight: 700;
          color: var(--font-color);
          margin-bottom: 1rem;
          text-shadow: 2px 2px 0px rgba(51, 50, 46, 0.1);
        }

        .goals-subtitle {
          font-size: 1.1rem;
          color: var(--placeholder);
          max-width: 500px;
          line-height: 1.6;
        }

        .goals-actions {
          display: flex;
          gap: 2rem;
          margin-bottom: 3rem;
          flex-wrap: wrap;
          justify-content: center;
        }

        .goals-action-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.5rem;
          padding: 2rem 1.5rem;
          border: var(--border);
          border-radius: var(--border-radius);
          background: var(--bg-normal);
          color: var(--font-color);
          font-family: var(--font);
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s ease;
          min-width: 160px;
          box-shadow: var(--box-shadow);
        }

        .goals-action-btn:hover {
          transform: translateY(-4px);
          box-shadow: 6px 6px 0px var(--black);
        }

        .goals-action-btn:active {
          transform: translateY(-2px);
          box-shadow: 3px 3px 0px var(--black);
        }

        .goals-action-btn.primary {
          background: var(--bg-submit);
        }

        .goals-action-btn.primary:hover {
          background: var(--bg-edit);
        }

        .goals-action-btn.secondary {
          background: var(--bg-completed);
        }

        .goals-action-btn.secondary:hover {
          background: var(--completed);
        }

        .btn-icon {
          font-size: 2rem;
          margin-bottom: 0.5rem;
        }

        .btn-text {
          font-size: 1.1rem;
        }

        .goals-tips {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          max-width: 600px;
          opacity: 0.8;
        }

        .tip-item {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 1rem;
          background: rgba(255, 255, 255, 0.5);
          border-radius: var(--border-radius);
          border: 1px solid rgba(51, 50, 46, 0.1);
        }

        .tip-icon {
          font-size: 1.2rem;
          flex-shrink: 0;
        }

        .tip-text {
          font-size: 0.9rem;
          color: var(--font-color);
          text-align: left;
        }

        @media (max-width: 768px) {
          .goals-main-interface {
            padding: 1rem;
            min-height: 50vh;
          }

          .goals-title {
            font-size: 2rem;
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

          .goals-tips {
            margin-top: 2rem;
          }

          .tip-item {
            flex-direction: column;
            text-align: center;
            gap: 0.5rem;
          }

          .tip-text {
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}