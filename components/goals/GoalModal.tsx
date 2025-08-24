'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Goal, List, Todo } from '@/lib/types';

interface GoalModalProps {
  isOpen: boolean;
  goal?: Goal; // 编辑时传入
  lists: List[];
  availableTodos: Todo[]; // 未分配目标的待办事项
  goalTodos?: Todo[]; // 编辑时：目标关联的任务
  onSave: (goalData: GoalFormData) => Promise<void>;
  onClose: () => void;
  onSearchTodos?: (query: string) => Promise<Todo[]>; // 搜索现有任务
}

export interface GoalFormData {
  name: string;
  description?: string;
  listId?: string;
  startDate?: string;
  dueDate?: string;
  priority: number;
  associatedTodos: {
    existing: string[]; // 现有待办事项ID
    new: string[]; // 新创建的待办事项标题
  };
}

interface FormErrors {
  name?: string;
  startDate?: string;
  dueDate?: string;
  general?: string;
}

const GoalModal: React.FC<GoalModalProps> = ({
  isOpen,
  goal,
  lists,
  availableTodos,
  goalTodos = [],
  onSave,
  onClose,
  onSearchTodos
}) => {
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<GoalFormData>({
    name: '',
    description: '',
    listId: '',
    startDate: '',
    dueDate: '',
    priority: 0,
    associatedTodos: {
      existing: [],
      new: []
    }
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // 第二步相关状态
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Todo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedExistingTodos, setSelectedExistingTodos] = useState<Set<string>>(new Set());

  // 重置表单数据
  useEffect(() => {
    if (isOpen) {
      if (goal) {
        // 编辑模式：预填充数据
        const existingTodoIds = goalTodos ? goalTodos.map(todo => todo.id) : [];
        setFormData({
          name: goal.name,
          description: goal.description || '',
          listId: goal.list_id || '',
          startDate: goal.start_date ? goal.start_date.split('T')[0] : '',
          dueDate: goal.due_date ? goal.due_date.split('T')[0] : '',
          priority: goal.priority,
          associatedTodos: {
            existing: existingTodoIds,
            new: []
          }
        });
        setSelectedExistingTodos(new Set(existingTodoIds));
      } else {
        // 创建模式：重置为默认值
        setFormData({
          name: '',
          description: '',
          listId: '',
          startDate: '',
          dueDate: '',
          priority: 0,
          associatedTodos: {
            existing: [],
            new: []
          }
        });
        setSelectedExistingTodos(new Set());
      }
      setCurrentStep(1);
      setErrors({});
      setIsSubmitting(false);
      
      // 重置第二步状态
      setNewTaskTitle('');
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen, goal, goalTodos?.length]);

  // 表单验证
  const validateStep1 = (): boolean => {
    const newErrors: FormErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = '目标名称不能为空';
    } else if (formData.name.trim().length > 100) {
      newErrors.name = '目标名称不能超过100个字符';
    }

    if (formData.startDate && formData.dueDate) {
      const startDate = new Date(formData.startDate);
      const dueDate = new Date(formData.dueDate);
      if (startDate > dueDate) {
        newErrors.dueDate = '截止日期不能早于开始日期';
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

  // 处理下一步
  const handleNextStep = () => {
    if (validateStep1()) {
      setCurrentStep(2);
    }
  };

  // 处理上一步
  const handlePrevStep = () => {
    setCurrentStep(1);
  };

  // 搜索现有任务
  const handleSearchTodos = useCallback(async (query: string) => {
    if (!query.trim() || !onSearchTodos) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await onSearchTodos(query);
      // 过滤掉已经有目标的任务
      const unassignedTodos = results.filter(todo => !todo.goal_id);
      setSearchResults(unassignedTodos);
    } catch (error) {
      console.error('搜索任务失败:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [onSearchTodos]);

  // 处理搜索输入变化
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    handleSearchTodos(query);
  };

  // 添加新任务
  const handleAddNewTask = () => {
    if (!newTaskTitle.trim()) return;
    
    setFormData(prev => ({
      ...prev,
      associatedTodos: {
        ...prev.associatedTodos,
        new: [...prev.associatedTodos.new, newTaskTitle.trim()]
      }
    }));
    setNewTaskTitle('');
  };

  // 移除新任务
  const handleRemoveNewTask = (index: number) => {
    setFormData(prev => ({
      ...prev,
      associatedTodos: {
        ...prev.associatedTodos,
        new: prev.associatedTodos.new.filter((_, i) => i !== index)
      }
    }));
  };

  // 切换现有任务选择
  const handleToggleExistingTodo = (todoId: string) => {
    const newSelected = new Set(selectedExistingTodos);
    if (newSelected.has(todoId)) {
      newSelected.delete(todoId);
    } else {
      newSelected.add(todoId);
    }
    setSelectedExistingTodos(newSelected);
    
    // 更新表单数据
    setFormData(prev => ({
      ...prev,
      associatedTodos: {
        ...prev.associatedTodos,
        existing: Array.from(newSelected)
      }
    }));
  };

  // 处理键盘事件（新任务输入）
  const handleNewTaskKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddNewTask();
    }
  };

  // 处理保存
  const handleSave = async () => {
    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrors({});

    try {
      await onSave(formData);
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

  // 验证第二步
  const validateStep2 = (): boolean => {
    const newErrors: FormErrors = {};
    
    // 检查是否至少有一个任务
    const hasNewTasks = formData.associatedTodos.new.length > 0;
    const hasExistingTasks = selectedExistingTodos.size > 0;
    
    if (!hasNewTasks && !hasExistingTasks) {
      newErrors.general = '请至少添加一个任务';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // 处理完成创建/更新
  const handleComplete = () => {
    if (currentStep === 1) {
      if (validateStep1()) {
        setCurrentStep(2);
      }
    } else {
      // 第二步可以没有任务，直接保存
      handleSave();
    }
  };

  // 处理关闭
  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

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
  }, [isOpen, isSubmitting]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="goal-modal-title"
    >
      <div 
        className="w-full max-w-md mx-4 max-h-[90vh] overflow-hidden modal-content"
        style={{
          background: 'var(--bg-normal)',
          borderRadius: 'var(--border-radius)',
          boxShadow: 'var(--box-shadow)',
          border: 'var(--border)',
          transition: 'all 0.35s ease',
          animation: 'popIn 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94) both'
        }}
      >
        {/* 头部 */}
        <div 
          className="flex items-center justify-between p-6"
          style={{
            borderBottom: 'var(--border)',
            background: 'var(--bg-normal)'
          }}
        >
          <div>
            <h2 
              id="goal-modal-title" 
              className="text-xl font-semibold"
              style={{ color: 'var(--font-color)' }}
            >
              {goal ? '编辑目标' : '创建新目标'}
            </h2>
            <p 
              className="text-sm mt-1"
              style={{ color: 'var(--placeholder)' }}
            >
              第 {currentStep} 步，共 2 步
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
            style={{
              border: 'var(--border)',
              background: 'var(--bg-normal)',
              cursor: 'pointer',
              color: 'var(--placeholder)',
              padding: '0.25rem',
              transition: 'all 0.35s ease',
              borderRadius: 'var(--border-radius)',
              boxShadow: 'var(--box-shadow)'
            }}
            aria-label="关闭"
            onMouseOver={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.color = 'var(--font-color)';
                e.currentTarget.style.background = 'var(--bg-edit)';
                e.currentTarget.style.boxShadow = 'var(--box-shadow)';
                e.currentTarget.style.transform = 'translate(-2px, -2px)';
              }
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = 'var(--placeholder)';
              e.currentTarget.style.background = 'var(--bg-normal)';
              e.currentTarget.style.boxShadow = 'var(--box-shadow)';
              e.currentTarget.style.transform = 'none';
            }}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 进度指示器 */}
        <div className="px-6 py-4" style={{ background: 'var(--bg-normal)' }}>
          <div className="flex items-center">
            <div 
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                currentStep >= 1 ? 'text-white' : 'text-gray-600'
              }`}
              style={{
                background: currentStep >= 1 ? 'var(--completed)' : 'var(--bg-deleted)',
                border: 'var(--border)',
                borderRadius: 'var(--border-radius)',
                boxShadow: 'var(--box-shadow)'
              }}
            >
              1
            </div>
            <div 
              className={`flex-1 h-1 mx-2`}
              style={{ background: currentStep >= 2 ? 'var(--completed)' : 'var(--bg-deleted)' }}
            />
            <div 
              className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                currentStep >= 2 ? 'text-white' : 'text-gray-600'
              }`}
              style={{
                background: currentStep >= 2 ? 'var(--completed)' : 'var(--bg-deleted)',
                border: 'var(--border)',
                borderRadius: 'var(--border-radius)',
                boxShadow: 'var(--box-shadow)'
              }}
            >
              2
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--placeholder)' }}>
            <span>基本信息</span>
            <span>添加任务</span>
          </div>
        </div>

        {/* 表单内容 */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {currentStep === 1 && (
            <div className="space-y-4">
              {/* 目标名称 */}
              <div>
                <label htmlFor="goal-name" className="block text-sm font-medium text-gray-700 mb-1">
                  目标名称 <span className="text-red-500">*</span>
                </label>
                <input
                  id="goal-name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="输入目标名称"
                  className="w-full px-3 py-2 rounded-md focus:outline-none"
                  style={{
                    border: errors.name ? '2px solid var(--deleted)' : 'var(--border)',
                    borderRadius: 'var(--border-radius)',
                    background: 'white',
                    color: 'var(--font-color)',
                    fontFamily: 'var(--font)',
                    fontSize: '16px',
                    boxShadow: 'var(--box-shadow)',
                    transition: 'all 0.35s ease'
                  }}
                  maxLength={100}
                  autoFocus={currentStep === 1}
                />
                {errors.name && (
                  <p className="text-red-500 text-sm mt-1">{errors.name}</p>
                )}
              </div>

              {/* 描述 */}
              <div>
                <label htmlFor="goal-description" className="block text-sm font-medium text-gray-700 mb-1">
                  描述
                </label>
                <textarea
                  id="goal-description"
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  placeholder="输入目标描述（可选）"
                  rows={3}
                  className="w-full px-3 py-2 rounded-md focus:outline-none"
                  style={{
                    border: 'var(--border)',
                    borderRadius: 'var(--border-radius)',
                    background: 'white',
                    color: 'var(--font-color)',
                    fontFamily: 'var(--font)',
                    fontSize: '16px',
                    boxShadow: 'var(--box-shadow)',
                    transition: 'all 0.35s ease'
                  }}
                  maxLength={500}
                />
              </div>

              {/* 关联列表 */}
              <div>
                <label htmlFor="goal-list" className="block text-sm font-medium text-gray-700 mb-1">
                  关联列表
                </label>
                <select
                  id="goal-list"
                  value={formData.listId}
                  onChange={(e) => handleInputChange('listId', e.target.value)}
                  className="w-full px-3 py-2 rounded-md focus:outline-none"
                  style={{
                    border: 'var(--border)',
                    borderRadius: 'var(--border-radius)',
                    background: 'white',
                    color: 'var(--font-color)',
                    fontFamily: 'var(--font)',
                    fontSize: '16px',
                    boxShadow: 'var(--box-shadow)',
                    transition: 'all 0.35s ease'
                  }}
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="goal-start-date" className="block text-sm font-medium text-gray-700 mb-1">
                    开始日期
                  </label>
                  <input
                    id="goal-start-date"
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => handleInputChange('startDate', e.target.value)}
                    className="w-full px-3 py-2 rounded-md focus:outline-none"
                    style={{
                      border: 'var(--border)',
                      borderRadius: 'var(--border-radius)',
                      background: 'white',
                      color: 'var(--font-color)',
                      fontFamily: 'var(--font)',
                      fontSize: '16px',
                      boxShadow: 'var(--box-shadow)',
                      transition: 'all 0.35s ease'
                    }}
                  />
                </div>
                <div>
                  <label htmlFor="goal-due-date" className="block text-sm font-medium text-gray-700 mb-1">
                    截止日期
                  </label>
                  <input
                    id="goal-due-date"
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => handleInputChange('dueDate', e.target.value)}
                    className="w-full px-3 py-2 rounded-md focus:outline-none"
                    style={{
                      border: errors.dueDate ? '2px solid var(--deleted)' : 'var(--border)',
                      borderRadius: 'var(--border-radius)',
                      background: 'white',
                      color: 'var(--font-color)',
                      fontFamily: 'var(--font)',
                      fontSize: '16px',
                      boxShadow: 'var(--box-shadow)',
                      transition: 'all 0.35s ease'
                    }}
                  />
                  {errors.dueDate && (
                    <p className="text-sm mt-1" style={{ color: 'var(--deleted)' }}>{errors.dueDate}</p>
                  )}
                </div>
              </div>

              {/* 优先级 */}
              <div>
                <label htmlFor="goal-priority" className="block text-sm font-medium text-gray-700 mb-1">
                  优先级
                </label>
                <select
                  id="goal-priority"
                  value={formData.priority}
                  onChange={(e) => handleInputChange('priority', parseInt(e.target.value))}
                  className="w-full px-3 py-2 rounded-md focus:outline-none"
                  style={{
                    border: 'var(--border)',
                    borderRadius: 'var(--border-radius)',
                    background: 'white',
                    color: 'var(--font-color)',
                    fontFamily: 'var(--font)',
                    fontSize: '16px',
                    boxShadow: 'var(--box-shadow)',
                    transition: 'all 0.35s ease'
                  }}
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
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              {/* 添加新任务 */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">添加新任务</h3>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    onKeyDown={handleNewTaskKeyDown}
                    placeholder="输入新任务标题"
                    className="flex-1 px-3 py-2 rounded-md focus:outline-none"
                    style={{
                      border: 'var(--border)',
                      borderRadius: 'var(--border-radius)',
                      background: 'white',
                      color: 'var(--font-color)',
                      fontFamily: 'var(--font)',
                      fontSize: '16px',
                      boxShadow: 'var(--box-shadow)',
                      transition: 'all 0.35s ease'
                    }}
                  />
                  <button
                    onClick={handleAddNewTask}
                    disabled={!newTaskTitle.trim()}
                    className="px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: 'var(--bg-submit)',
                      color: 'var(--font-color)',
                      border: 'var(--border)',
                      borderRadius: 'var(--border-radius)',
                      cursor: newTaskTitle.trim() ? 'pointer' : 'not-allowed',
                      transition: 'all 0.35s ease',
                      boxShadow: 'var(--box-shadow)'
                    }}
                    onMouseOver={(e) => {
                      if (newTaskTitle.trim()) {
                        e.currentTarget.style.background = 'var(--bg-edit)';
                        e.currentTarget.style.boxShadow = 'var(--box-shadow)';
                        e.currentTarget.style.transform = 'translate(-2px, -2px)';
                      }
                    }}
                    onMouseOut={(e) => {
                      if (newTaskTitle.trim()) {
                        e.currentTarget.style.background = 'var(--bg-submit)';
                        e.currentTarget.style.boxShadow = 'none';
                        e.currentTarget.style.transform = 'none';
                      }
                    }}
                  >
                    添加
                  </button>
                </div>
                
                {/* 新任务列表 */}
                {formData.associatedTodos.new.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {formData.associatedTodos.new.map((task, index) => (
                      <div key={index} className="flex items-center justify-between p-2 bg-blue-50 rounded-md">
                        <span className="text-sm text-gray-700">{task}</span>
                        <button
                          onClick={() => handleRemoveNewTask(index)}
                          className="text-red-500 hover:text-red-700"
                          aria-label="删除任务"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 关联现有任务 */}
              <div>
                <h3 className="text-lg font-medium text-gray-900 mb-3">关联现有任务</h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearchChange(e.target.value)}
                    placeholder="搜索现有任务..."
                    className="w-full px-3 py-2 rounded-md focus:outline-none"
                    style={{
                      border: 'var(--border)',
                      borderRadius: 'var(--border-radius)',
                      background: 'white',
                      color: 'var(--font-color)',
                      fontFamily: 'var(--font)',
                      fontSize: '16px',
                      boxShadow: 'var(--box-shadow)',
                      transition: 'all 0.35s ease'
                    }}
                  />
                  
                  {/* 搜索状态 */}
                  {isSearching && (
                    <div className="text-center py-4 text-gray-500">
                      搜索中...
                    </div>
                  )}
                  
                  {/* 搜索结果 */}
                  {!isSearching && searchQuery && searchResults.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      未找到匹配的未分配任务
                    </div>
                  )}
                  
                  {!isSearching && searchResults.length > 0 && (
                    <div className="max-h-48 overflow-y-auto space-y-2">
                      {searchResults.map((todo) => (
                        <div
                          key={todo.id}
                          className={`flex items-center p-3 border rounded-md cursor-pointer hover:bg-gray-50 ${
                            selectedExistingTodos.has(todo.id) ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                          }`}
                          onClick={() => handleToggleExistingTodo(todo.id)}
                        >
                          <input
                            type="checkbox"
                            checked={selectedExistingTodos.has(todo.id)}
                            onChange={() => handleToggleExistingTodo(todo.id)}
                            className="mr-3 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{todo.title}</div>
                            {todo.content && (
                              <div className="text-sm text-gray-500 mt-1">{todo.content}</div>
                            )}
                            {todo.due_date && (
                              <div className="text-xs text-gray-400 mt-1">
                                截止: {new Date(todo.due_date).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* 已选择的现有任务 */}
                  {selectedExistingTodos.size > 0 && (
                    <div className="mt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">
                        已选择 {selectedExistingTodos.size} 个任务
                      </h4>
                      <div className="space-y-1">
                        {Array.from(selectedExistingTodos).map((todoId) => {
                          // 查找任务：先在目标任务中找，再在可用任务和搜索结果中找
                          const todo = [...goalTodos, ...availableTodos, ...searchResults].find(t => t.id === todoId);
                          return todo ? (
                            <div key={todoId} className="flex items-center justify-between p-2 bg-green-50 rounded-md">
                              <div className="flex-1">
                                <span className="text-sm text-gray-700">{todo.title}</span>
                                {goal && goalTodos.some(t => t.id === todoId) && (
                                  <span className="ml-2 text-xs text-blue-600">(已关联)</span>
                                )}
                              </div>
                              <button
                                onClick={() => handleToggleExistingTodo(todoId)}
                                className="text-red-500 hover:text-red-700"
                                aria-label="取消选择"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                              </button>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 任务总结 */}
              {(formData.associatedTodos.new.length > 0 || selectedExistingTodos.size > 0) && (
                <div className="p-4 bg-gray-50 rounded-md">
                  <h4 className="text-sm font-medium text-gray-700 mb-2">任务总结</h4>
                  <div className="text-sm text-gray-600">
                    <div>新任务: {formData.associatedTodos.new.length} 个</div>
                    <div>现有任务: {selectedExistingTodos.size} 个</div>
                    <div className="font-medium mt-1">
                      总计: {formData.associatedTodos.new.length + selectedExistingTodos.size} 个任务
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 底部按钮 */}
        <div 
          className="flex justify-between items-center p-6"
          style={{
            borderTop: 'var(--border)',
            background: 'var(--bg-normal)'
          }}
        >
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-md disabled:opacity-50"
            style={{
              background: 'var(--bg-normal)',
              color: 'var(--font-color)',
              border: 'var(--border)',
              borderRadius: 'var(--border-radius)',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.background = 'var(--bg-edit)';
                e.currentTarget.style.boxShadow = 'var(--box-shadow)';
                e.currentTarget.style.transform = 'translate(-2px, -2px)';
              }
            }}
            onMouseOut={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.background = 'var(--bg-normal)';
                e.currentTarget.style.boxShadow = 'none';
                e.currentTarget.style.transform = 'none';
              }
            }}
          >
            取消
          </button>
          
          <div className="flex space-x-3">
            {currentStep === 2 && (
              <button
                onClick={handlePrevStep}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-md disabled:opacity-50"
                style={{
                  background: 'var(--bg-normal)',
                  color: 'var(--font-color)',
                  border: 'var(--border)',
                  borderRadius: 'var(--border-radius)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.35s ease',
                  boxShadow: 'var(--box-shadow)'
                }}
                onMouseOver={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.background = 'var(--bg-edit)';
                    e.currentTarget.style.boxShadow = 'var(--box-shadow)';
                    e.currentTarget.style.transform = 'translate(-2px, -2px)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.background = 'var(--bg-normal)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'none';
                  }
                }}
              >
                上一步
              </button>
            )}
            
            {currentStep === 1 ? (
              <button
                onClick={handleComplete}
                disabled={isSubmitting}
                className="px-6 py-2 rounded-md disabled:opacity-50"
                style={{
                  background: 'var(--bg-submit)',
                  color: 'var(--font-color)',
                  border: 'var(--border)',
                  borderRadius: 'var(--border-radius)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.35s ease',
                  boxShadow: 'var(--box-shadow)'
                }}
                onMouseOver={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.background = 'var(--bg-edit)';
                    e.currentTarget.style.boxShadow = 'var(--box-shadow)';
                    e.currentTarget.style.transform = 'translate(-2px, -2px)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.background = 'var(--bg-submit)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'none';
                  }
                }}
              >
                下一步
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={isSubmitting}
                className="px-6 py-2 rounded-md disabled:opacity-50"
                style={{
                  background: 'var(--completed)',
                  color: 'var(--font-color)',
                  border: 'var(--border)',
                  borderRadius: 'var(--border-radius)',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.35s ease',
                  boxShadow: 'var(--box-shadow)'
                }}
                onMouseOver={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.background = '#7bc4bb';
                    e.currentTarget.style.boxShadow = 'var(--box-shadow)';
                    e.currentTarget.style.transform = 'translate(-2px, -2px)';
                  }
                }}
                onMouseOut={(e) => {
                  if (!isSubmitting) {
                    e.currentTarget.style.background = 'var(--completed)';
                    e.currentTarget.style.boxShadow = 'none';
                    e.currentTarget.style.transform = 'none';
                  }
                }}
              >
                {isSubmitting ? '保存中...' : goal ? '更新目标' : '创建目标'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoalModal;