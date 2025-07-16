// components/TodoDetailsModal.tsx
"use client";

import { useState } from 'react';
import type { Todo, List } from '../lib/types';

interface TodoDetailsModalProps {
  todo: Todo;
  lists: List[];
  onClose: () => void;
  onSave: (updatedTodo: Todo) => void;
  onDelete: (todoId: string) => void;
  onUpdate: (todoId: string, updates: Partial<Todo>) => Promise<void>;
  onRestore?: (todoId: string) => void;
  onPermanentDelete?: (todoId: string) => void;
}

// Helper function: Convert UTC timestamp string to local date string (YYYY-MM-DD)
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  if (!utcDate) return '';
  // 只取日期部分（YYYY-MM-DD），不做时区换算
  const match = utcDate.match(/^\d{4}-\d{2}-\d{2}/);
  if (match) return match[0];
  try {
    const date = new Date(utcDate);
    if (isNaN(date.getTime())) return '';
    // 兜底：用本地时间
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
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

// 工具函数：清洗 Todo 对象中的日期字段，确保为数据库可接受的 UTC 字符串或 null
const cleanTodoDates = (todo: Todo): Todo => {
  const cleanDate = (date: string | null | undefined) => {
    if (!date) return null;
    // 已经是 'YYYY-MM-DD 16:00:00+00' 格式
    if (/^\d{4}-\d{2}-\d{2} 16:00:00\+00$/.test(date)) return date;
    // 只有日期，转为前一天的 UTC 16:00:00+00
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [year, month, day] = date.split('-').map(Number);
      const d = new Date(Date.UTC(year, month - 1, day, 16, 0, 0));
      d.setUTCDate(d.getUTCDate() - 1);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} 16:00:00+00`;
    }
    // 其他情况尝试转为 Date
    try {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        // 转为前一天的 'YYYY-MM-DD 16:00:00+00'
        d.setUTCDate(d.getUTCDate() - 1);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} 16:00:00+00`;
      }
    } catch {}
    return null;
  };
  return {
    ...todo,
    start_date: cleanDate(todo.start_date),
    due_date: cleanDate(todo.due_date),
    completed_time: cleanDate(todo.completed_time),
    created_time: cleanDate(todo.created_time),
  };
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
  const isRecycled = !!todo.deleted;

  const handleSave = () => {
    onSave(cleanTodoDates(editableTodo));
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
    } else if (name === 'priority') {
      finalValue = value ? Number(value) : 0;
    } else if (name === 'list_id') {
      // list_id 作为字符串处理，空字符串为 null
      finalValue = value === '' ? null : value;
    }
    setEditableTodo(prev => ({ ...prev, [name]: finalValue }));
  };

  const handleToggleComplete = async () => {
    if (isRecycled) return;
    const isCompleted = !!editableTodo.completed;
    const updates = {
      completed: !isCompleted,
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
                        value={editableTodo.list_id === null || editableTodo.list_id === undefined ? '' : String(editableTodo.list_id)}
                        onChange={handleInputChange}
                        disabled={isRecycled}
                    >
                        <option value="">无清单</option>
                        {lists.map(list => (
                            <option key={list.id} value={String(list.id)}>{list.name}</option>
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