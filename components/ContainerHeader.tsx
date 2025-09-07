'use client';

import React from 'react';
import type { GoalFormData } from '@/lib/types';

interface ContainerHeaderProps {
  mode: 'todo' | 'goals';
  currentView: string;
  newTodoTitle: string;
  newTodoDate: string | null;
  onTitleChange: (title: string) => void;
  onAddTodo: () => void;
  onSubmitGoal?: () => Promise<void>;
  placeholder?: string;
}

const ContainerHeader: React.FC<ContainerHeaderProps> = ({
  mode,
  currentView,
  newTodoTitle,
  newTodoDate,
  onTitleChange,
  onAddTodo,
  onSubmitGoal,
  placeholder
}) => {
  const getPlaceholder = () => {
    if (placeholder) return placeholder;
    
    if (mode === 'goals') {
      return '创建新目标...';
    }
    
    if (newTodoDate) {
      return `为 ${newTodoDate} 添加新事项...`;
    }
    
    if (currentView !== 'today' && currentView !== 'inbox' && currentView !== 'calendar' && currentView !== 'recycle') {
      return `在"${currentView}"中新增待办...`;
    }
    
    return '新增待办事项...';
  };

  const handleSubmit = async () => {
    if (mode === 'goals' && onSubmitGoal) {
      await onSubmitGoal();
    } else {
      onAddTodo();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="container header">
      <div className="todo-input">
        <h1 className="title">
          {mode === 'goals' ? <img src="/img/goal.png" alt="Todo" width={200} height={60} draggable={false} /> : <img src="/img/todo.svg" alt="Todo" width={180} height={52} draggable={false} />}
        </h1>
        <div className="add-content-wrapper">
          <input
            type="text"
            className="add-content"
            placeholder={getPlaceholder()}
            value={newTodoTitle}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyUp={handleKeyDown}
          />
          <button 
            className="btn submit-btn" 
            type="button" 
            onClick={handleSubmit}
          >
            {mode === 'goals' ? '创建' : '提交'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContainerHeader;