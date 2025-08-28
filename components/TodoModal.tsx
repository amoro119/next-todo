// components/TodoModal.tsx
"use client";

import { useState, useEffect } from 'react';
import type { Todo, List, Goal } from '../lib/types';
import RecurrenceSelector from './RecurrenceSelector';
import { RRuleEngine } from '../lib/recurring/RRuleEngine';

interface TodoModalProps {
  mode: 'create' | 'edit';
  initialData?: Partial<Todo>;
  lists: List[];
  goals?: Goal[]; // 可选的 goals 列表
  goalId?: string; // 可选的 goalId 参数
  context?: {
    view?: string;
    todayDate?: string;
    selectedDate?: string;
    listId?: string;
  };
  onClose: () => void;
  onSubmit: (todoData: Todo) => void;
  onDelete?: (todoId: string) => void;
  onUpdate?: (todoId: string, updates: Partial<Todo>) => Promise<void>;
  onRestore?: (todoId: string) => void;
  onPermanentDelete?: (todoId: string) => void;
}

// 数据库 UTC 字符串转本地日期字符串
function dbUTCToLocalDate(date: string | null | undefined): string {
  if (!date) return '';
  // 如果是 YYYY-MM-DD 格式，直接返回
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }
  // 如果是数据库格式 YYYY-MM-DD 16:00:00+00 提取日期部分并加一天
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

