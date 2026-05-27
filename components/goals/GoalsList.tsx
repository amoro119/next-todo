'use client';

import React, { useMemo } from 'react';
import { Goal } from '@/lib/types';
import Image from "next/image";

interface GoalsListProps {
  goals: Goal[];
  onGoalClick: (goal: Goal) => void;
  onEditGoal: (goal: Goal) => void;
  onArchiveGoal: (goalId: string) => void;
  onDeleteGoal: (goalId: string) => void;
  loading?: boolean;
}

// control bar (sorting/filtering) removed — keep display simple

const GoalsList: React.FC<GoalsListProps> = ({
  goals,
  onGoalClick,
  onEditGoal,
  onArchiveGoal,
  onDeleteGoal,
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
    if (diffDays <= 3) return 'oklch(var(--warning, 0.75 0.15 85))'; // 即将到期
    return 'var(--font-color)';
  };

    if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="p-6 animate-pulse rounded-lg border border-border bg-background">
            <div className="h-6 bg-muted rounded mb-3"></div>
            <div className="h-4 bg-muted rounded mb-4 w-3/4"></div>
            <div className="h-2 bg-muted rounded mb-2"></div>
            <div className="h-4 bg-muted rounded w-1/4"></div>
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
          <div className="text-muted-foreground text-lg mb-2">📋</div>
          <p className="text-muted-foreground">暂无目标</p>
        </div>
      ) : (
        <div className="w-full">
          <ul className="space-y-3">
            {filteredAndSortedGoals.map((goal) => (
              <GoalCard
                key={goal.id}
                goal={goal}
                onGoalClick={onGoalClick}
                onEditGoal={onEditGoal}
                onArchiveGoal={onArchiveGoal}
                onDeleteGoal={onDeleteGoal}
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
  onEditGoal: (goal: Goal) => void;
  onArchiveGoal: (goalId: string) => void;
  onDeleteGoal: (goalId: string) => void;
  formatDate: (dateString: string) => string;
  getDueDateColor: (dueDate?: string, progress?: number) => string;
}

const GoalCard: React.FC<GoalCardProps> = React.memo(({
  goal,
  onGoalClick,
  onEditGoal,
  onArchiveGoal,
  onDeleteGoal,
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

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDeleteGoal(goal.id);
  };

  return (
    <li
      className={`flex items-start gap-3 p-4 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors duration-150 cursor-pointer`}
    >
      {/* 头部 */}
      <div className={`flex-1 ${progress === 100 ? 'opacity-75' : ''}`} onClick={handleCardClick}>
        <div className="flex justify-between items-start mb-3">
          <h3 className="text-base font-medium text-foreground line-clamp-2 flex-1">
          {goal.list_name && (
            <span className="text-accent-foreground font-bold mr-1">
              [{goal.list_name}]
            </span>
          )}
          {goal.name}
        </h3>
        <button 
          className="p-1.5 rounded-md hover:bg-muted transition-colors duration-150 text-muted-foreground shrink-0"
          onClick={handleDeleteClick}
          aria-label="删除目标"
        >
          <Image
            src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAxOCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xNS4wOTkzIDE3Ljc1OTdDMTUuNzk0OSAxOC4yMDk4IDE2LjcyMzUgMTguMDEwOCAxNy4xNzM2IDE3LjMxNTJDMTcuNjIzNiAxNi42MTk3IDE3LjQyNDYgMTUuNjkxMSAxNi43MjkxIDE1LjI0MUMxMy4zMDc5IDEzLjAyNzMgMTAuODIwOSAxMC45OTU5IDguOTIyNTEgOS4wMzczOUM5LjA5NzQyIDguODQ5ODIgOS4yNzI5MSA4LjY2NTcxIDkuNDQ4ODggOC40ODUzNEMxMS44ODY0IDUuOTg2OTIgMTQuMjQ3MiA0LjM4MDY2IDE2LjI5NDQgMy45NzEyMkMxNy4xMDY3IDMuODA4NzUgMTcuNjMzNSAzLjAxODUyIDE3LjQ3MTEgMi4yMDYxOEMxNy4zMDg2IDEuMzkzODQgMTYuNTE4NCAwLjg2NzAxMyAxNS4wNjYgMS4wMjk0OEMxMi4yNTMyIDEuNjIwMDUgOS44NjQwNiAzLjc2Mzc5IDcuMzAxNTQgNi4zOTA0N0M3LjE4MTUxIDYuNTEzNCA3LjA2MTgxIDYuNjM3ODkgNi45NDI0OSA2Ljc2Mzc1QzUuNDIwMDEgNC44MDQzMyA0LjM3MDU4IDIuODc2MzIgMy40MjU5MSAwLjg2MzE2NEMzLjA3Mzk5IDAuMTEzMjAyIDIuMTgwNzMgLTAuMjA5NDc1IDEuNDMwNzcgMC4xNDI0NDVDMC42ODA4MDkgMC40OTQzNjUgMC4zNTgxMzIgMS4zODc2MiAwLjcxMDA1MSAyLjEzNzU4QzEuODIwODggNC41MDQ4MSAzLjA3ODk5IDYuNzY1MTEgNC45MjkzMiA5LjA1MzA2QzMuMjIyMDYgMTEuMTM0MSAxLjYyNjY5IDEzLjQzMjggMC4yMjI3MjMgMTUuNzE0MkMtMC4yMTE0NTMgMTYuNDE5NyAwLjAwODUyNzUyIDE3LjM0MzcgMC43MTQwNjQgMTcuNzc3OEMxLjQxOTYgMTguMjEyIDIuMzQzNTIgMTcuOTkyIDIuNzc3NyAxNy4yODY1QzQuMDQ4MTkgMTUuMjIyIDUuNDY0MDUgMTMuMTcyNiA2Ljk1NTU5IDExLjMxNjhDOC45ODUgMTMuMzc2NSAxMS41OTU5IDE1LjQ5MjggMTUuMDk5MyAxNy43NTk3WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K"
            alt="删除"
            draggable={false}
            width={18}
            height={18}
          />
        </button>
      </div>

      {/* 进度条 */}
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-muted-foreground">
          进度
        </span>
        <span className="text-sm font-semibold text-foreground">
          {progress}%
        </span>
      </div>
      <div className="h-1.5 bg-muted w-full rounded-full overflow-hidden">
        <div
          className="h-full bg-foreground rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between items-center mt-1">
        <span className="text-xs text-muted-foreground">
          {completedTasks}/{totalTasks} 任务
        </span>
        {progress === 100 && (
          <span className="text-xs text-[oklch(var(--primary))] font-medium">
            ✓ 已完成
          </span>
        )}
      </div>

        {/* 底部信息 */}
        <div className="flex justify-between items-center text-sm mt-2">
          <div className="flex items-center gap-2">
          {goal.priority > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
              优先级 {goal.priority}
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