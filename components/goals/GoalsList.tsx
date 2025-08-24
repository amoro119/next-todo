'use client';

import React, { useMemo } from 'react';
import { Goal } from '@/lib/types';

interface GoalsListProps {
  goals: Goal[];
  onGoalClick: (goal: Goal) => void;
  loading?: boolean;
}

// control bar (sorting/filtering) removed — keep display simple

const GoalsList: React.FC<GoalsListProps> = ({
  goals,
  onGoalClick,
  loading = false
}) => {
  // removed sort/filter state

  // 默认在前端按 优先级 降序排序，优先级相同按创建时间倒序
  const filteredAndSortedGoals = useMemo(() => {
    if (!Array.isArray(goals)) return [];
    return [...goals].sort((a, b) => {
      const pa = a.priority || 0;
      const pb = b.priority || 0;
      if (pa !== pb) return pb - pa; // 优先级降序

      // 优先级相同：按创建时间倒序
      const ta = a.created_time ? new Date(a.created_time).getTime() : 0;
      const tb = b.created_time ? new Date(b.created_time).getTime() : 0;
      return tb - ta;
    });
  }, [goals]);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '明天';
    if (diffDays === -1) return '昨天';
    if (diffDays > 0) return `${diffDays}天后`;
    return `逾期${Math.abs(diffDays)}天`;
  };

  

  const getDueDateColor = (dueDate?: string, progress?: number) => {
    if (!dueDate || progress === 100) return 'var(--placeholder)';
    
    const date = new Date(dueDate);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'var(--deleted)'; // 逾期
    if (diffDays <= 3) return '#f59e0b'; // 即将到期
    return 'var(--font-color)';
  };

    if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="goal-skeleton p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded mb-3"></div>
            <div className="h-4 bg-gray-200 rounded mb-4 w-3/4"></div>
            <div className="h-2 bg-gray-200 rounded mb-2"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 目标列表 */}
      {filteredAndSortedGoals.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg mb-2">📋</div>
          <p className="text-gray-500">暂无目标</p>
        </div>
      ) : (
        <div className="todo-list-container">
          <ul className="todo-list">
            {filteredAndSortedGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onGoalClick={onGoalClick}
                formatDate={formatDate}
                getDueDateColor={getDueDateColor}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

interface GoalCardProps {
  goal: Goal;
  onGoalClick: (goal: Goal) => void;
  formatDate: (dateString: string) => string;
  getDueDateColor: (dueDate?: string, progress?: number) => string;
}

const GoalCard: React.FC<GoalCardProps> = React.memo(({
  goal,
  onGoalClick,
  formatDate,
  getDueDateColor
}) => {
  const progress = goal.progress || 0;
  const totalTasks = goal.total_tasks || 0;
  const completedTasks = goal.completed_tasks || 0;

  const handleCardClick = (e: React.MouseEvent) => {
    // 如果点击的是按钮，不触发卡片点击
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    onGoalClick(goal);
  };

  // 编辑与存档操作已移除; 点击卡片将打开目标详情

  return (
    <li
      className={`todo-item goal-item`}
      onClick={handleCardClick}
    >
      {/* 头部 */}
      <div className={`goal-content ${progress === 100 ? 'completed' : ''}`}>
        <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-lg text-gray-900 line-clamp-2 flex-1">
          {goal.name}
        </h3>
  {/* 操作按钮已移除；整体点击卡片打开目标详情 */}
      </div>

        {/* 描述 */}
        {goal.description && (
          <p className="text-gray-600 text-sm mb-4 line-clamp-2">
            {goal.description}
          </p>
        )}

      {/* 进度条 */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">
            进度
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {progress}%
          </span>
        </div>
        <div className="progress-track w-full rounded-full h-2">
          <div
            className="progress-fill"
            style={{ ['--progress']: `${progress}%`,
              background: progress === 100 ? 'var(--completed)' : 
                         progress >= 75 ? 'var(--normal)' : 
                         progress >= 50 ? '#f5d99e' : 
                         progress >= 25 ? '#f8d966' : 'var(--deleted)'
            } as unknown as React.CSSProperties}
          />
        </div>
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-gray-500">
            {completedTasks}/{totalTasks} 任务
          </span>
          {progress === 100 && (
            <span className="text-xs text-green-600 font-medium">
              ✓ 已完成
            </span>
          )}
        </div>
      </div>

        {/* 底部信息 */}
        <div className="flex justify-between items-center text-sm">
          <div className="flex items-center gap-2">
          {goal.priority > 0 && (
            <span className="pill pill-priority">
              优先级 {goal.priority}
            </span>
          )}
          {goal.list_name && (
            <span className="pill pill-list">
              {goal.list_name}
            </span>
          )}
        </div>
        
          {goal.due_date && (
            <span 
              className="text-xs font-medium"
              style={{ color: getDueDateColor(goal.due_date, progress) }}
            >
              {formatDate(goal.due_date)}
            </span>
          )}
        </div>
      </div>
    </li>
  );
});

GoalCard.displayName = 'GoalCard';

export default GoalsList;