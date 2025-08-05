// components/TodoDetailsModal.tsx
"use client";

import { useState } from 'react';
import type { Todo, List } from '../lib/types';
import { RRuleEngine } from '../lib/recurring/RRuleEngine';
import { RecurringTaskGenerator } from '../lib/recurring/RecurringTaskGenerator';
import RecurrenceSelector from './RecurrenceSelector';

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

// 本地日期字符串转数据库 UTC 字符串（-1天，东八区零点对齐）
function localDateToDbUTC(date: string | null | undefined): string | null {
  if (!date) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const [year, month, day] = date.split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, 16, 0));
    d.setUTCDate(d.getUTCDate() - 1); // 恢复减一天
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} 16:00:00+00`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date)) return date; // ISO 8601 format
  return null;
}

// 数据库 UTC 字符串转本地日期字符串
function dbUTCToLocalDate(date: string | null | undefined): string {
  if (!date) return '';
  // 如果是 YYYY-MM-DD 格式，直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  // 如果是数据库格式 YYYY-MM-DD 16:00:0提取日期部分并加一天
  const match = date.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) {
    const [year, month, day] = match[1].split('-').map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, 16, 0));
    d.setUTCDate(d.getUTCDate() + 1); // 加一天
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  // 尝试解析其他格式
  try {
    const d = new Date(date);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch (e) {
    console.error("Error parsing date:", date, e);
  }
  return '';
}

// 工具函数：清洗 Todo 对象中的日期字段，确保为数据库可接受的 UTC 字符串或 null
const cleanTodoDates = (todo: Todo): Todo => {
  const cleanDate = (date: string | null | undefined) => {
    if (!date) return null;
    // 已经是数据库格式
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(date)) return date; // ISO 8601 format
    if (/^\d{4}-\d{2}-\d{2} 160000$/.test(date)) return date; // YYYY-MM-DD HH:mm:ss+00
    // 只有日期
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return localDateToDbUTC(date)?.replace(' 16:00:00+00', ' 160000') || null;
    }
    // 其他情况尝试转为 Date
    try {
      const d = new Date(date);
      if (!isNaN(d.getTime())) {
        const year = d.getUTCFullYear();
        const month = (d.getUTCMonth() + 1).toString().padStart(2, '0');
        const day = d.getUTCDate().toString().padStart(2, '0');
        return `${year}-${month}-${day} 160000`;
      }
    } catch (e) {
      console.error("Error cleaning date:", date, e);
    }
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
  
  // 添加详细的调试信息
  // console.log('=== TodoDetailsModal 调试信息 ===');
  // console.log('传入的 todo 对象:', todo);
  // console.log('todo.start_date:', todo.start_date, '类型:', typeof todo.start_date);
  // console.log('todo.due_date:', todo.due_date, '类型:', typeof todo.due_date);
  // console.log('dbUTCToLocalDate(todo.start_date):', dbUTCToLocalDate(todo.start_date));
  // console.log('dbUTCToLocalDate(todo.due_date):', dbUTCToLocalDate(todo.due_date));
  // console.log('editableTodo.start_date:', editableTodo.start_date);
  // console.log('editableTodo.due_date:', editableTodo.due_date);
  // console.log('================================');

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
    const { name, value, type } = e.target;
    const checked = 'checked' in e.target ? e.target.checked : false;
    let finalValue: string | number | boolean | null = value;

    if (name === 'start_date' || name === 'due_date') {
      finalValue = localDateToDbUTC(value);
    } else if (name === 'priority') {
      finalValue = value ? Number(value) : 0;
    } else if (name === 'list_id') {
      finalValue = value === '' ? null : value;
    } else if (type === 'checkbox') {
      finalValue = checked;
    } else if (name === 'repeat') {
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
                        value={dbUTCToLocalDate(editableTodo.start_date) || ''}
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
                        value={dbUTCToLocalDate(editableTodo.due_date)}
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

            {/* 重复任务配置 */}
            {!isRecycled && !RecurringTaskGenerator.isTaskInstance(editableTodo) && (
                <div className="form-group">
                    <label>重复</label>
                    <RecurrenceSelector
                        value={editableTodo.is_recurring ? editableTodo.repeat : null}
                        onChange={(rrule) => {
                            if (rrule) {
                                // 计算下一个到期日期
                                let nextDueDate = null;
                                if (editableTodo.due_date) {
                                    try {
                                        const currentDueDate = new Date(editableTodo.due_date);
                                        nextDueDate = RRuleEngine.calculateNextDueDate(rrule, currentDueDate, currentDueDate);
                                    } catch (error) {
                                        console.error('Error calculating next due date:', error);
                                    }
                                }
                                
                                setEditableTodo(prev => ({
                                    ...prev,
                                    is_recurring: true,
                                    repeat: rrule,
                                    next_due_date: nextDueDate ? nextDueDate.toISOString() : null
                                }));
                            } else {
                                setEditableTodo(prev => ({
                                    ...prev,
                                    is_recurring: false,
                                    repeat: null,
                                    next_due_date: null
                                }));
                            }
                        }}
                        disabled={isRecycled}
                    />
                </div>
            )}

            {/* 显示重复任务实例信息 */}
            {RecurringTaskGenerator.isTaskInstance(editableTodo) && (
                <div className="form-group">
                    <div className="recurring-instance-info">
                        <span className="instance-badge">重复任务实例</span>
                        {editableTodo.instance_number && (
                            <span className="instance-number">第 {editableTodo.instance_number} 次</span>
                        )}
                    </div>
                </div>
            )}
        </div>
        <div className="modal-footer">         {isRecycled ? (
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