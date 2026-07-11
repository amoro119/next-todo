'use client'

import { cn } from '@/components/common/cn'
import type { Todo, List } from '@/lib/types'

interface TodoViewOptionsProps {
  lists: List[]
  currentView: string
  setCurrentView: (v: string) => void
  todosByList: Record<string, number>
  uncompletedTodos: Todo[]
  recycledTodos: Todo[]
  todayCount?: number
}

export function TodoViewOptions({
  lists,
  currentView,
  setCurrentView,
  todosByList,
  uncompletedTodos,
  recycledTodos,
  todayCount = 0,
}: TodoViewOptionsProps) {
  const pills = [
    { label: '今天', view: 'today', count: todayCount },
    { label: '收件箱', view: 'inbox', count: uncompletedTodos.length },
    ...lists.map((list) => ({
      label: list.name,
      view: list.name,
      count: todosByList[list.name] ?? 0,
    })),
    { label: '回收站', view: 'recycle', count: recycledTodos.length },
  ]

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
      {pills.map(({ label, view, count }) => (
        <button
          key={view}
          onClick={() => setCurrentView(view)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 px-3 py-1.5 rounded-full text-sm whitespace-nowrap cursor-pointer transition-colors',
            currentView === view
              ? 'bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))]'
              : 'bg-[oklch(var(--muted))] text-[oklch(var(--muted-foreground))]'
          )}
        >
          {label}
          <span className="text-xs opacity-70">{count}</span>
        </button>
      ))}
    </div>
  )
}
