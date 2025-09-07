'use client';

import React, { useMemo } from 'react';
import { Goal } from '@/lib/types';

interface GoalHeaderProps {
  selectedGoal: Goal | null;
  goalCount: number;
  onBackToList: () => void;
  onEditGoal?: (goal: Goal) => void; // 添加编辑目标的回调
}

const GoalHeader: React.FC<GoalHeaderProps> = ({
  selectedGoal,
  onBackToList,
  onEditGoal
}) => {
  // 计算截止日期状态
  const dueDateStatus = useMemo(() => {
    if (!selectedGoal?.due_date) return null;
    
    const date = new Date(selectedGoal.due_date);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: `逾期${Math.abs(diffDays)}天`, color: 'text-red-600' };
    if (diffDays === 0) return { text: '今天到期', color: 'text-orange-600' };
    if (diffDays <= 3) return { text: `${diffDays}天后到期`, color: 'text-orange-600' };
    return { text: `${diffDays}天后到期`, color: 'text-gray-600' };
  }, [selectedGoal?.due_date]);

  // 在目标列表页面时显示
  if (!selectedGoal) {
    return (
      <div className="bar-message">
        <div className="bar-message-text">我的目标</div>
      </div>
    );
  }

  // 在目标详情页面时显示
  return (
    <div className="bar-message">
      <div className="flex items-center w-full">
            <button
              onClick={onBackToList}
              className="p-1 text-gray-500 hover:text-gray-700 transition-colors ml-1"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          <div 
            className="goal-bar-message-text truncate cursor-pointer transition-colors"
            onClick={() => selectedGoal && onEditGoal && onEditGoal(selectedGoal)}
          >
            {selectedGoal.name}
        </div>
        <div className="flex items-center gap-2">
          {selectedGoal.priority > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 whitespace-nowrap mr-1">
              优先级 {selectedGoal.priority}
            </span>
          )}
          {dueDateStatus && (
            <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 whitespace-nowrap mr-5 ${dueDateStatus.color}`}>
              {dueDateStatus.text}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default GoalHeader;