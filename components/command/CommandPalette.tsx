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
}

function normalize(value: string | null | undefined) {
  return (value ?? '').toLowerCase().trim()
}

function matches(query: string, ...fields: Array<string | null | undefined>) {
  if (!query) return true
  return fields.some((field) => normalize(field).includes(query))
}

export function CommandPalette({
  open,
  todos,
  goals,
  onOpenChange,
  onSelectTodo,
  onSelectGoal,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('')
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
      window.requestAnimationFrame(() => {
        lastFocusedElementRef.current?.focus?.()
      })
    }
  }, [open])

  const normalizedQuery = normalize(query)

  const todoResults = useMemo<TodoSearchResult[]>(() => {
    return todos
      .filter((todo) => !todo.deleted && matches(normalizedQuery, todo.title, todo.content, todo.tags, todo.list_name))
      .slice(0, 12)
      .map((todo) => ({
        id: todo.id,
        kind: 'todo',
        title: todo.title || '未命名任务',
        subtitle: [todo.list_name, todo.completed ? '已完成' : '未完成'].filter(Boolean).join(' · '),
        targetSection: 'todo',
        todo,
      }))
  }, [normalizedQuery, todos])

  const goalResults = useMemo<GoalSearchResult[]>(() => {
    return goals
      .filter((goal) => matches(normalizedQuery, goal.name, goal.description, goal.list_name))
      .slice(0, 12)
      .map((goal) => ({
        id: goal.id,
        kind: 'goal',
        title: goal.name || '未命名目标',
        subtitle: [goal.list_name, goal.is_archived ? '已存档' : '进行中'].filter(Boolean).join(' · '),
        targetSection: 'goals',
        goal,
      }))
  }, [goals, normalizedQuery])

  const handleSelect = (result: CommandSearchResult) => {
    onOpenChange(false)
    if (result.kind === 'todo') onSelectTodo(result.todo)
    else onSelectGoal(result.goal)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput value={query} onValueChange={setQuery} placeholder="搜索待办和目标..." autoFocus />
      <CommandList>
        <CommandEmpty>未找到相关内容</CommandEmpty>

        <CommandGroup heading="待办">
          {todoResults.map((result) => (
            <CommandItem
              key={`todo-${result.id}`}
              value={`todo-${result.id}-${result.title}`}
              onSelect={() => handleSelect(result)}
            >
              {result.todo.completed ? (
                <CheckCircle2 className="h-4 w-4 text-[oklch(var(--muted-foreground))]" />
              ) : (
                <Circle className="h-4 w-4 text-[oklch(var(--muted-foreground))]" />
              )}
              <div className="min-w-0 flex-1">
                <div className={cn('truncate', result.todo.completed && 'line-through text-[oklch(var(--muted-foreground))]')}>
                  {result.title}
                </div>
                {result.subtitle && <div className="truncate text-xs text-[oklch(var(--muted-foreground))]">{result.subtitle}</div>}
              </div>
              <CommandShortcut>待办</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="目标">
          {goalResults.map((result) => (
            <CommandItem
              key={`goal-${result.id}`}
              value={`goal-${result.id}-${result.title}`}
              onSelect={() => handleSelect(result)}
            >
              <Target className="h-4 w-4 text-[oklch(var(--muted-foreground))]" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{result.title}</div>
                {result.subtitle && <div className="truncate text-xs text-[oklch(var(--muted-foreground))]">{result.subtitle}</div>}
              </div>
              <CommandShortcut>目标</CommandShortcut>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
