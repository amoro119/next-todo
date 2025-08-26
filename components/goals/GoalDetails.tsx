'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Goal, Todo } from '@/lib/types';
import TodoModal from '@/components/TodoModal';

interface GoalDetailsProps {
  goal: Goal;
  todos: Todo[];
  goals: Goal[];
  lists: List[];
  onUpdateGoal: (goal: Goal) => void;
  onUpdateTodo: (todo: Todo) => void;
  onDeleteTodo: (todoId: string) => void;
  onCreateTodo: (todo: Omit<Todo, 'id' | 'created_time'>) => void;
  onClose: () => void;
  loading?: boolean;
}

interface DragState {
  draggedIndex: number | null;
  dragOverIndex: number | null;
}

const GoalDetails: React.FC<GoalDetailsProps> = ({
  goal,
  todos,
  goals,
  lists,
  onUpdateGoal,
  onUpdateTodo,
  onDeleteTodo,
  onCreateTodo,
  loading = false
}) => {
  const [dragState, setDragState] = useState<DragState>({
    draggedIndex: null,
    dragOverIndex: null
  });
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Todo | null>(null);

  // 计算目标进度
  const progress = useMemo(() => {
    if (todos.length === 0) return 0;
    const completedTodos = todos.filter(todo => todo.completed).length;
    return Math.round((completedTodos / todos.length) * 100);
  }, [todos]);

  // 按排序权重排序任务
  const sortedTodos = useMemo(() => {
    return [...todos].sort((a, b) => {
      const weightA = a.sort_order_in_goal || a.sort_order || 0;
      const weightB = b.sort_order_in_goal || b.sort_order || 0;
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      // 如果权重相同，按创建时间排序
      const timeA = a.created_time ? new Date(a.created_time).getTime() : 0;
      const timeB = b.created_time ? new Date(b.created_time).getTime() : 0;
      return timeA - timeB;
    });
  }, [todos]);

  // 更新目标进度
  useEffect(() => {
    const newProgress = progress;
    const newCompletedTasks = todos.filter(todo => todo.completed).length;
    const newTotalTasks = todos.length;

    if (
      goal.progress !== newProgress ||
      goal.completed_tasks !== newCompletedTasks ||
      goal.total_tasks !== newTotalTasks
    ) {
      onUpdateGoal({
        ...goal,
        progress: newProgress,
        completed_tasks: newCompletedTasks,
        total_tasks: newTotalTasks
      });
    }
  }, [goal, progress, todos, onUpdateGoal]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragState({ draggedIndex: index, dragOverIndex: null });
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragState(prev => ({ ...prev, dragOverIndex: index }));
  };

  const handleDragLeave = () => {
    setDragState(prev => ({ ...prev, dragOverIndex: null }));
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const { draggedIndex } = dragState;
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDragState({ draggedIndex: null, dragOverIndex: null });
      return;
    }

    // 重新排序任务
    const reorderedTodos = [...sortedTodos];
    const draggedTodo = reorderedTodos[draggedIndex];
    reorderedTodos.splice(draggedIndex, 1);
    reorderedTodos.splice(dropIndex, 0, draggedTodo);

    // 更新排序权重
    reorderedTodos.forEach((todo, index) => {
      const updatedTodo = { ...todo, sort_weight: index };
      onUpdateTodo(updatedTodo);
    });

    setDragState({ draggedIndex: null, dragOverIndex: null });
  };

  const handleDragEnd = () => {
    setDragState({ draggedIndex: null, dragOverIndex: null });
  };

  const handleToggleTodo = (todo: Todo) => {
    onUpdateTodo({ ...todo, completed: !todo.completed });
  };

  const handleDeleteTodo = (todoId: string) => {
    if (window.confirm('确定要删除这个任务吗？')) {
      onDeleteTodo(todoId);
    }
  };


  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'bg-green-500';
    if (progress >= 75) return 'bg-blue-500';
    if (progress >= 50) return 'bg-yellow-500';
    if (progress >= 25) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const getDueDateStatus = (dueDate?: string | null) => {
    if (!dueDate) return null;
    
    const date = new Date(dueDate);
    const now = new Date();
    const diffTime = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return { text: `逾期${Math.abs(diffDays)}天`, color: 'text-red-600' };
    if (diffDays === 0) return { text: '今天到期', color: 'text-orange-600' };
    if (diffDays <= 3) return { text: `${diffDays}天后到期`, color: 'text-orange-600' };
    return { text: `${diffDays}天后到期`, color: 'text-gray-600' };
  };

  if (loading) {
    return (
        <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
          <div className="animate-pulse">
            <div className="h-16 bg-gray-200 border-b"></div>
            <div className="p-6 space-y-4">
              <div className="h-8 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-2 bg-gray-200 rounded"></div>
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-12 bg-gray-200 rounded"></div>
                ))}
              </div>
            </div>
          </div>
        </div>
    );
  }

  const dueDateStatus = getDueDateStatus(goal.due_date);

  return (
    <div>
      <div className="max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* 头部信息已移到 GoalHeader 组件中处理 */}

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* 目标信息 */}
          <div className="mb-8">
            {goal.description && (
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">描述</h3>
                <p className="text-gray-700 leading-relaxed">{goal.description}</p>
              </div>
            )}

            {/* 进度展示 */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-gray-900">进度</h3>
                <span className="text-2xl font-bold text-gray-900">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-300 ${getProgressColor(progress)}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-2 text-sm text-gray-600">
                <span>{todos.filter(todo => todo.completed).length} / {todos.length} 任务已完成</span>
                {progress === 100 && (
                  <span className="text-green-600 font-medium">🎉 目标已完成！</span>
                )}
              </div>
            </div>

            {/* 日期信息 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="font-medium text-gray-700">开始日期：</span>
                <span className="text-gray-600">
                  {goal.start_date ? formatDate(goal.start_date) : '未设置'}
                </span>
              </div>
              <div>
                <span className="font-medium text-gray-700">截止日期：</span>
                <span className={dueDateStatus ? dueDateStatus.color : 'text-gray-600'}>
                  {goal.due_date ? formatDate(goal.due_date) : '未设置'}
                </span>
              </div>
            </div>
          </div>

          {/* 关联任务列表 */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">关联任务</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddTask(true)}
                  className="px-3 py-1 text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  + 添加任务
                </button>
                <span className="text-sm text-gray-500">拖拽任务可重新排序</span>
              </div>
            </div>

            {sortedTodos.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-gray-400 text-4xl mb-2">📝</div>
                <p className="text-gray-500">暂无关联任务</p>
                <p className="text-gray-400 text-sm mt-1">在目标管理中添加任务来跟踪进度</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sortedTodos.map((todo, index) => (
                  <div
                    key={todo.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`
                      flex items-center gap-3 p-4 bg-white border rounded-lg cursor-move transition-all
                      ${dragState.draggedIndex === index ? 'opacity-50 scale-95' : ''}
                      ${dragState.dragOverIndex === index ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}
                      hover:shadow-md hover:border-gray-300
                      ${todo.completed ? 'bg-gray-50' : ''}
                    `}
                  >
                    {/* 拖拽手柄 */}
                    <div className="text-gray-400 cursor-move">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                      </svg>
                    </div>

                    {/* 完成状态按钮 */}
                    <button
                      onClick={() => handleToggleTodo(todo)}
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
                      {todo.due_date && (
                        <div className="text-xs text-gray-500 mt-1">
                          截止：{formatDate(todo.due_date)}
                        </div>
                      )}
                    </div>

                    {/* 优先级标识 */}
                    {todo.priority > 0 && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        P{todo.priority}
                      </span>
                    )}

                    {/* 编辑按钮已移除，使用任务模态框进行编辑 */}

                    {/* 删除按钮 */}
                    <button
                      onClick={() => handleDeleteTodo(todo.id)}
                      className="p-1 text-gray-400 hover:text-red-600 transition-colors"
                      title="删除任务"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 任务表单模态框 */}
      {showAddTask && (
        <TodoModal
          mode="create"
          lists={lists}
          goals={goals} // 传入所有目标
          goalId={goal.id}
          onClose={() => setShowAddTask(false)}
          onSubmit={(todoData) => {
            // 处理任务创建逻辑
            const newTodo: Omit<Todo, 'id' | 'created_time'> = {
              title: todoData.title,
              completed: false,
              deleted: false,
              sort_order: todos.length,
              due_date: todoData.due_date,
              content: todoData.content,
              tags: todoData.tags,
              priority: todoData.priority,
              start_date: todoData.start_date,
              list_id: todoData.list_id,
              goal_id: goal.id,
              completed_time: null,
              // 重复任务相关字段
              repeat: todoData.repeat,
              reminder: todoData.reminder,
              is_recurring: todoData.is_recurring,
              recurring_parent_id: todoData.recurring_parent_id,
              instance_number: todoData.instance_number,
              next_due_date: todoData.next_due_date,
            };
            onCreateTodo(newTodo);
            setShowAddTask(false);
          }}
        />
      )}
      
      {editingTask && (
        <TodoModal
          mode="edit"
          lists={lists}
          initialData={editingTask}
          onClose={() => setEditingTask(null)}
          onSubmit={(updatedTodo) => {
            onUpdateTodo(updatedTodo);
            setEditingTask(null);
          }}
          onDelete={(todoId) => {
            onDeleteTodo(todoId);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
};

export default GoalDetails;