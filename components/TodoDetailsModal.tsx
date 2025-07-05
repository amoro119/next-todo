// components/TodoDetailsModal.tsx
"use client";

import { useState } from 'react';
import type { Todo, List } from '../lib/types';

interface TodoDetailsModalProps {
  todo: Todo;
  lists: List[];
  onClose: () => void;
  onSave: (updatedTodo: Todo) => void;
  onDelete: (todoId: number) => void;
  onUpdate: (todoId: number, updates: Partial<Todo>) => Promise<void>;
  onRestore?: (todoId: number) => void;
  onPermanentDelete?: (todoId: number) => void;
}

// Helper function: Convert UTC timestamp string to local date string (YYYY-MM-DD)
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  if (!utcDate) return '';
  try {
    const date = new Date(utcDate);
    if (isNaN(date.getTime())) {
      const dateOnlyMatch = utcDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) return utcDate;
      return '';
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    return formatter.format(date);
  } catch (e) {
    console.error("Error formatting date:", utcDate, e);
    return '';
  }
};

// Helper function: Convert local date string (YYYY-MM-DD) to UTC timestamp at the end of the day
const localDateToEndOfDayUTC = (localDate: string | null | undefined): string | null => {
  if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  try {
    const dateInUTC8 = new Date(`${localDate}T23:59:59.999+08:00`);
    return dateInUTC8.toISOString();
  } catch (e) {
    console.error("Error converting date to UTC:", localDate, e);
    return null;
  }
};

export default function TodoDetailsModal({ 
    todo, 
    lists, 
    onClose, 
    onSave, 
    onDelete, 
    onUpdate,
    onRestore,
    onPermanentDelete
}: TodoDetailsModalProps) {
  const [editableTodo, setEditableTodo] = useState<Todo>(todo);
  const isRecycled = !!todo.removed;

  const handleSave = () => {
    onSave(editableTodo);
  };

  const handleDelete = () => {
    onDelete(editableTodo.id);
  };

  const handlePermanentDelete = () => {
    if (onPermanentDelete) {
        onPermanentDelete(editableTodo.id);
    }
  };

  const handleRestore = () => {
    if (onRestore) {
        onRestore(editableTodo.id);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    if (isRecycled) return;
    const { name, value } = e.target;
    let finalValue: string | number | null = value;

    if (name === 'start_date' || name === 'due_date') {
      finalValue = localDateToEndOfDayUTC(value);
    } else if (name === 'priority' || name === 'list_id') {
      finalValue = value ? Number(value) : null;
    }
    
    setEditableTodo(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleToggleComplete = async () => {
    if (isRecycled) return;
    const isCompleted = !!editableTodo.completed;
    const updates = {
      completed: isCompleted ? 0 : 1,
      completed_time: isCompleted ? null : new Date().toISOString(),
    };
    setEditableTodo(prev => ({ ...prev, ...updates }));
    await onUpdate(editableTodo.id, updates);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isRecycled ? '回收站任务详情' : '任务详情'}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
            <div className="form-group">
                <div className="modal-title-wrapper">
                    <input 
                        type="checkbox"
                        className="modal-todo-checkbox"
                        checked={!!editableTodo.completed}
                        onChange={handleToggleComplete}
                        disabled={isRecycled}
                    />
                    <input
                        type="text"
                        name="title"
                        className={`modal-todo-title ${editableTodo.completed ? 'completed' : ''}`}
                        value={editableTodo.title}
                        onChange={handleInputChange}
                        readOnly={isRecycled}
                    />
                </div>
            </div>
            
            <div className="form-group">
                <label htmlFor="content">备注</label>
                <textarea
                    id="content"
                    name="content"
                    value={editableTodo.content || ''}
                    onChange={handleInputChange}
                    rows={4}
                    readOnly={isRecycled}
                />
            </div>
            
            <div className="form-group-row">
                <div className="form-group">
                    <label htmlFor="list_id">清单</label>
                    <select
                        id="list_id"
                        name="list_id"
                        value={editableTodo.list_id || ''}
                        onChange={handleInputChange}
                        disabled={isRecycled}
                    >
                        <option value="">无清单</option>
                        {lists.map(list => (
                            <option key={list.id} value={list.id}>{list.name}</option>
                        ))}
                    </select>
                </div>
                <div className="form-group">
                    <label htmlFor="priority">优先级</label>
                    <select
                        id="priority"
                        name="priority"
                        value={editableTodo.priority}
                        onChange={handleInputChange}
                        disabled={isRecycled}
                    >
                        <option value="0">无</option>
                        <option value="1">低</option>
                        <option value="2">中</option>
                        <option value="3">高</option>
                    </select>
                </div>
            </div>

            <div className="form-group-row">
                <div className="form-group">
                    <label htmlFor="start_date">开始日期</label>
                    <input
                        type="date"
                        id="start_date"
                        name="start_date"
                        value={utcToLocalDateString(editableTodo.start_date)}
                        onChange={handleInputChange}
                        readOnly={isRecycled}
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="due_date">截止日期</label>
                    <input
                        type="date"
                        id="due_date"
                        name="due_date"
                        value={utcToLocalDateString(editableTodo.due_date)}
                        onChange={handleInputChange}
                        readOnly={isRecycled}
                    />
                </div>
            </div>

            <div className="form-group">
                <label htmlFor="tags">标签</label>
                <input
                    type="text"
                    id="tags"
                    name="tags"
                    value={editableTodo.tags || ''}
                    onChange={handleInputChange}
                    placeholder="用逗号分隔"
                    readOnly={isRecycled}
                />
            </div>
        </div>
        <div className="modal-footer">
          {isRecycled ? (
            <>
              <button className="btn-small delete" onClick={handlePermanentDelete}>永久删除</button>
              <button className="btn-small" onClick={onClose}>关闭</button>
              <button className="btn-small confirm" onClick={handleRestore}>恢复</button>
            </>
          ) : (
            <>
              <button className="btn-small delete" onClick={handleDelete}>删除</button>
              <button className="btn-small" onClick={onClose}>取消</button>
              <button className="btn-small confirm" onClick={handleSave}>保存</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}