'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Check, GripVertical, Link2, ListChecks, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import type { Goal, Todo, List } from '@/lib/types'
import TodoModal from '@/components/TodoModal'
import AssociateTaskModal from './AssociateTaskModal'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/utils/dateUtils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

interface GoalDetailsProps {
  goal: Goal
  todos: Todo[]
  goals: Goal[]
  lists: List[]
  onUpdateGoal: (goal: Goal) => void
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => void
  onDeleteTodo: (todoId: string) => void
  onCreateTodo: (todo: Omit<Todo, 'id' | 'created_time'>) => void
  onAssociateTasks: (taskIds: string[], goalId: string) => void
  onClose: () => void
  loading?: boolean
}

const priorityLabel = (priority: number) => ['无优先级', '低', '中', '高'][priority] ?? '无优先级'

export default function GoalDetails({ goal, todos, goals, lists, onUpdateTodo, onDeleteTodo, onCreateTodo, onAssociateTasks, loading = false }: GoalDetailsProps) {
  const [localTodos, setLocalTodos] = useState(todos)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [showAddTask, setShowAddTask] = useState(false)
  const [showAssociateTask, setShowAssociateTask] = useState(false)
  const [editingTask, setEditingTask] = useState<Todo | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Todo | null>(null)

  useEffect(() => setLocalTodos(todos), [todos])

  const sortedTodos = useMemo(() => [...localTodos].filter((todo) => !todo.deleted).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1
    return (a.sort_order_in_goal ?? a.sort_order ?? 0) - (b.sort_order_in_goal ?? b.sort_order ?? 0)
  }), [localTodos])

  const completedCount = sortedTodos.filter((todo) => todo.completed).length
  const progress = sortedTodos.length ? Math.round((completedCount / sortedTodos.length) * 100) : 0
  const dueDateText = goal.due_date ? formatDate(goal.due_date, { year: 'numeric', month: 'short', day: 'numeric' }) : '未设置'

  const persistOrder = useCallback((ordered: Todo[]) => {
    setLocalTodos(ordered.map((todo, index) => ({ ...todo, sort_order_in_goal: index })))
    void Promise.all(ordered.map((todo, index) => onUpdateTodo(todo.id, { sort_order_in_goal: index, modified: new Date().toISOString() })))
  }, [onUpdateTodo])

  const moveTask = useCallback((index: number, direction: -1 | 1) => {
    const nextIndex = index + direction
    if (nextIndex < 0 || nextIndex >= sortedTodos.length) return
    const ordered = [...sortedTodos]
    const [item] = ordered.splice(index, 1)
    ordered.splice(nextIndex, 0, item)
    persistOrder(ordered)
  }, [persistOrder, sortedTodos])

  const handleDrop = useCallback((targetId: string) => {
    if (!draggedId || draggedId === targetId) return setDraggedId(null)
    const ordered = [...sortedTodos]
    const from = ordered.findIndex((todo) => todo.id === draggedId)
    const to = ordered.findIndex((todo) => todo.id === targetId)
    if (from < 0 || to < 0) return setDraggedId(null)
    const [item] = ordered.splice(from, 1)
    ordered.splice(to, 0, item)
    persistOrder(ordered)
    setDraggedId(null)
    setDragOverId(null)
  }, [draggedId, persistOrder, sortedTodos])

  const toggleTodo = (todo: Todo) => {
    const updates = { completed: !todo.completed, completed_time: todo.completed ? null : new Date().toISOString() }
    setLocalTodos((items) => items.map((item) => item.id === todo.id ? { ...item, ...updates } : item))
    onUpdateTodo(todo.id, updates)
  }

  if (loading) return <div className="space-y-4 p-4"><div className="h-24 animate-pulse rounded-lg bg-muted" /><div className="h-64 animate-pulse rounded-lg bg-muted" /></div>

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="space-y-6 pb-2">
        <section className="rounded-lg border border-border bg-card p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              {goal.description ? <p className="max-w-2xl text-sm leading-6 text-muted-foreground">{goal.description}</p> : <p className="text-sm text-muted-foreground">暂未添加目标说明</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-muted px-2 py-1">{completedCount}/{sortedTodos.length} 项任务</span>
                <span className="rounded-full bg-muted px-2 py-1">截止 {dueDateText}</span>
                {goal.priority > 0 && <span className="rounded-full bg-muted px-2 py-1">{priorityLabel(goal.priority)}优先级</span>}
              </div>
            </div>
            <div className="text-right"><div className="text-2xl font-semibold tracking-tight text-foreground">{progress}%</div><div className="text-xs text-muted-foreground">完成度</div></div>
          </div>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-[oklch(var(--border))]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="目标完成度"><div className="h-full rounded-full bg-[oklch(var(--primary))] transition-[width] duration-300" style={{ width: `${progress}%` }} /></div>
          {progress === 100 && <p className="mt-3 text-xs font-medium text-foreground">目标已完成</p>}
        </section>

        <section>
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h2 className="text-sm font-semibold text-foreground">任务与步骤</h2><p className="mt-1 text-xs text-muted-foreground">拖动排序，也可以用上下按钮调整顺序</p></div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setShowAddTask(true)}><Plus className="h-4 w-4" aria-hidden="true" />添加任务</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setShowAssociateTask(true)}><Link2 className="h-4 w-4" aria-hidden="true" />关联任务</Button>
            </div>
          </div>

          {!sortedTodos.length ? (
            <div className="rounded-lg border border-dashed border-border py-12 text-center"><ListChecks className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" /><p className="mt-3 text-sm text-muted-foreground">还没有关联任务</p><p className="mt-1 text-xs text-muted-foreground">添加任务后，目标进度会自动更新</p></div>
          ) : (
            <div className="space-y-2" role="list" aria-label="目标任务">
              {sortedTodos.map((todo, index) => (
                <div key={todo.id} role="listitem" draggable onDragStart={() => setDraggedId(todo.id)} onDragEnd={() => { setDraggedId(null); setDragOverId(null) }} onDragOver={(event) => { event.preventDefault(); setDragOverId(todo.id) }} onDrop={() => handleDrop(todo.id)} className={`flex items-center gap-2 rounded-lg border border-border bg-card p-3 transition-colors ${dragOverId === todo.id ? 'border-foreground bg-muted/50' : ''} ${draggedId === todo.id ? 'opacity-50' : ''}`}>
                  <span className="hidden text-muted-foreground sm:inline" aria-hidden="true"><GripVertical className="h-4 w-4" /></span>
                  <button type="button" role="checkbox" aria-checked={todo.completed} aria-label={todo.completed ? `标记 ${todo.title} 为未完成` : `标记 ${todo.title} 为完成`} onClick={() => toggleTodo(todo)} className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${todo.completed ? 'border-foreground bg-foreground text-background' : 'border-border bg-background hover:border-foreground'}`}>{todo.completed && <Check className="h-3.5 w-3.5" aria-hidden="true" />}</button>
                  <button type="button" className={`min-w-0 flex-1 truncate text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${todo.completed ? 'text-muted-foreground line-through' : 'text-foreground'}`} onClick={() => setEditingTask(todo)}>{todo.title}<span className="ml-2 text-xs text-muted-foreground">{todo.due_date ? formatDate(todo.due_date, { month: 'short', day: 'numeric' }) : ''}</span></button>
                  <div className="hidden shrink-0 items-center gap-0.5 sm:flex"><Button type="button" variant="ghost" size="icon" aria-label="上移任务" disabled={index === 0} onClick={() => moveTask(index, -1)}><ArrowUp className="h-3.5 w-3.5" aria-hidden="true" /></Button><Button type="button" variant="ghost" size="icon" aria-label="下移任务" disabled={index === sortedTodos.length - 1} onClick={() => moveTask(index, 1)}><ArrowDown className="h-3.5 w-3.5" aria-hidden="true" /></Button><Button type="button" variant="ghost" size="icon" aria-label={`删除任务 ${todo.title}`} onClick={() => setDeleteTarget(todo)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /></Button></div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="shrink-0 sm:hidden" aria-label={`打开任务 ${todo.title} 的操作菜单`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={index === 0} onSelect={() => moveTask(index, -1)}><ArrowUp className="mr-2 h-4 w-4" aria-hidden="true" />上移</DropdownMenuItem>
                      <DropdownMenuItem disabled={index === sortedTodos.length - 1} onSelect={() => moveTask(index, 1)}><ArrowDown className="mr-2 h-4 w-4" aria-hidden="true" />下移</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(todo)}><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />删除</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {showAddTask && <TodoModal isOpen mode="create" lists={lists} goals={goals} goalId={goal.id} onClose={() => setShowAddTask(false)} onSubmit={(data) => { onCreateTodo({ title: data.title, completed: false, deleted: false, sort_order: todos.length, due_date: data.due_date, content: data.content, tags: data.tags, priority: data.priority, start_date: data.start_date, list_id: data.list_id, goal_id: goal.id, completed_time: null, repeat: data.repeat, reminder: data.reminder, is_recurring: data.is_recurring, recurring_parent_id: data.recurring_parent_id, instance_number: data.instance_number, next_due_date: data.next_due_date }); setShowAddTask(false) }} />}
      {showAssociateTask && <AssociateTaskModal isOpen onClose={() => setShowAssociateTask(false)} onAssociateTasks={onAssociateTasks} goalId={goal.id} existingTaskIds={todos.map((todo) => todo.id)} />}
      {editingTask && <TodoModal isOpen mode="edit" lists={lists} goals={goals} goalId={goal.id} initialData={editingTask} onClose={() => setEditingTask(null)} onSubmit={(updated) => { const { id, ...rawUpdates } = updated; const updates = Object.fromEntries(Object.entries(rawUpdates).filter(([key]) => key !== 'list_name' && key !== 'goal_name')) as Partial<Todo>; void onUpdateTodo(id, updates); setEditingTask(null) }} onDelete={(id) => { onDeleteTodo(id); setEditingTask(null) }} />}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>删除任务？</AlertDialogTitle><AlertDialogDescription>“{deleteTarget?.title}”将从任务列表中删除，此操作无法撤销。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteTarget) { setLocalTodos((items) => items.filter((item) => item.id !== deleteTarget.id)); onDeleteTodo(deleteTarget.id) } setDeleteTarget(null) }}>删除</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