export default function TodoModal({ 
  mode,
  initialData,
  lists, 
  goals = [], // 接收 goals 列表
  goalId, // 接收 goalId 参数
  context,
  onClose, 
  onSubmit, 
  onDelete,
  onUpdate,
  onRestore,
  onPermanentDelete
}: TodoModalProps) {
  // 初始化表单数据
  const initialTodo: Todo = {
    id: initialData?.id || '',
    title: initialData?.title || '',
    completed: initialData?.completed || false,
    deleted: initialData?.deleted || false,
    sort_order: initialData?.sort_order || 0,
    due_date: initialData?.due_date || null,
    content: initialData?.content || null,
    tags: initialData?.tags || null,
    priority: initialData?.priority || 0,
    created_time: initialData?.created_time || new Date().toISOString(),
    completed_time: initialData?.completed_time || null,
    start_date: initialData?.start_date || null,
    list_id: initialData?.list_id || null,
    list_name: initialData?.list_name || null,
    goal_id: goalId ?? initialData?.goal_id ?? null, // 添加 goal_id 字段
    // 重复任务相关字段
    repeat: initialData?.repeat || null,
    reminder: initialData?.reminder || null,
    is_recurring: initialData?.is_recurring || false,
    recurring_parent_id: initialData?.recurring_parent_id || null,
    instance_number: initialData?.instance_number || null,
    next_due_date: initialData?.next_due_date || null,
  };

  // 根据上下文设置默认值
  const getContextDefaults = (): Partial<Todo> => {
    if (mode !== 'create' || !context) return {};
    
    const defaults: Partial<Todo> = {};
    
    // 今日待办视图 - 默认选择今天
    if (context.view === 'today') {
      const today = context.todayDate || new Date().toISOString().split('T')[0];
      const todayUTC = localDateToDbUTC(today);
      defaults.start_date = todayUTC;
      defaults.due_date = todayUTC;
    }
    
    // 分类视图 - 默认选中当前分类
    else if (context.view && context.listId && 
             context.view !== 'inbox' && 
             context.view !== 'today' && 
             context.view !== 'calendar' && 
             context.view !== 'recycle') {
      defaults.list_id = context.listId;
    }
    
    // 日历视图 - 默认选择用户选中的日期
    else if (context.view === 'calendar' && context.selectedDate) {
      const selectedDateUTC = localDateToDbUTC(context.selectedDate);
      defaults.start_date = selectedDateUTC;
      defaults.due_date = selectedDateUTC;
    }
    
    return defaults;
  };

  const contextDefaults = getContextDefaults();
  const mergedInitialTodo = { ...initialTodo, ...contextDefaults };
  
  const [editableTodo, setEditableTodo] = useState<Todo>(mergedInitialTodo);
  const isRecycled = !!editableTodo.deleted;

    
  // 当 initialData 改变时，更新 editableTodo（主要用于编辑模式）
  useEffect(() => {
    if (mode === 'edit' && initialData) {
      setEditableTodo({
        ...initialTodo,
        ...initialData
      });
    }
    // 当上下文改变时，更新默认值（主要用于创建模式）
    else if (mode === 'create') {
      const contextDefaults = getContextDefaults();
      const mergedInitialTodo = { ...initialTodo, ...contextDefaults };
      setEditableTodo(mergedInitialTodo);
    }
  }, [initialData, mode, context]);

  const handleSave = () => {
    onSubmit(cleanTodoDates(editableTodo));
  };

  const handleDelete = () => {
    if (onDelete && editableTodo.id) {
      onDelete(editableTodo.id);
    }
  };

  const handlePermanentDelete = () => {
    if (onPermanentDelete && editableTodo.id) {
      onPermanentDelete(editableTodo.id);
    }
  };

  const handleRestore = () => {
    if (onRestore && editableTodo.id) {
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
    } else if (name === 'list_id' || name === 'goal_id') {
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
    
    // 如果是编辑模式且提供了 onUpdate 回调，则调用它
    if (mode === 'edit' && onUpdate && editableTodo.id) {
      await onUpdate(editableTodo.id, updates);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && mode === 'create') {
      e.preventDefault();
      if (editableTodo.title.trim()) {
        handleSave();
      }
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isRecycled ? '回收站任务详情' : (mode === 'create' ? '创建任务' : '任务详情')}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
            <div className="form-group">
                {mode === 'edit' ? (
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
                ) : (
                  <input
                    type="text"
                    className="modal-title-wrapper"
                    placeholder="请输入要做什么"
                    value={editableTodo.title}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    name="title"
                    autoFocus
                  />
                )}
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
                        value={mode === 'create' ? dbUTCToLocalDate(editableTodo.start_date) : dbUTCToLocalDate(editableTodo.start_date) || ''}
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
                        value={mode === 'create' ? dbUTCToLocalDate(editableTodo.due_date) : dbUTCToLocalDate(editableTodo.due_date)}
                        onChange={handleInputChange}
                        readOnly={isRecycled}
                    />
                </div>
            </div>

            <div className="form-group">
                <label htmlFor="goal_id">所属目标</label>
                <select
                    id="goal_id"
                    name="goal_id"
                    value={editableTodo.goal_id ?? goalId ?? ''}
                    onChange={handleInputChange}
                    disabled={!!goalId || isRecycled}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                    <option value="">无目标</option>
                    {goals.map(goal => (
                        <option key={goal.id} value={goal.id}>{goal.name}</option>
                    ))}
                </select>
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

            {/* 重复任务配置 - 统一处理原始任务和实例 */}
            {!isRecycled && (
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
                                    next_due_date: nextDueDate ? nextDueDate.toISOString() : null,
                                    // 如果是重复任务实例，转换为原始重复任务
                                    recurring_parent_id: null,
                                    instance_number: null
                                }));
                            } else {
                                setEditableTodo(prev => ({
                                    ...prev,
                                    is_recurring: false,
                                    repeat: null,
                                    next_due_date: null,
                                    // 清除重复任务相关字段
                                    recurring_parent_id: null,
                                    instance_number: null
                                }));
                            }
                        }}
                        disabled={isRecycled}
                    />
                </div>
            )}
        </div>
        <div className="modal-footer">
          {mode === 'edit' ? (
            isRecycled ? (
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
            )
          ) : (
            <>
              <button className="btn-small" onClick={onClose}>取消</button>
              <button className="btn-small confirm" onClick={handleSave} disabled={!editableTodo.title.trim()}>创建</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}