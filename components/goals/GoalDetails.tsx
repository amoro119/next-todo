'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Goal, Todo, List } from '@/lib/types';
import TodoModal from '@/components/TodoModal';
import AssociateTaskModal from './AssociateTaskModal';

interface GoalDetailsProps {
  goal: Goal;
  todos: Todo[];
  goals: Goal[];
  lists: List[];
  onUpdateGoal: (goal: Goal) => void;
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => void;
  onDeleteTodo: (todoId: string) => void;
  onCreateTodo: (todo: Omit<Todo, 'id' | 'created_time'>) => void;
  onAssociateTasks: (taskIds: string[], goalId: string) => void;
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
  onUpdateTodo,
  onDeleteTodo,
  onCreateTodo,
  onAssociateTasks,
  loading = false
}) => {
  const [dragState, setDragState] = useState<DragState>({
    draggedIndex: null,
    dragOverIndex: null
  });
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAssociateTask, setShowAssociateTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Todo | null>(null);
  const [localTodos, setLocalTodos] = useState(todos || [])

  useEffect(() => {
    setLocalTodos(todos || [])
  }, [todos])

  const sortedTodos = useMemo(() => {
    // 过滤掉已删除的任务
    const activeTodos = localTodos.filter(todo => !todo.deleted);
    
    return [...activeTodos].sort((a, b) => {
      if (a.completed && !b.completed) {
        return 1
      }
      if (!a.completed && b.completed) {
        return -1
      }
      if (a.completed && b.completed && a.completed_time && b.completed_time) {
        return new Date(b.completed_time).getTime() - new Date(a.completed_time).getTime()
      }
      return (a.sort_order || 0) - (b.sort_order || 0)
    })
  }, [localTodos])

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDragState({ draggedIndex: index, dragOverIndex: null });
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragState(prev => ({ ...prev, dragOverIndex: index }));
  };

  const handleDragLeave = () => {
    setDragState(prev => ({ ...prev, dragOverIndex: null }));
  };

  const handleDrop = useCallback((e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    
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

    // 立即更新本地状态
    const updatedTodos = reorderedTodos.map((todo, index) => ({
      ...todo,
      sort_order_in_goal: index
    }));
    
    // 只有当状态真正改变时才更新本地状态
    const shouldUpdate = JSON.stringify(updatedTodos) !== JSON.stringify(localTodos.length > 0 ? localTodos : todos);
    if (shouldUpdate) {
      setLocalTodos(updatedTodos);
    }

    // 批量更新排序权重到数据库
    Promise.all(reorderedTodos.map((todo, index) => {
      const updates = { 
        sort_order_in_goal: index,
        modified: new Date().toISOString()
      };
      return onUpdateTodo(todo.id, updates);
    })).then(() => {
      // 所有更新完成后，重置拖拽状态
      setDragState({ draggedIndex: null, dragOverIndex: null });
    }).catch(error => {
      console.error('更新任务排序失败:', error);
      // 如果更新失败，恢复本地状态
      setLocalTodos(todos);
      setDragState({ draggedIndex: null, dragOverIndex: null });
    });
  }, [dragState, sortedTodos, onUpdateTodo, todos, localTodos]);

  const handleDragEnd = () => {
    setDragState({ draggedIndex: null, dragOverIndex: null });
  };

  const handleToggleTodo = (todo: Todo) => {
    const newCompletedTime = todo.completed ? null : new Date().toISOString();
    const updates = {
      completed: !todo.completed,
      completed_time: newCompletedTime,
    };

    // Optimistically update local state
    setLocalTodos(prevTodos =>
      prevTodos.map(t =>
        t.id === todo.id ? { ...t, ...updates } : t
      )
    );

    onUpdateTodo(todo.id, updates);
  };

  const handleDeleteTodo = (todoId: string) => {
    if (window.confirm('确定要删除这个任务吗？')) {
      // 从本地状态中移除已删除的任务
      setLocalTodos(prevTodos => 
        prevTodos.filter(todo => todo.id !== todoId)
      );
      onDeleteTodo(todoId);
    }
  };


  const getProgressColor = (progress: number) => {
    if (progress === 100) return 'bg-foreground';
    if (progress >= 75) return 'bg-foreground';
    if (progress >= 50) return 'bg-foreground';
    if (progress >= 25) return 'bg-foreground';
    return 'bg-foreground';
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

  const completedCount = sortedTodos.filter(todo => todo.completed).length;
  const totalCount = sortedTodos.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
                <p className="leading-relaxed text-muted-foreground">📌  {goal.description}</p>
              </div>
            )}

            {/* 进度展示 */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-lg font-semibold text-gray-900">进度</h3>
                <span className="text-2xl font-bold text-gray-900">{progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-300 ${getProgressColor(progress)}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-2 text-sm text-gray-600">
                <span>{completedCount} / {totalCount} 任务已完成</span>
                {progress === 100 && (
                  <span className="text-green-600 font-medium">🎉 目标已完成！</span>
                )}
                <span>
                  <span className="font-medium text-gray-700">截止日期：</span>
                  <span className={dueDateStatus ? dueDateStatus.color : 'text-gray-600'}>
                    {goal.due_date ? formatDate(goal.due_date) : '未设置'}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* 关联任务列表 */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-gray-900">任务/步骤</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowAddTask(true)}
                  className="text-sm bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors"
                >
                  + 添加任务
                </button>
                <button
                  onClick={() => setShowAssociateTask(true)}
                  className="text-sm bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors"
                >
                  关联任务
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
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, index)}
                    onClick={() => setEditingTask(todo)}
                    className={`
                      flex items-center gap-3 p-4 border rounded-lg transition-all duration-200 cursor-pointer
                      ${dragState.draggedIndex === index ? 'opacity-50 scale-95 shadow-lg' : ''}
                      ${dragState.dragOverIndex === index ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-border bg-background'}
                      hover:shadow-md hover:border-border
                      ${todo.completed ? 'opacity-75 bg-muted/30' : ''}
                    `}
                  >
                    {/* 拖拽区域 - 只有这个区域可以拖拽 */}
                    <div
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragEnd={handleDragEnd}
                      className="flex items-center gap-3 flex-1"
                    >
                      {/* 拖拽手柄 */}
                      <div className="text-muted-foreground cursor-move p-1 hover:text-foreground">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                      </div>

                      {/* 完成状态按钮 */}
                      <button
                        className={`flex items-center justify-center border-2 rounded-full shrink-0 transition-all duration-150 w-[22px] h-[22px] ${
                          todo.completed
                            ? "border-primary bg-primary"
                            : "border-border bg-background hover:border-primary"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTodo(todo);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        title={todo.completed ? "标为未完成" : "标为完成"}
                        aria-label={todo.completed ? "标为未完成" : "标为完成"}
                        aria-checked={todo.completed}
                        role="checkbox"
                      >
                        {todo.completed && (
                          <svg viewBox="0 0 12 10" fill="none" className="w-3 h-auto" aria-hidden="true">
                            <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground" />
                          </svg>
                        )}
                      </button>

                      {/* 任务内容 */}
                      <div className="flex-1 min-w-0">
                        <div className={`flex justify-between`}>
                          {todo.title}
                          {todo.due_date && (
                            <span className="text-xs text-muted-foreground mt-1">
                              {formatDate(todo.due_date)}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 优先级标识 */}
                      {todo.priority > 0 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          P{todo.priority}
                        </span>
                      )}
                    </div>

                    {/* 删除按钮 - 在拖拽区域外 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTodo(todo.id);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
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
          isOpen={showAddTask}
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
      
      {showAssociateTask && (
        <AssociateTaskModal
          isOpen={showAssociateTask}
          onClose={() => setShowAssociateTask(false)}
          onAssociateTasks={onAssociateTasks}
          goalId={goal.id}
          existingTaskIds={todos.map(todo => todo.id)}
        />
      )}
      
      {editingTask && (
        <TodoModal
          isOpen={!!editingTask}
          mode="edit"
          lists={lists}
          goals={goals} // 传入所有目标
          goalId={goal.id} // 传入当前目标ID
          initialData={editingTask}
          onClose={() => setEditingTask(null)}
          onSubmit={(updatedTodo) => {
            // 检查任务是否真正发生了变化
            const currentTodo = (localTodos.length > 0 ? localTodos : todos).find(t => t.id === updatedTodo.id);
            const hasChanged = JSON.stringify(currentTodo) !== JSON.stringify(updatedTodo);
            
            // 只有当任务真正发生变化时才更新本地状态
            if (hasChanged) {
              const locallyUpdatableTodo = {
                ...updatedTodo,
                due_date: updatedTodo.due_date ? updatedTodo.due_date.replace(' 160000', 'T16:00:00.000Z') : null,
                start_date: updatedTodo.start_date ? updatedTodo.start_date.replace(' 160000', 'T16:00:00.000Z') : null,
              };

              setLocalTodos(prevTodos => 
                prevTodos.map(todo => 
                  todo.id === updatedTodo.id ? locallyUpdatableTodo : todo
                )
              );
            }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { id, list_name, goal_name, ...updates } = updatedTodo;
            onUpdateTodo(id, updates);
            setEditingTask(null);
          }}
          onDelete={(todoId) => {
            // 从本地状态中移除已删除的任务
            setLocalTodos(prevTodos => 
              prevTodos.filter(todo => todo.id !== todoId)
            );
            onDeleteTodo(todoId);
            setEditingTask(null);
          }}
        />
      )}
    </div>
  );
};

export default GoalDetails;
