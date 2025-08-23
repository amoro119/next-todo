'use client';

import React, { useState, useMemo } from 'react';
import { Goal } from '@/lib/types';

interface ArchivedGoalsListProps {
  goals: Goal[];
  onRestoreGoal: (goalId: string) => void;
  onDeleteGoal: (goalId: string) => void;
  onViewGoal: (goal: Goal) => void;
  loading?: boolean;
}

type SortOption = 'archivedDate' | 'name' | 'progress' | 'priority';

const ArchivedGoalsList: React.FC<ArchivedGoalsListProps> = ({
  goals,
  onRestoreGoal,
  onDeleteGoal,
  onViewGoal,
  loading = false
}) => {
  const [sortBy, setSortBy] = useState<SortOption>('archivedDate');
  const [searchTerm, setSearchTerm] = useState('');

  // 过滤和排序目标
  const filteredAndSortedGoals = useMemo(() => {
    let filtered = goals.filter(goal => 
      goal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (goal.description && goal.description.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'archivedDate':
          // 按存档时间降序（最近存档的在前）
          return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
        
        case 'name':
          return a.name.localeCompare(b.name);
        
        case 'progress':
          return (b.progress || 0) - (a.progress || 0);
        
        case 'priority':
          if (a.priority !== b.priority) {
            return b.priority - a.priority;
          }
          return new Date(b.created_time).getTime() - new Date(a.created_time).getTime();
        
        default:
          return 0;
      }
    });
  }, [goals, sortBy, searchTerm]);

  const handleRestoreGoal = (goalId: string, goalName: string) => {
    if (window.confirm(`确定要恢复目标"${goalName}"吗？恢复后将重新出现在目标列表中。`)) {
      onRestoreGoal(goalId);
    }
  };

  const handleDeleteGoal = (goalId: string, goalName: string) => {
    if (window.confirm(`确定要永久删除目标"${goalName}"吗？此操作无法撤销。`)) {
      onDeleteGoal(goalId);
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'bg-green-500';
    if (progress >= 75) return 'bg-blue-500';
    if (progress >= 50) return 'bg-yellow-500';
    if (progress >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="bg-gray-50 rounded-lg border p-6 animate-pulse">
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
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="搜索已存档的目标..."
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[200px]"
          />
          
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="archivedDate">按存档时间排序</option>
            <option value="name">按名称排序</option>
            <option value="progress">按进度排序</option>
            <option value="priority">按优先级排序</option>
          </select>
        </div>

        <div className="text-sm text-gray-500">
          共 {filteredAndSortedGoals.length} 个已存档目标
        </div>
      </div>

      {/* 目标列表 */}
      {filteredAndSortedGoals.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">📦</div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {searchTerm ? '未找到匹配的目标' : '暂无已存档目标'}
          </h3>
          <p className="text-gray-500">
            {searchTerm 
              ? '尝试使用不同的搜索词' 
              : '存档的目标将出现在这里，您可以随时恢复它们'
            }
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredAndSortedGoals.map((goal) => (
            <ArchivedGoalCard
              key={goal.id}
              goal={goal}
              onViewGoal={onViewGoal}
              onRestoreGoal={handleRestoreGoal}
              onDeleteGoal={handleDeleteGoal}
              formatDate={formatDate}
              getProgressColor={getProgressColor}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface ArchivedGoalCardProps {
  goal: Goal;
  onViewGoal: (goal: Goal) => void;
  onRestoreGoal: (goalId: string, goalName: string) => void;
  onDeleteGoal: (goalId: string, goalName: string) => void;
  formatDate: (dateString: string) => string;
  getProgressColor: (progress: number) => string;
}

const ArchivedGoalCard: React.FC<ArchivedGoalCardProps> = React.memo(({
  goal,
  onViewGoal,
  onRestoreGoal,
  onDeleteGoal,
  formatDate,
  getProgressColor
}) => {
  const progress = goal.progress || 0;
  const totalTasks = goal.total_tasks || 0;
  const completedTasks = goal.completed_tasks || 0;

  const handleCardClick = (e: React.MouseEvent) => {
    // 如果点击的是按钮，不触发卡片点击
    if ((e.target as HTMLElement).closest('button')) {
      return;
    }
    onViewGoal(goal);
  };

  const handleRestoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onRestoreGoal(goal.id, goal.name);
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteGoal(goal.id, goal.name);
  };

  return (
    <div
      className="bg-gray-50 rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer p-6 opacity-75 hover:opacity-100"
      onClick={handleCardClick}
    >
      {/* 存档标识 */}
      <div className="flex items-center justify-between mb-3">
        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-700">
          📦 已存档
        </span>
        <div className="flex gap-1">
          <button
            onClick={handleRestoreClick}
            className="p-1 text-gray-400 hover:text-green-600 transition-colors"
            title="恢复目标"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
          <button
            onClick={handleDeleteClick}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="永久删除"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* 目标标题 */}
      <h3 className="font-semibold text-lg text-gray-700 line-clamp-2 mb-2">
        {goal.name}
      </h3>

      {/* 描述 */}
      {goal.description && (
        <p className="text-gray-500 text-sm mb-4 line-clamp-2">
          {goal.description}
        </p>
      )}

      {/* 进度条 */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-600">
            进度
          </span>
          <span className="text-sm font-semibold text-gray-700">
            {progress}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(progress)} opacity-75`}
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
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
              优先级 {goal.priority}
            </span>
          )}
          {goal.list_name && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {goal.list_name}
            </span>
          )}
        </div>
        
        <span className="text-xs text-gray-500">
          存档于 {formatDate(goal.created_time)}
        </span>
      </div>
    </div>
  );
});

ArchivedGoalCard.displayName = 'ArchivedGoalCard';

export default ArchivedGoalsList;