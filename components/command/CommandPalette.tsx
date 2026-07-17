'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CheckCircle2, Circle, Target } from 'lucide-react'
import type { Goal, Todo } from '@/lib/types'
import { cn } from '@/components/common/cn'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command'

export type TodoSearchResult = {
  id: string
  kind: 'todo'
  title: string
  subtitle: string
  targetSection: 'todo'
  todo: Todo
}

export type GoalSearchResult = {
  id: string
  kind: 'goal'
  title: string
  subtitle: string
  targetSection: 'goals'
  goal: Goal
}

export type CommandSearchResult = TodoSearchResult | GoalSearchResult

interface CommandPaletteProps {
  open: boolean
  todos: Todo[]
  goals: Goal[]
  onOpenChange: (open: boolean) => void
  onSelectTodo: (todo: Todo) => void
  onSelectGoal: (goal: Goal) => void
  onToggleTodoComplete?: (todo: Todo) => void | Promise<void>
}

type ResultFilter = 'all' | 'todo' | 'goal'

function normalize(value: string | null | undefined) {
  return (value ?? '').toLowerCase().trim()
}

function matches(query: string, ...fields: Array<string | null | undefined>) {
  if (!query) return true
  return fields.some((field) => normalize(field).includes(query))
}

function getMatchContext(
  query: string,
  title: string | null | undefined,
  candidates: Array<{ label: string; value: string | null | undefined }>
) {
  if (!query || normalize(title).includes(query)) return null

  const candidate = candidates.find(({ value }) => normalize(value).includes(query))
  if (!candidate?.value) return null

  const normalizedValue = candidate.value.toLowerCase()
  const matchIndex = normalizedValue.indexOf(query)
  const start = Math.max(0, matchIndex - 14)
  const end = Math.min(candidate.value.length, start + 52)
  const excerpt = `${start > 0 ? '…' : ''}${candidate.value.slice(start, end)}${end < candidate.value.length ? '…' : ''}`

  return `${candidate.label}：${excerpt}`
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const term = query.trim()
  if (!term) return <>{text}</>

  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escapedTerm})`, 'gi'))

  return (
    <>
      {parts.map((part, index) =>
        part.toLowerCase() === term.toLowerCase() ? (
          <mark key={`${part}-${index}`} className="rounded-sm bg-[oklch(var(--accent))] px-0.5 text-inherit">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  )
}

export function CommandPalette({
  open,
  todos,
  goals,
  onOpenChange,
  onSelectTodo,
  onSelectGoal,
  onToggleTodoComplete,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const lastFocusedElementRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (!open) lastFocusedElementRef.current = document.activeElement as HTMLElement | null
        onOpenChange(!open)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onOpenChange, open])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResultFilter('all')
      window.requestAnimationFrame(() => {
        lastFocusedElementRef.current?.focus?.()
      })
    }
  }, [open])

  const normalizedQuery = normalize(query)

  const todoResults = useMemo<TodoSearchResult[]>(() => {
    return todos
      .filter((todo) => !todo.deleted && matches(normalizedQuery, todo.title, todo.content, todo.tags, todo.list_name))
      .sort((a, b) => Number(a.completed) - Number(b.completed))
      .map((todo) => {
        const matchContext = getMatchContext(normalizedQuery, todo.title, [
          { label: '备注', value: todo.content },
          { label: '标签', value: todo.tags },
        ])

        return {
          id: todo.id,
          kind: 'todo',
          title: todo.title || '未命名任务',
          subtitle: [todo.list_name, todo.completed ? '已完成' : '未完成', matchContext].filter(Boolean).join(' · '),
          targetSection: 'todo',
          todo,
        }
      })
  }, [normalizedQuery, todos])

  const goalResults = useMemo<GoalSearchResult[]>(() => {
    return goals
      .filter((goal) => matches(normalizedQuery, goal.name, goal.description, goal.list_name))
      .map((goal) => {
        const matchContext = getMatchContext(normalizedQuery, goal.name, [
          { label: '描述', value: goal.description },
        ])

        return {
          id: goal.id,
          kind: 'goal',
          title: goal.name || '未命名目标',
          subtitle: [goal.list_name, goal.is_archived ? '已存档' : '进行中', matchContext].filter(Boolean).join(' · '),
          targetSection: 'goals',
          goal,
        }
      })
  }, [goals, normalizedQuery])

  const handleSelect = (result: CommandSearchResult) => {
    onOpenChange(false)
    if (result.kind === 'todo') onSelectTodo(result.todo)
    else onSelectGoal(result.goal)
  }

  const visibleTodoResults = resultFilter === 'goal'
    ? []
    : todoResults.slice(0, resultFilter === 'todo' ? 18 : 10)
  const visibleGoalResults = resultFilter === 'todo'
    ? []
    : goalResults.slice(0, resultFilter === 'goal' ? 18 : 6)
  const visibleResultCount = visibleTodoResults.length + visibleGoalResults.length
  const totalResultCount = todoResults.length + goalResults.length

  const filters: Array<{ value: ResultFilter; label: string; count: number }> = [
    { value: 'all', label: '全部', count: totalResultCount },
    { value: 'todo', label: '待办', count: todoResults.length },
    { value: 'goal', label: '目标', count: goalResults.length },
  ]

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        onClear={() => setQuery('')}
        onClose={() => onOpenChange(false)}
        placeholder="搜索待办、目标、清单或标签..."
        autoFocus
      />

      <div className="flex shrink-0 items-center gap-1 border-b border-[oklch(var(--border))] bg-[oklch(var(--muted)/0.25)] px-3 py-2" role="group" aria-label="搜索结果类型">
        {filters.map((filter) => {
          const isActive = resultFilter === filter.value
          return (
            <button
              key={filter.value}
              type="button"
              aria-pressed={isActive}
              className={cn(
                'inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] sm:h-8',
                isActive
                  ? 'bg-[oklch(var(--foreground))] text-[oklch(var(--background))]'
                  : 'text-[oklch(var(--muted-foreground))] hover:bg-[oklch(var(--accent))] hover:text-[oklch(var(--accent-foreground))]'
              )}
              onPointerDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                setResultFilter(filter.value)
              }}
              onClick={(event) => {
                event.stopPropagation()
                setResultFilter(filter.value)
              }}
            >
              {filter.label}
              <span className={cn('tabular-nums', isActive ? 'opacity-75' : 'opacity-60')}>{filter.count}</span>
            </button>
          )
        })}
      </div>

      <CommandList>
        <CommandEmpty>
          <div className="font-medium text-[oklch(var(--foreground))]">未找到相关内容</div>
          <div className="mt-1 text-xs">尝试更短的关键词，或切换结果类型</div>
        </CommandEmpty>

        {visibleTodoResults.length > 0 && (
          <CommandGroup heading={`待办 · ${todoResults.length}`}>
            {visibleTodoResults.map((result) => (
              <CommandItem
                key={`todo-${result.id}`}
                value={`todo-${result.id}-${result.title}`}
                onSelect={() => handleSelect(result)}
                className="group"
              >
                <button
                  type="button"
                  aria-label={result.todo.completed ? `将“${result.title}”标为未完成` : `完成“${result.title}”`}
                  aria-pressed={result.todo.completed}
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[oklch(var(--muted-foreground))] transition-colors hover:bg-[oklch(var(--background))] hover:text-[oklch(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] sm:h-8 sm:w-8"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) => {
                    event.stopPropagation()
                    void onToggleTodoComplete?.(result.todo)
                  }}
                >
                  {result.todo.completed ? (
                    <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Circle className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className={cn('truncate', result.todo.completed && 'line-through text-[oklch(var(--muted-foreground))]')}>
                    <HighlightedText text={result.title} query={query} />
                  </div>
                  {result.subtitle && <div className="truncate text-xs text-[oklch(var(--muted-foreground))]"><HighlightedText text={result.subtitle} query={query} /></div>}
                </div>
                <CommandShortcut className="opacity-0 transition-opacity group-data-[selected=true]:opacity-100">↵</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {visibleTodoResults.length > 0 && visibleGoalResults.length > 0 && <CommandSeparator />}

        {visibleGoalResults.length > 0 && (
          <CommandGroup heading={`目标 · ${goalResults.length}`}>
            {visibleGoalResults.map((result) => (
              <CommandItem
                key={`goal-${result.id}`}
                value={`goal-${result.id}-${result.title}`}
                onSelect={() => handleSelect(result)}
                className="group"
              >
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center sm:h-8 sm:w-8">
                  <Target className="h-5 w-5 text-[oklch(var(--muted-foreground))]" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate"><HighlightedText text={result.title} query={query} /></div>
                  {result.subtitle && <div className="truncate text-xs text-[oklch(var(--muted-foreground))]"><HighlightedText text={result.subtitle} query={query} /></div>}
                </div>
                <CommandShortcut className="opacity-0 transition-opacity group-data-[selected=true]:opacity-100">↵</CommandShortcut>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>

      <div aria-live="polite" className="flex min-h-10 shrink-0 items-center justify-between gap-4 border-t border-[oklch(var(--border))] bg-[oklch(var(--muted)/0.2)] px-4 py-2 text-[11px] text-[oklch(var(--muted-foreground))]">
        <span>{visibleResultCount < totalResultCount ? `显示 ${visibleResultCount} / ${totalResultCount} 项` : `共 ${totalResultCount} 项`}</span>
        <span className="hidden items-center gap-3 sm:flex">
          <span><kbd>↑↓</kbd> 选择</span>
          <span><kbd>↵</kbd> 打开</span>
          <span><kbd>Esc</kbd> 关闭</span>
        </span>
      </div>
    </CommandDialog>
  )
}
