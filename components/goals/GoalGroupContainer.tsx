'use client';

import React, { useState } from 'react';
import { Goal, Todo } from '@/lib/types';

interface GoalGroup {
  goal: Goal | null; // null 表示未分组的任务
  todos: Todo[];
}

interface GoalGroupContainerProps {
  goalGroups: GoalGroup[];
  onToggleTodo: (todo: Todo) => void;
  onEditTodo: (todo: Todo) => void;
  onDeleteTodo: (todoId: string) => void;
  onViewGoal?: (goal: Goal) => void;
  className?: string;
}

const GoalGroupContainer: React.FC<GoalGroupContainerProps> = ({
  goalGroups,
  onToggleTodo,
  onEditTodo,
  onDeleteTodo,
  onViewGoal,
  className = ''
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const toggleGroupCollapse = (groupId: string) => {
    const newCollapsed = new Set(collapsedGroups);
    if (newCollapsed.has(groupId)) {
      newCollapsed.delete(groupId);
    } else {
      newCollapsed.add(groupId);
    }
    setCollapsedGroups(newCollapsed);
  };

  const getGroupId = (goal: Goal | null) => goal?.id || 'ungrouped';

  const getGroupProgress = (todos: Todo[]) => {
    if (todos.length === 0) return 0;
    const completedCount = todos.filter(todo => todo.completed).length;
    return Math.round((completedCount / todos.length) * 100);
  };

  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'bg-green-500';
    if (progress >= 75) return 'bg-blue-500';
    if (progress >= 50) return 'bg-yellow-500';
    if (progress >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  if (goalGroups.length === 0) {
    return (
      <div className={`text-center py-8 ${className}`}>
        <div className="text-gray-400 text-4xl mb-2">📝</div>
        <p className="text-gray-500">暂无任务</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {goalGroups.map((group) => {
        const groupId = getGroupId(group.goal);
        const isCollapsed = collapsedGroups.has(groupId);
        const progress = getGroupProgress(group.todos);
        const completedCount = group.todos.filter(todo => todo.completed).length;

        return (
          <div key={groupId} className="bg-white rounded-lg border shadow-sm">
            {/* 分组头部 */}
            <div className="flex items-center justify-between p-4 border-b bg-gray-50 rounded-t-lg">
              <div className="flex items-center gap-3 flex-1">
                {/* 折叠/展开按钮 */}
                <button
                  onClick={() => toggleGroupCollapse(groupId)}
                  className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                  title={isCollapsed ? '展开分组' : '折叠分组'}
                >
                  <svg 
                    className={`w-4 h-4 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* 目标信息 */}
                <div className="flex-1 min-w-0">
                  {group.goal ? (
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-gray-900 truncate">
                        🎯 {group.goal.name}
                      </h3>
                      {onViewGoal && (
                        <button
                          onClick={() => onViewGoal(group.goal!)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                          title="查看目标详情"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ) : (
                    <h3 className="font-semibold text-gray-900">
                      📋 未分组任务
                    </h3>
                  )}
                  
                  {group.goal?.description && (
                    <p className="text-sm text-gray-600 truncate mt-1">
                      {group.goal.description}
                    </p>
                  )}
                </div>

                {/* 进度信息 */}
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-sm font-medium text-gray-900">
                      {completedCount}/{group.todos.length}
                    </div>
                    <div className="text-xs text-gray-500">
                      {progress}% 完成
                    </div>
                  </div>
                  
                  {/* 进度条 */}
                  <div className="w-16 bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(progress)}`}
                      style={{ ['--progress']: `${progress}%` } as unknown as React.CSSProperties}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 任务列表 */}
            {!isCollapsed && (
              <div className="p-4">
                {group.todos.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">
                    {group.goal ? '此目标暂无关联任务' : '暂无未分组任务'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {group.todos.map((todo) => (
                      <TodoItem
                        key={todo.id}
                        todo={todo}
                        onToggle={onToggleTodo}
                        onEdit={onEditTodo}
                        onDelete={onDeleteTodo}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

interface TodoItemProps {
  todo: Todo;
  onToggle: (todo: Todo) => void;
  onEdit: (todo: Todo) => void;
  onDelete: (todoId: string) => void;
}

const TodoItem: React.FC<TodoItemProps> = React.memo(({
  todo,
  onToggle,
  onEdit,
  onDelete
}) => {
  const handleToggle = () => {
    onToggle(todo);
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    onEdit(todo);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('确定要删除这个任务吗？')) {
      onDelete(todo.id);
    }
  };

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

  const getDueDateColor = (dueDate: string) => {
    const date = new Date(dueDate);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'text-red-600'; // 逾期
    if (diffDays <= 3) return 'text-orange-600'; // 即将到期
    return 'text-gray-600';
  };

  return (
    <div
      className={`
        flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer
        ${todo.completed 
          ? 'bg-gray-50 border-gray-200' 
          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
        }
      `}
      onClick={handleToggle}
    >
      {/* 完成状态按钮 */}
      <button
        onClick={handleToggle}
        className={`
          w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors
          ${todo.completed 
            ? 'bg-green-500 border-green-500 text-white' 
            : 'border-gray-300 hover:border-green-500'
          }
        `}
      >
        {todo.completed && (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* 任务内容 */}
      <div className="flex-1 min-w-0">
        <div className={`font-medium ${todo.completed ? 'line-through text-gray-500' : 'text-gray-900'}`}>
          {todo.title}
        </div>
        {todo.content && (
          <div className={`text-sm mt-1 ${todo.completed ? 'text-gray-400' : 'text-gray-600'}`}>
            {todo.content}
          </div>
        )}
        <div className="flex items-center gap-2 mt-1">
          {todo.priority > 0 && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
              P{todo.priority}
            </span>
          )}
          {todo.due_date && (
            <span className={`text-xs font-medium ${getDueDateColor(todo.due_date)}`}>
              {formatDate(todo.due_date)}
            </span>
          )}
          {todo.list_name && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
              {todo.list_name}
            </span>
          )}
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-1">
        <button
          onClick={handleEdit}
          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
          title="编辑任务"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button
          onClick={handleDelete}
          className="p-1 text-gray-400 hover:text-red-600 transition-colors"
          title="删除任务"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    </div>
  );
});

TodoItem.displayName = 'TodoItem';

export default GoalGroupContainer;
export type { GoalGroup };