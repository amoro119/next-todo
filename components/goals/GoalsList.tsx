'use client';

import React, { useState, useMemo } from 'react';
import { Goal } from '@/lib/types';

interface GoalsListProps {
  goals: Goal[];
  onGoalClick: (goal: Goal) => void;
  onEditGoal: (goal: Goal) => void;
  onArchiveGoal: (goalId: string) => void;
  loading?: boolean;
}

type SortOption = 'priority' | 'progress' | 'dueDate' | 'createdTime';
type FilterOption = 'all' | 'active' | 'completed' | 'overdue';

const GoalsList: React.FC<GoalsListProps> = ({
  goals,
  onGoalClick,
  onEditGoal,
  onArchiveGoal,
  loading = false
}) => {
  const [sortBy, setSortBy] = useState<SortOption>('priority');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');

  // 过滤和排序目标
  const filteredAndSortedGoals = useMemo(() => {
    let filtered = goals.filter(goal => {
      if (filterBy === 'all') return true;
      if (filterBy === 'active') return (goal.progress || 0) < 100;
      if (filterBy === 'completed') return (goal.progress || 0) === 100;
      if (filterBy === 'overdue') {
        if (!goal.due_date) return false;
        return new Date(goal.due_date) < new Date() && (goal.progress || 0) < 100;
      }
      return true;
    });

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'priority':
          // 优先级降序，然后按创建时间降序
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
        
        case 'progress':
          return (b.progress || 0) - (a.progress || 0);
        
        case 'dueDate':
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1;
          if (!b.due_date) return -1;
          return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
        
        case 'createdTime':
          return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
        
        default:
          return 0;
      }
    });
  }, [goals, sortBy, filterBy]);

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

  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'bg-green-500';
    if (progress >= 75) return 'bg-blue-500';
    if (progress >= 50) return 'bg-yellow-500';
    if (progress >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getDueDateColor = (dueDate?: string, progress?: number) => {
    if (!dueDate || progress === 100) return 'text-gray-500';
    
    const date = new Date(dueDate);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'text-red-600'; // 逾期
    if (diffDays <= 3) return 'text-orange-600'; // 即将到期
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow-sm border p-6 animate-pulse">
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
      {/* 控制栏 */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
        <div className="flex flex-wrap gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="priority">按优先级排序</option>
            <option value="progress">按进度排序</option>
            <option value="dueDate">按截止日期排序</option>
            <option value="createdTime">按创建时间排序</option>
          </select>

          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as FilterOption)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">全部目标</option>
            <option value="active">进行中</option>
            <option value="completed">已完成</option>
            <option value="overdue">已逾期</option>
          </select>
        </div>

        <div className="text-sm text-gray-500">
          共 {filteredAndSortedGoals.length} 个目标
        </div>
      </div>

      {/* 目标列表 */}
      {filteredAndSortedGoals.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-lg mb-2">📋</div>
          <p className="text-gray-500">
            {filterBy === 'all' ? '暂无目标' : '没有符合条件的目标'}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedGoals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onGoalClick={onGoalClick}
              onEditGoal={onEditGoal}
              onArchiveGoal={onArchiveGoal}
              formatDate={formatDate}
              getProgressColor={getProgressColor}
              getDueDateColor={getDueDateColor}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface GoalCardProps {
  goal: Goal;
  onGoalClick: (goal: Goal) => void;
  onEditGoal: (goal: Goal) => void;
  onArchiveGoal: (goalId: string) => void;
  formatDate: (dateString: string) => string;
  getProgressColor: (progress: number) => string;
  getDueDateColor: (dueDate?: string, progress?: number) => string;
}

const GoalCard: React.FC<GoalCardProps> = React.memo(({
  goal,
  onGoalClick,
  onEditGoal,
  onArchiveGoal,
  formatDate,
  getProgressColor,
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

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEditGoal(goal);
  };

  const handleArchiveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('确定要存档这个目标吗？')) {
      onArchiveGoal(goal.id);
    }
  };

  return (
    <div
      className="bg-white rounded-lg shadow-sm border hover:shadow-md transition-shadow cursor-pointer p-6"
      onClick={handleCardClick}
    >
      {/* 头部 */}
      <div className="flex justify-between items-start mb-3">
        <h3 className="font-semibold text-lg text-gray-900 line-clamp-2 flex-1">
          {goal.name}
        </h3>
        <div className="flex gap-1 ml-2">
          <button
            onClick={handleEditClick}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="编辑目标"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={handleArchiveClick}
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="存档目标"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8l4 4 4-4m6 5l-3 3-3-3" />
            </svg>
          </button>
        </div>
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
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(progress)}`}
            style={{ width: `${progress}%` }}
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
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
              优先级 {goal.priority}
            </span>
          )}
          {goal.list_name && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
              {goal.list_name}
            </span>
          )}
        </div>
        
        {goal.due_date && (
          <span className={`text-xs font-medium ${getDueDateColor(goal.due_date, progress)}`}>
            {formatDate(goal.due_date)}
          </span>
        )}
      </div>
    </div>
  );
});

GoalCard.displayName = 'GoalCard';

export default GoalsList;