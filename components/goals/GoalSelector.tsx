'use client';

import React, { useState, useMemo } from 'react';
import { Goal } from '@/lib/types';

interface GoalSelectorProps {
  goals: Goal[];
  selectedGoalId?: string | null;
  onGoalSelect: (goalId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  showCreateOption?: boolean;
  onCreateGoal?: () => void;
  className?: string;
}

const GoalSelector: React.FC<GoalSelectorProps> = ({
  goals,
  selectedGoalId,
  onGoalSelect,
  placeholder = '选择目标',
  disabled = false,
  showCreateOption = false,
  onCreateGoal,
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 过滤和排序目标
  const filteredGoals = useMemo(() => {
    let filtered = goals.filter(goal => 
      !goal.is_archived && // 不显示已存档的目标
      (goal.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
       (goal.description && goal.description.toLowerCase().includes(searchTerm.toLowerCase())))
    );

    // 按优先级和创建时间排序
    return filtered.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority; // 优先级降序
      }
      return new Date(b.created_time).getTime() - new Date(a.created_time).getTime(); // 创建时间降序
    });
  }, [goals, searchTerm]);

  const selectedGoal = goals.find(goal => goal.id === selectedGoalId);

  const handleGoalSelect = (goalId: string | null) => {
    onGoalSelect(goalId);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleCreateGoal = () => {
    if (onCreateGoal) {
      onCreateGoal();
      setIsOpen(false);
      setSearchTerm('');
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'text-green-600';
    if (progress >= 75) return 'text-blue-600';
    if (progress >= 50) return 'text-yellow-600';
    if (progress >= 25) return 'text-orange-600';
    return 'text-red-600';
  };

  const formatProgress = (goal: Goal) => {
    const progress = goal.progress || 0;
    const totalTasks = goal.total_tasks || 0;
    const completedTasks = goal.completed_tasks || 0;
    
    return {
      progress,
      text: totalTasks > 0 ? `${completedTasks}/${totalTasks}` : '0/0',
      color: getProgressColor(progress)
    };
  };

  return (
    <div className={`relative ${className}`}>
      {/* 选择器按钮 */}
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`
          w-full px-3 py-2 text-left bg-white border border-gray-300 rounded-md shadow-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'hover:border-gray-400 cursor-pointer'}
          ${isOpen ? 'ring-2 ring-blue-500 border-blue-500' : ''}
        `}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {selectedGoal ? (
              <>
                <span className="text-sm">🎯</span>
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-gray-900 truncate">
                    {selectedGoal.name}
                  </div>
                  {selectedGoal.description && (
                    <div className="text-xs text-gray-500 truncate">
                      {selectedGoal.description}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs">
                  <span className={formatProgress(selectedGoal).color}>
                    {formatProgress(selectedGoal).progress}%
                  </span>
                  <span className="text-gray-400">
                    ({formatProgress(selectedGoal).text})
                  </span>
                </div>
              </>
            ) : (
              <span className="text-gray-500">{placeholder}</span>
            )}
          </div>
          
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* 下拉菜单 */}
      {isOpen && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-hidden">
          {/* 搜索框 */}
          <div className="p-2 border-b">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索目标..."
              className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* 选项列表 */}
          <div className="max-h-48 overflow-y-auto">
            {/* 无目标选项 */}
            <button
              type="button"
              onClick={() => handleGoalSelect(null)}
              className={`
                w-full px-3 py-2 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50
                ${selectedGoalId === null ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
              `}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">📋</span>
                <span className="font-medium">无关联目标</span>
              </div>
            </button>

            {/* 目标选项 */}
            {filteredGoals.map((goal) => {
              const progressInfo = formatProgress(goal);
              const isSelected = selectedGoalId === goal.id;
              
              return (
                <button
                  key={goal.id}
                  type="button"
                  onClick={() => handleGoalSelect(goal.id)}
                  className={`
                    w-full px-3 py-2 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50
                    ${isSelected ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="text-sm">🎯</span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">
                          {goal.name}
                        </div>
                        {goal.description && (
                          <div className="text-xs text-gray-500 truncate">
                            {goal.description}
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          {goal.priority > 0 && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              P{goal.priority}
                            </span>
                          )}
                          {goal.list_name && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                              {goal.list_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 text-xs ml-2">
                      <span className={progressInfo.color}>
                        {progressInfo.progress}%
                      </span>
                      <span className="text-gray-400">
                        ({progressInfo.text})
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* 创建新目标选项 */}
            {showCreateOption && onCreateGoal && (
              <button
                type="button"
                onClick={handleCreateGoal}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50 text-blue-600 border-t"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm">➕</span>
                  <span className="font-medium">创建新目标</span>
                </div>
              </button>
            )}

            {/* 空状态 */}
            {filteredGoals.length === 0 && searchTerm && (
              <div className="px-3 py-4 text-center text-gray-500">
                <div className="text-sm">未找到匹配的目标</div>
                {showCreateOption && onCreateGoal && (
                  <button
                    type="button"
                    onClick={handleCreateGoal}
                    className="mt-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
                  >
                    创建新目标 "{searchTerm}"
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 点击外部关闭 */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setIsOpen(false)}
        />
      )}
    </div>
  );
};

export default GoalSelector;