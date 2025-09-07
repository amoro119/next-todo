'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Goal, List, Todo } from '@/lib/types';

interface GoalModalProps {
  isOpen: boolean;
  goal?: Goal; // 编辑时传入
  goalId?: string; // 新创建的目标ID
  initialName?: string; // 初始名称（用于新创建的目标）
  lists: List[];
  availableTodos: Todo[]; // 未分配目标的待办事项
  goalTodos?: Todo[]; // 编辑时：目标关联的任务
  onSave: (goalData: GoalFormData) => Promise<string>; // 返回创建的目标ID
  onClose: () => void;
  onSearchTodos?: (query: string) => Promise<Todo[]>; // 搜索现有任务
  onGoalCreated?: (goalId: string) => Promise<void>; // 目标创建成功回调
}

export interface GoalFormData {
  name: string;
  description?: string;
  list_id?: string;
  start_date?: string;
  due_date?: string;
  priority: number;
  goalId?: string; // 目标ID（用于更新现有目标）
  associatedTodos: {
    existing: string[]; // 现有待办事项ID
    new: string[]; // 新创建的待办事项标题
  };
}

interface FormErrors {
  name?: string;
  start_date?: string;
  due_date?: string;
  general?: string;
}

const GoalModal: React.FC<GoalModalProps> = ({
  isOpen,
  goal,
  goalId,
  initialName,
  lists,
  availableTodos,
  goalTodos = [],
  onSave,
  onClose,
  onSearchTodos,
  onGoalCreated
}) => {
  const [formData, setFormData] = useState<GoalFormData>({
    name: '',
    description: '',
    list_id: '',
    start_date: '',
    due_date: '',
    priority: 0,
    associatedTodos: {
      existing: [],
      new: []
    }
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 重置表单数据（只在模态打开时初始化一次，防止依赖引用变化导致循环）
  const openedRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      openedRef.current = false;
      return;
    }

    if (openedRef.current) return;
    openedRef.current = true;

    if (goal) {
        // 编辑模式：预填充数据
        const existingTodoIds = goalTodos ? goalTodos.map(todo => todo.id) : [];
        setFormData({
          name: goal.name,
          description: goal.description || '',
          list_id: goal.list_id || '',
          start_date: goal.start_date ? new Date(goal.start_date).toISOString().split('T')[0] : '',
          due_date: goal.due_date ? new Date(goal.due_date).toISOString().split('T')[0] : '',
          priority: goal.priority,
          associatedTodos: {
            existing: existingTodoIds,
            new: []
          }
        });
      } else if (goalId === 'new') {
        // 从头部创建的新目标：预填充初始名称
        setFormData({
          name: initialName || '',
          description: '',
          list_id: '',
          start_date: '',
          due_date: '',
          priority: 0,
          associatedTodos: {
            existing: [],
            new: []
          }
        });
      } else if (goalId) {
        // 编辑已存在的目标
        setFormData({
          name: '',
          description: '',
          list_id: '',
          start_date: '',
          due_date: '',
          priority: 0,
          goalId: goalId,
          associatedTodos: {
            existing: [],
            new: []
          }
        });
      } else {
        // 创建模式：重置为默认值
        setFormData({
          name: '',
          description: '',
          list_id: '',
          start_date: '',
          due_date: '',
          priority: 0,
          associatedTodos: {
            existing: [],
            new: []
          }
        });
      }
      setErrors({});
      setIsSubmitting(false);
  }, [isOpen, goal, goalTodos, goalId, initialName]);

  // 表单验证
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = '目标名称不能为空';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = '目标名称不能超过100个字符';
    }

    if (formData.start_date && formData.due_date) {
      const startDate = new Date(formData.start_date);
      const dueDate = new Date(formData.due_date);
      if (startDate > dueDate) {
        newErrors.due_date = '截止日期不能早于开始日期';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 处理输入变化
  const handleInputChange = (field: keyof GoalFormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));

    // 清除相关错误
    if (errors[field as keyof FormErrors]) {
      setErrors(prev => ({
        ...prev,
        [field]: undefined
      }));
    }
  };


  // 处理保存
  const handleSave = async () => {
    if (isSubmitting) return;

    if (!validateForm()) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      // 如果goalId为'new'，说明是创建新目标，不传递goalId
      const saveData = {
        ...formData,
        ...(goalId && goalId !== 'new' ? { goalId } : {})
      };
      const createdGoalId = await onSave(saveData);
      
      console.log('GoalModal: 保存完成', {
        goal,
        goalId,
        createdGoalId,
        hasOnGoalCreated: !!onGoalCreated,
        isNewGoal: !goal || goalId === 'new'
      });
      
      // 如果是创建新目标且有回调函数，先调用回调等待完成，再关闭模态框
      const isNewGoal = !goal || goalId === 'new';
      if (isNewGoal && createdGoalId && onGoalCreated) {
        console.log('GoalModal: 调用 onGoalCreated 回调，等待切换完成', createdGoalId);
        await onGoalCreated(createdGoalId);
        console.log('GoalModal: 目标切换完成，准备关闭模态框');
      }
      
      // 保存成功后关闭模态框
      onClose();
    } catch (error) {
      console.error('保存目标失败:', error);
      setErrors({
        general: error instanceof Error ? error.message : '保存失败，请重试'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // 处理关闭
  const handleClose = useCallback(() => {
    if (!isSubmitting) {
      onClose();
    }
  }, [isSubmitting, onClose]);

  // 处理键盘事件
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, isSubmitting, handleClose]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="goal-modal-title"
    >
  <div className="w-full max-w-md mx-4 max-h-[90vh] overflow-hidden modal-content">
        {/* 头部 */}
  <div className="modal-header">
          <div>
            <h2 
              id="goal-modal-title" 
              className="text-xl font-semibold modal-title"
            >
              {goal ? '编辑目标' : '创建新目标'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="modal-close"
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        {/* 表单内容 */}
        <div className="modal-body">
          <div className="space-y-4">
            {/* 目标名称 */}
            <div className="form-group">
              <label htmlFor="goal-name" className="block text-sm font-medium text-gray-700 mb-1">
                目标名称 <span className="text-red-500">*</span>
              </label>
              <input
                id="goal-name"
                type="text"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="输入目标名称"
                className="modal-input"
                maxLength={100}
                autoFocus
              />
              {errors.name && (
                <p className="text-red-500 text-sm mt-1 modal-error">{errors.name}</p>
              )}
            </div>

            {/* 描述 */}
            <div className="form-group">
              <label htmlFor="goal-description" className="block text-sm font-medium text-gray-700 mb-1">
                描述
              </label>
              <textarea
                id="goal-description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="输入目标描述（可选）"
                rows={3}
                className="modal-input"
                maxLength={500}
              />
            </div>

            {/* 关联列表 */}
            <div className="form-group">
              <label htmlFor="goal-list" className="block text-sm font-medium text-gray-700 mb-1">
                关联列表
              </label>
              <select
                id="goal-list"
                value={formData.list_id}
                onChange={(e) => handleInputChange('list_id', e.target.value)}
                className="modal-input"
              >
                <option value="">选择列表（可选）</option>
                {lists.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 日期范围 */}
            <div className="form-group-row grid grid-cols-2 gap-4">
              <div className="form-group">
                <label htmlFor="goal-start-date" className="block text-sm font-medium text-gray-700 mb-1">
                  开始日期
                </label>
                <input
                  id="goal-start-date"
                  type="date"
                  value={formData.start_date}
                  onChange={(e) => handleInputChange('start_date', e.target.value)}
                  className="modal-input"
                />
              </div>
              <div className="form-group">
                <label htmlFor="goal-due-date" className="block text-sm font-medium text-gray-700 mb-1">
                  截止日期
                </label>
                <input
                  id="goal-due-date"
                  type="date"
                  value={formData.due_date}
                  onChange={(e) => handleInputChange('due_date', e.target.value)}
                  className={`modal-input ${errors.due_date ? 'error' : ''}`}
                />
                {errors.due_date && (
                  <p className="text-sm mt-1 modal-error">{errors.due_date}</p>
                )}
              </div>
            </div>

            {/* 优先级 */}
            <div className="form-group">
              <label htmlFor="goal-priority" className="block text-sm font-medium text-gray-700 mb-1">
                优先级
              </label>
              <select
                id="goal-priority"
                value={formData.priority}
                onChange={(e) => handleInputChange('priority', parseInt(e.target.value))}
                className="modal-input"
              >
                <option value={0}>无</option>
                <option value={1}>低</option>
                <option value={2}>中</option>
                <option value={3}>高</option>
              </select>
            </div>

            {/* 通用错误信息 */}
            {errors.general && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-red-600 text-sm">{errors.general}</p>
              </div>
            )}
          </div>
        </div>

        {/* 底部按钮 */}
  <div className="modal-footer">
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="modal-btn ghost interactive-hover"
          >
          取消
          </button>
          
          <button
            onClick={handleSave}
            disabled={isSubmitting}
            className="modal-btn primary interactive-hover"
          >
            {isSubmitting ? '保存中...' : goal ? '保存' : '创建目标'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GoalModal;