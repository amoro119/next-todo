'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Goal, Todo, List } from '@/lib/types';
import TodoModal from '@/components/TodoModal';
import AssociateTaskModal from './AssociateTaskModal';
import Image from "next/image";
import { useDebounce } from '@/lib/hooks/useDebounce';

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
  onUpdateGoal,
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
  const [localTodos, setLocalTodos] = useState<Todo[]>([]);

  // 同步props到本地状态，只在todos数组内容发生变化时更新
  useEffect(() => {
    // 只有在任务数量发生变化或任务内容真正改变时才更新本地状态
    if (localTodos.length !== todos.length || 
        JSON.stringify(localTodos.map(t => t.id).sort()) !== JSON.stringify(todos.map(t => t.id).sort())) {
      setLocalTodos(todos);
    }
  }, [todos, localTodos]);

  // 计算目标进度
  const progress = useMemo(() => {
    const todosToUse = localTodos.length > 0 ? localTodos : todos;
    if (todosToUse.length === 0) return 0;
    const completedTodos = todosToUse.filter(todo => todo.completed).length;
    return Math.round((completedTodos / todosToUse.length) * 100);
  }, [localTodos, todos]);

  // 按排序权重排序任务
  const sortedTodos = useMemo(() => {
    const todosToSort = localTodos.length > 0 ? localTodos : todos;
    // 只在开发环境打印日志
    if (process.env.NODE_ENV === 'development') {
        console.log('重新计算排序:', todosToSort.map(t => `${t.title}(${t.sort_order_in_goal})`));
    }
    return [...todosToSort].sort((a, b) => {
      // 优先使用 sort_order_in_goal，如果为 null 则使用 sort_order
      const weightA = a.sort_order_in_goal !== null ? a.sort_order_in_goal : (a.sort_order || 0);
      const weightB = b.sort_order_in_goal !== null ? b.sort_order_in_goal : (b.sort_order || 0);
      if (weightA !== weightB) {
        return weightA - weightB;
      }
      // 如果权重相同，按创建时间排序
      const timeA = a.created_time ? new Date(a.created_time).getTime() : 0;
      const timeB = b.created_time ? new Date(b.created_time).getTime() : 0;
      return timeA - timeB;
    });
  }, [localTodos, todos]);

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
    if (progress === 100) return 'bg-Progress';
    if (progress >= 75) return 'bg-Progress';
    if (progress >= 50) return 'bg-Progress';
    if (progress >= 25) return 'bg-Progress';
    return 'bg-Progress';
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
              <div className="mb-6 goal-description">
                <p className="leading-relaxed">📌  {goal.description}</p>
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
                <span>{todos.filter(todo => todo.completed).length} / {todos.length} 任务已完成</span>
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
                      goals-todo-item flex items-center gap-3 p-4 border rounded-lg transition-all duration-200 cursor-pointer
                      ${dragState.draggedIndex === index ? 'opacity-50 scale-95 shadow-lg' : ''}
                      ${dragState.dragOverIndex === index ? 'border-blue-500 bg-blue-50 shadow-md' : 'border-gray-200 bg-white'}
                      hover:shadow-md hover:border-gray-300
                      ${todo.completed ? 'completed bg-gray-50' : ''}
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
                      <div className="text-gray-400 cursor-move p-1 hover:text-gray-600">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                      </div>

                      {/* 完成状态按钮 */}
                      <button
                        className={`todo-btn goals-todo-btn ${
                          todo.completed ? "btn-unfinish" : "btn-finish"
                        }`}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleTodo(todo);
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        {todo.completed && (
                          <Image
                            src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAyNCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIuMzYzMTcgOS42NzUwNkMxLjU1OTM5IDkuNDc0NDkgMC43NDUyMDQgOS45NjM0OCAwLjU0NDYyOSAxMC43NjczQzAuMzQ0MDU0IDExLjU3MSAwLjgzMzA0NyAxMi4zODUyIDEuNjM2ODMgMTIuNTg1OEwyLjM2MzE3IDkuNjc1MDZaTTguMTU4NzMgMTZMNi43ODA0MSAxNi41OTE4QzcuMDMwOTggMTcuMTc1NCA3LjYyMTk1IDE3LjU1NzkgOC4yNTU3NSAxNy40OTY5QzguODg5NTQgMTcuNDU1OCA5LjQyODc3IDE3LjAyIDkuNjAxOTEgMTYuNDA4OUw4LjE1ODczIDE2Wk0yMi4zMjYxIDMuNDY0MTNDMjMuMTM0NyAzLjI4NDA2IDIzLjY0NDIgMi40ODI1NyAyMy40NjQxIDEuNjczOTVDMjMuMjg0MSAwLjg2NTMyOCAyMi40ODI2IDAuMzU1NzkxIDIxLjY3MzkgMC41MzU4NjZMMjIuMzI2MSAzLjQ2NDEzWk0xLjYzNjgzIDEyLjU4NThDMi4wMjc2NCAxMi42ODMzIDMuMTIyOTkgMTMuMTUxIDQuMjc3OCAxMy45NDI2QzUuNDM5ODggMTQuNzM5MyA2LjM4OTA2IDE1LjY4MDMgNi43ODA0MSAxNi41OTE4TDkuNTM3MDUgMTUuNDA4MkM4LjgxMDk0IDEzLjcxNzEgNy4zMDE1NyAxMi4zNzgzIDUuOTc0MDYgMTEuNDY4MkM0LjYzOTI3IDEwLjU1MzIgMy4yMTM5OSA5Ljg4NzM4IDIuMzYzMTcgOS42NzUwNkwxLjYzNjgzIDEyLjU4NThaTTkuNjAxOTEgMTYuNDA4OUMxMC4xMzU5IDE0LjUyNDQgMTEuNDk0OCAxMS42NTg1IDEzLjY3MjcgOS4wNjM5NUMxNS44NDQ1IDYuNDc2NzUgMTguNzQxNyA0LjI2MjM1IDIyLjMyNjEgMy40NjQxM0wyMS42NzM5IDAuNTM1ODY2QzE3LjI1ODMgMS41MTkyIDEzLjgyNzUgNC4yMTM0MiAxMS4zNzQ5IDcuMTM1MTRDOC45Mjg1MiAxMC4wNDk1IDcuMzY2NzQgMTMuMjkyOSA2LjcxNTU1IDE1LjU5MTFMOS42MDE5MSAxNi40MDg5WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K"
                            alt="标为未完成"
                            className="icon-finish"
                            draggable={false}
                            width={24}
                            height={18}
                          />
                        )}
                      </button>

                      {/* 任务内容 */}
                      <div className="flex-1 min-w-0">
                        <div className={`flex justify-between`}>
                          {todo.title}
                          {todo.due_date && (
                            <span className="text-xs text-gray-500 mt-1 due-date">
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