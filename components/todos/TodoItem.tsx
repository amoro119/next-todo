'use client'

import { motion } from 'framer-motion'
import { cn } from '@/components/common/cn'
import type { Todo } from '@/lib/types'

interface TodoItemProps {
  todo: Todo
  onToggle: (t: Todo) => Promise<void>
  onDelete: (id: string) => Promise<void>
  onOpen: (t: Todo) => void
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dueDate)
  due.setHours(0, 0, 0, 0)
  return due < today
}

function formatDueDate(dueDate: string): string {
  const d = new Date(dueDate)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function TodoItem({ todo, onToggle, onDelete, onOpen }: TodoItemProps) {
  const overdue = !todo.completed && isOverdue(todo.due_date)

  return (
    <motion.div
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className="overflow-hidden"
    >
    <div className="flex items-center gap-2 sm:gap-3 px-3 py-2.5 sm:px-4 group hover:bg-[oklch(var(--muted)/0.5)] rounded-lg">
      <button
        onClick={() => onToggle(todo)}
        className={cn(
          'flex-shrink-0 w-5 h-5 rounded-full border-2 transition-colors',
          todo.completed
            ? 'bg-[oklch(var(--primary))] border-[oklch(var(--primary))]'
            : 'border-[oklch(var(--muted-foreground))] bg-transparent hover:border-[oklch(var(--primary))]'
        )}
        aria-label={todo.completed ? '标记未完成' : '标记完成'}
      >
        {todo.completed && (
          <svg className="w-full h-full p-0.5 text-white" viewBox="0 0 12 12" fill="none">
            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>

      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onOpen(todo)}
      >
        <span
          className={cn(
            'text-[14px] sm:text-sm block truncate',
            todo.completed
              ? 'line-through text-[oklch(var(--muted-foreground))]'
              : 'text-[oklch(var(--foreground))]'
          )}
        >
          {todo.title}
        </span>
        <div className="flex items-center gap-1.5 mt-0.5">
          {todo.due_date && (
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded',
                overdue
                  ? 'bg-red-100 text-red-600'
                  : 'bg-[oklch(var(--muted))] text-[oklch(var(--muted-foreground))]'
              )}
            >
              {formatDueDate(todo.due_date)}
            </span>
          )}
          {todo.list_name && (
            <span className="text-xs text-[oklch(var(--muted-foreground))] bg-[oklch(var(--muted))] px-1.5 py-0.5 rounded">
              {todo.list_name}
            </span>
          )}
        </div>
      </div>

      <button
        onClick={() => onDelete(todo.id)}
        className="flex-shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-[oklch(var(--muted-foreground))] hover:text-red-500"
        aria-label="删除"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none">
          <path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 9h8l1-9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
    </motion.div>
  )
}
