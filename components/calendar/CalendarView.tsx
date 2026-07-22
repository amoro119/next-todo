'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { CalendarDays, ChevronLeft, ChevronRight, Plus, X } from 'lucide-react'
import { toast } from 'sonner'
import type { Todo } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsDesktopLayout } from '@/lib/hooks/useIsDesktopLayout'
import { dbUTCToDisplayDate, localDateToDbUTC } from '@/lib/utils/dateUtils'

type CalendarMode = 'month' | 'week'

export type CalendarDragPayload =
  | { origin: 'drawer'; todoId: string }
  | { origin: 'calendar'; todoId: string; sourceDate: string }

interface CalendarViewProps {
  todos: Todo[]
  currentDate: Date
  selectedTodoId?: string | null
  onDateChange: (newDate: Date) => void
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => Promise<void>
  onOpenModal: (todo: Todo) => void
  onAddTodo: (date: string) => void
  onOpenCreateModal?: (date: string) => void
  onCloseTodoDetails?: () => void
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const CALENDAR_DRAG_MIME = 'application/x-next-todo-calendar'

function todoDates(todo: Todo) {
  const start = dbUTCToDisplayDate(todo.start_date || todo.due_date)
  const end = dbUTCToDisplayDate(todo.due_date || todo.start_date) || start
  return { start, end: end && start && end < start ? start : end }
}

function datesBetween(start: string, end: string) {
  if (!start || !end) return []
  const result: string[] = []
  let cursor = parseISO(start)
  const finish = parseISO(end)
  while (cursor <= finish) {
    result.push(format(cursor, 'yyyy-MM-dd'))
    cursor = addDays(cursor, 1)
  }
  return result
}

export function segmentTodosByDate(todos: Todo[], visibleDates: string[]) {
  const map: Record<string, Todo[]> = Object.fromEntries(visibleDates.map((date) => [date, []]))
  for (const todo of todos) {
    if (todo.deleted) continue
    const { start, end } = todoDates(todo)
    for (const date of datesBetween(start, end)) {
      if (map[date]) map[date].push(todo)
    }
  }
  Object.values(map).forEach((items) => {
    items.sort(
      (a, b) =>
        Number(a.completed) - Number(b.completed) ||
        (b.priority ?? 0) - (a.priority ?? 0)
    )
  })
  return map
}

export function groupTodosForSchedule(todos: Todo[]) {
  const active = todos.filter((todo) => !todo.completed && !todo.deleted)
  const unscheduled = active
    .filter((todo) => !todo.due_date)
    .sort(
      (a, b) =>
        (b.priority ?? 0) - (a.priority ?? 0) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        String(b.created_time ?? '').localeCompare(String(a.created_time ?? ''))
    )
  const scheduled = active
    .filter((todo) => !!todo.due_date)
    .sort(
      (a, b) =>
        String(a.due_date).localeCompare(String(b.due_date)) ||
        (b.priority ?? 0) - (a.priority ?? 0) ||
        (a.sort_order ?? 0) - (b.sort_order ?? 0)
    )

  return { unscheduled, scheduled }
}

export function scheduleTodoForDate(targetDate: string): Pick<Todo, 'start_date' | 'due_date'> {
  const date = localDateToDbUTC(targetDate)
  return { start_date: date, due_date: date }
}

export function shiftTodo(todo: Todo, sourceDate: string, targetDate: string) {
  const delta = differenceInCalendarDays(parseISO(targetDate), parseISO(sourceDate))
  const { start, end } = todoDates(todo)
  const nextStart = format(addDays(parseISO(start || targetDate), delta), 'yyyy-MM-dd')
  const nextEnd = format(addDays(parseISO(end || nextStart), delta), 'yyyy-MM-dd')
  return {
    start_date: localDateToDbUTC(nextStart),
    due_date: localDateToDbUTC(nextEnd),
  }
}

function readDragPayload(event: React.DragEvent<HTMLElement>): CalendarDragPayload | null {
  try {
    const raw = event.dataTransfer.getData(CALENDAR_DRAG_MIME) || event.dataTransfer.getData('text/plain')
    const payload = JSON.parse(raw) as Partial<CalendarDragPayload>
    if (!payload.todoId || (payload.origin !== 'drawer' && payload.origin !== 'calendar')) return null
    if (payload.origin === 'calendar' && !('sourceDate' in payload && payload.sourceDate)) return null
    return payload as CalendarDragPayload
  } catch {
    return null
  }
}

interface CalendarHeaderProps {
  currentDate: Date
  mode: CalendarMode
  isDesktop: boolean
  isScheduleOpen: boolean
  onDateChange: (date: Date) => void
  onGoToToday: () => void
  onModeChange: (mode: CalendarMode) => void
  onToggleSchedule: () => void
}

function CalendarHeader({
  currentDate,
  mode,
  isDesktop,
  isScheduleOpen,
  onDateChange,
  onGoToToday,
  onModeChange,
  onToggleSchedule,
}: CalendarHeaderProps) {
  const shift = (amount: number) => {
    onDateChange(mode === 'month' ? addMonths(currentDate, amount) : addWeeks(currentDate, amount))
  }

  const navigationLabel = mode === 'month' ? ['上个月', '下个月'] : ['上一周', '下一周']

  return (
    <header className="mb-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div className="flex items-center justify-between gap-2 sm:justify-start">
        <Button type="button" variant="ghost" size={isDesktop ? 'icon' : 'mobileIcon'} onClick={() => shift(-1)} aria-label={navigationLabel[0]}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="min-w-[156px] px-2 text-center sm:text-left">
          <h1 className="text-base font-semibold text-foreground">{format(currentDate, 'yyyy 年 MM 月')}</h1>
        </div>
        <Button type="button" variant="ghost" size={isDesktop ? 'icon' : 'mobileIcon'} onClick={() => shift(1)} aria-label={navigationLabel[1]}>
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 sm:mt-0 sm:justify-end">
        <Button type="button" variant="outline" size="sm" className={isDesktop ? undefined : 'h-11'} onClick={onGoToToday}>
          今天
        </Button>
        {isDesktop && (
          <Tabs value={mode} onValueChange={(value) => onModeChange(value as CalendarMode)}>
            <TabsList className="shadow-none" aria-label="日历视图">
              <TabsTrigger className="text-xs data-[state=active]:shadow-none" value="month">月</TabsTrigger>
              <TabsTrigger className="text-xs data-[state=active]:shadow-none" value="week">周</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        <Button
          type="button"
          variant={isScheduleOpen ? 'secondary' : 'outline'}
          size="sm"
          className="hidden lg:inline-flex"
          aria-expanded={isScheduleOpen}
          aria-controls="calendar-schedule-drawer"
          onClick={onToggleSchedule}
        >
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          日程安排
        </Button>
      </div>
    </header>
  )
}

interface TodoPillProps {
  todo: Todo
  selected?: boolean
  onOpen: (todo: Todo) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, todo: Todo) => void
  onDragEnd: () => void
}

function TodoPill({ todo, selected, onOpen, onDragStart, onDragEnd }: TodoPillProps) {
  const stateClassName = todo.completed
    ? selected
      ? 'bg-[#fbdda6] font-normal text-[oklch(var(--calendar-task-completed-foreground))] line-through hover:bg-[#fbdda6]'
      : 'bg-[oklch(var(--calendar-task-completed-bg))] font-normal text-[oklch(var(--calendar-task-completed-foreground))] line-through hover:bg-[oklch(var(--calendar-task-completed-hover))]'
    : selected
      ? 'bg-[#fbdda6] font-medium text-[oklch(var(--calendar-task-open-foreground))] hover:bg-[#fbdda6]'
      : 'bg-[oklch(var(--calendar-task-open-bg))] font-medium text-[oklch(var(--calendar-task-open-foreground))] hover:bg-[oklch(var(--calendar-task-open-hover))]'

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => onDragStart(event, todo)}
      onDragEnd={onDragEnd}
      onClick={(event) => {
        event.stopPropagation()
        onOpen(todo)
      }}
      className={`block min-h-7 w-full cursor-grab truncate rounded-[4px] px-2 py-1 text-left text-xs transition-[background-color,color,opacity] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${stateClassName}`}
      aria-label={`${todo.completed ? '已完成' : '未完成'}任务：${todo.title}`}
      aria-pressed={selected}
    >
      {todo.list_name && <span className="mr-1 opacity-70">[{todo.list_name}]</span>}
      {todo.title}
    </button>
  )
}

interface DayCellProps {
  date: Date
  todos: Todo[]
  selectedTodoId?: string | null
  isCurrentMonth?: boolean
  selected?: boolean
  isDropTarget?: boolean
  hasKeyboardTask?: boolean
  onActivate: (date: Date) => void
  onOpenTodo: (todo: Todo) => void
  onCreate: (date: string) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, todo: Todo, sourceDate: string) => void
  onDragEnd: () => void
  onDragOverDate: (date: string | null) => void
  onDrop: (event: React.DragEvent<HTMLElement>, targetDate: string) => void
}

function DayCell({
  date,
  todos,
  selectedTodoId,
  isCurrentMonth = true,
  selected,
  isDropTarget,
  hasKeyboardTask,
  onActivate,
  onOpenTodo,
  onCreate,
  onDragStart,
  onDragEnd,
  onDragOverDate,
  onDrop,
}: DayCellProps) {
  const dateString = format(date, 'yyyy-MM-dd')
  const dayStateClassName = isCurrentMonth
    ? 'bg-[var(--calendar-current-month-bg)]'
    : 'bg-[var(--calendar-other-month-bg)] text-muted-foreground'
  const dateMarkerClassName = selected
    ? 'bg-[oklch(var(--foreground))] text-[oklch(var(--background))]'
    : isToday(date)
      ? 'text-foreground ring-1 ring-inset ring-foreground'
      : isCurrentMonth
        ? 'text-foreground hover:bg-muted'
        : 'text-muted-foreground hover:bg-muted'

  return (
    <div
      role="gridcell"
      aria-selected={selected}
      aria-label={`${dateString}${hasKeyboardTask ? '，按回车将所选任务安排到此日期' : ''}`}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onActivate(date)
        }
      }}
      onClick={() => onActivate(date)}
      onDragOver={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        onDragOverDate(dateString)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        onDragOverDate(null)
      }}
      onDrop={(event) => onDrop(event, dateString)}
      data-calendar-today={isToday(date) && isCurrentMonth ? 'true' : undefined}
      className={`group min-h-[112px] p-2 text-left transition-[background-color,box-shadow] focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${dayStateClassName} ${isDropTarget ? 'z-10 bg-[oklch(var(--accent))] shadow-[inset_0_0_0_1px_oklch(var(--muted-foreground)/0.24)]' : ''} ${hasKeyboardTask ? 'cursor-copy' : ''}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-medium transition-colors ${dateMarkerClassName}`}
          onClick={(event) => {
            event.stopPropagation()
            onActivate(date)
          }}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={`${hasKeyboardTask ? '安排到' : '选择'} ${dateString}`}
          aria-current={isToday(date) ? 'date' : undefined}
        >
          {format(date, 'd')}
        </button>
        {isCurrentMonth && !hasKeyboardTask && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            aria-label={`在 ${dateString} 创建任务`}
            onClick={(event) => {
              event.stopPropagation()
              onCreate(dateString)
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        )}
      </div>
      <div className={`space-y-1 ${isCurrentMonth ? '' : 'opacity-50'}`} aria-label={`${dateString} 的任务`}>
        {todos.map((todo) => (
          <TodoPill
            key={todo.id}
            todo={todo}
            selected={todo.id === selectedTodoId}
            onOpen={onOpenTodo}
            onDragStart={(event, item) => onDragStart(event, item, dateString)}
            onDragEnd={onDragEnd}
          />
        ))}
      </div>
    </div>
  )
}

interface DaySchedulePanelProps {
  selectedDate: Date
  todos: Todo[]
  selectedTodoId?: string | null
  isDropTarget: boolean
  onOpenTodo: (todo: Todo) => void
  onCreate: (date: string) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, todo: Todo, sourceDate: string) => void
  onDragEnd: () => void
  onDragOverDate: (date: string | null) => void
  onDrop: (event: React.DragEvent<HTMLElement>, targetDate: string) => void
}

function DaySchedulePanel({ selectedDate, todos, selectedTodoId, isDropTarget, onOpenTodo, onCreate, onDragStart, onDragEnd, onDragOverDate, onDrop }: DaySchedulePanelProps) {
  const dateString = format(selectedDate, 'yyyy-MM-dd')
  return (
    <section
      className={`rounded-lg bg-muted/20 p-4 transition-[background-color,box-shadow] sm:p-5 ${isDropTarget ? 'bg-[oklch(var(--accent))] shadow-[inset_0_0_0_1px_oklch(var(--muted-foreground)/0.24)]' : ''}`}
      data-calendar-today={isToday(selectedDate) ? 'true' : undefined}
      onDragOver={(event) => {
        event.preventDefault()
        onDragOverDate(dateString)
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        onDragOverDate(null)
      }}
      onDrop={(event) => onDrop(event, dateString)}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{format(selectedDate, 'M月d日')} 的任务</h2>
          <p className="mt-1 text-xs text-muted-foreground">{todos.length ? `${todos.length} 项任务` : '安排今天的下一步'}</p>
        </div>
        <Button type="button" size="sm" className="h-11 md:h-8" onClick={() => onCreate(dateString)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          添加任务
        </Button>
      </div>
      {todos.length ? (
        <div className="space-y-2">
          {todos.map((todo) => (
            <TodoPill
              key={todo.id}
              todo={todo}
              selected={todo.id === selectedTodoId}
              onOpen={onOpenTodo}
              onDragStart={(event, item) => onDragStart(event, item, dateString)}
              onDragEnd={onDragEnd}
            />
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onCreate(dateString)}
          className="min-h-28 w-full rounded-md border border-dashed border-[oklch(var(--border))] px-4 py-8 text-sm text-muted-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          这一天还没有任务，添加第一项
        </button>
      )}
    </section>
  )
}

function WeekView({
  currentDate,
  selectedDate,
  todosByDate,
  dragOverDate,
  selectedTodoId,
  hasKeyboardTask,
  onActivate,
  onOpenTodo,
  onCreate,
  onDragStart,
  onDragEnd,
  onDragOverDate,
  onDrop,
}: Omit<React.ComponentProps<typeof DayCell>, 'date' | 'todos' | 'isCurrentMonth' | 'selected' | 'isDropTarget'> & {
  currentDate: Date
  selectedDate: Date
  todosByDate: Record<string, Todo[]>
  dragOverDate: string | null
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(currentDate, { weekStartsOn: 0 }), index))
  const selectedDateString = format(selectedDate, 'yyyy-MM-dd')
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-1 rounded-lg border border-[oklch(var(--border))] bg-muted/30 p-1" role="grid" aria-label="周视图">
        {days.map((day) => {
          const dateString = format(day, 'yyyy-MM-dd')
          const isActiveDropTarget = dragOverDate === dateString
          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => onActivate(day)}
              onKeyDown={(event) => {
                if ((event.key === 'Enter' || event.key === ' ') && hasKeyboardTask) {
                  event.preventDefault()
                  onActivate(day)
                }
              }}
              onDragOver={(event) => {
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                onDragOverDate(dateString)
              }}
              onDragLeave={() => onDragOverDate(null)}
              onDrop={(event) => onDrop(event, dateString)}
              data-calendar-today={isToday(day) ? 'true' : undefined}
              aria-pressed={isSameDay(day, selectedDate)}
              aria-label={`${hasKeyboardTask ? '安排到' : '选择'} ${dateString}`}
              className={`min-h-11 rounded-md px-1 py-2 text-xs transition-[background-color,box-shadow,color] [&_span]:pointer-events-none ${isSameDay(day, selectedDate) ? 'bg-[oklch(var(--foreground))] text-[oklch(var(--background))]' : 'text-muted-foreground hover:bg-muted hover:text-foreground'} ${isActiveDropTarget ? '!bg-[oklch(var(--accent))] !text-[oklch(var(--foreground))] shadow-[inset_0_0_0_1px_oklch(var(--muted-foreground)/0.24)]' : ''} ${hasKeyboardTask ? 'cursor-copy' : ''}`}
            >
              <span className="block">{WEEKDAYS[day.getDay()]}</span>
              <span className="mt-0.5 block font-semibold">{format(day, 'd')}</span>
            </button>
          )
        })}
      </div>
      <DaySchedulePanel
        selectedDate={selectedDate}
        todos={todosByDate[selectedDateString] || []}
        selectedTodoId={selectedTodoId}
        isDropTarget={dragOverDate === selectedDateString}
        onOpenTodo={onOpenTodo}
        onCreate={onCreate}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragOverDate={onDragOverDate}
        onDrop={onDrop}
      />
    </div>
  )
}

interface ScheduleTaskRowProps {
  todo: Todo
  selected: boolean
  dragging: boolean
  onOpen: (todo: Todo) => void
  onSelectForKeyboard: (todo: Todo) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, todo: Todo) => void
  onDragEnd: () => void
}

function ScheduleTaskRow({ todo, selected, dragging, onOpen, onSelectForKeyboard, onDragStart, onDragEnd }: ScheduleTaskRowProps) {
  const dueDate = dbUTCToDisplayDate(todo.due_date)
  return (
    <button
      type="button"
      draggable
      aria-pressed={selected}
      aria-label={`${todo.title}${dueDate ? `，截止 ${dueDate}` : '，未安排'}；按回车选择日期`}
      onDragStart={(event) => onDragStart(event, todo)}
      onDragEnd={onDragEnd}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        onSelectForKeyboard(todo)
      }}
      onClick={() => onOpen(todo)}
      className={`group flex w-full cursor-grab items-start rounded-md border px-3 py-2.5 text-left transition-[background-color,border-color,opacity] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${selected ? 'border-foreground bg-accent' : 'border-[oklch(var(--border))] bg-background hover:bg-muted/60'} ${dragging ? 'opacity-45' : ''}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{todo.title}</span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {todo.list_name && <span className="truncate">{todo.list_name}</span>}
          <span>{dueDate ? `截止 ${format(parseISO(dueDate), 'M月d日')}` : '未设置截止日'}</span>
        </span>
      </span>
    </button>
  )
}

interface ScheduleGroupProps extends Omit<ScheduleTaskRowProps, 'todo' | 'selected' | 'dragging'> {
  title: string
  emptyText: string
  todos: Todo[]
  keyboardTaskId: string | null
  draggingTaskId: string | null
}

function ScheduleGroup({ title, emptyText, todos, keyboardTaskId, draggingTaskId, ...rowProps }: ScheduleGroupProps) {
  return (
    <section aria-labelledby={`schedule-group-${title}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 id={`schedule-group-${title}`} className="text-xs font-semibold text-foreground">{title}</h3>
        <span className="text-xs tabular-nums text-muted-foreground">{todos.length}</span>
      </div>
      {todos.length ? (
        <div className="space-y-2">
          {todos.map((todo) => (
            <ScheduleTaskRow
              key={todo.id}
              todo={todo}
              selected={keyboardTaskId === todo.id}
              dragging={draggingTaskId === todo.id}
              {...rowProps}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-md border border-dashed border-[oklch(var(--border))] px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>
      )}
    </section>
  )
}

interface ScheduleDrawerProps {
  todos: Todo[]
  reducedMotion: boolean
  keyboardTaskId: string | null
  draggingTaskId: string | null
  onClose: () => void
  onOpenTodo: (todo: Todo) => void
  onSelectForKeyboard: (todo: Todo) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, todo: Todo) => void
  onDragEnd: () => void
}

function ScheduleDrawer({ todos, reducedMotion, keyboardTaskId, draggingTaskId, onClose, onOpenTodo, onSelectForKeyboard, onDragStart, onDragEnd }: ScheduleDrawerProps) {
  const { unscheduled, scheduled } = useMemo(() => groupTodosForSchedule(todos), [todos])
  const total = unscheduled.length + scheduled.length

  return (
    <motion.aside
      id="calendar-schedule-drawer"
      role="complementary"
      aria-label="日程安排"
      initial={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reducedMotion ? { opacity: 0 } : { opacity: 0, x: 24 }}
      transition={{ duration: reducedMotion ? 0.1 : 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="hidden h-full w-[360px] shrink-0 flex-col border-l border-[oklch(var(--border))] bg-background lg:flex"
    >
      <header className="flex shrink-0 items-start justify-between gap-3 border-b border-[oklch(var(--border))] px-4 py-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">日程安排</h2>
          <p className="mt-1 text-xs text-muted-foreground">拖到日历设置截止日 · {total} 项未完成</p>
        </div>
        <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-2 h-9 w-9" onClick={onClose} aria-label="关闭日程安排">
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </header>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
        {total === 0 ? (
          <div className="rounded-lg border border-dashed border-[oklch(var(--border))] px-4 py-10 text-center">
            <p className="text-sm font-medium text-foreground">所有任务都已完成</p>
            <p className="mt-1 text-xs text-muted-foreground">新增任务后会出现在这里。</p>
          </div>
        ) : (
          <>
            <ScheduleGroup
              title="未安排"
              emptyText="没有待安排的任务"
              todos={unscheduled}
              keyboardTaskId={keyboardTaskId}
              draggingTaskId={draggingTaskId}
              onOpen={onOpenTodo}
              onSelectForKeyboard={onSelectForKeyboard}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
            <ScheduleGroup
              title="已安排"
              emptyText="还没有已安排的任务"
              todos={scheduled}
              keyboardTaskId={keyboardTaskId}
              draggingTaskId={draggingTaskId}
              onOpen={onOpenTodo}
              onSelectForKeyboard={onSelectForKeyboard}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            />
          </>
        )}
      </div>
    </motion.aside>
  )
}

export default function CalendarView({
  todos,
  currentDate,
  selectedTodoId,
  onDateChange,
  onUpdateTodo,
  onOpenModal,
  onAddTodo,
  onOpenCreateModal,
  onCloseTodoDetails,
}: CalendarViewProps) {
  const isDesktop = useIsDesktopLayout()
  const prefersReducedMotion = useReducedMotion()
  const [mode, setMode] = useState<CalendarMode>('month')
  const [selectedDate, setSelectedDate] = useState(currentDate)
  const [dragState, setDragState] = useState<CalendarDragPayload | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [keyboardTaskId, setKeyboardTaskId] = useState<string | null>(null)
  const [isScheduleOpen, setIsScheduleOpen] = useState(false)
  const [todayFocusRequest, setTodayFocusRequest] = useState(0)
  const [isCalendarScrolled, setIsCalendarScrolled] = useState(false)
  const calendarRef = useRef<HTMLElement>(null)

  useEffect(() => setMode(isDesktop ? 'month' : 'week'), [isDesktop])
  useEffect(() => setSelectedDate(currentDate), [currentDate])

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)')
    const handleChange = () => {
      if (mediaQuery.matches) return
      setIsScheduleOpen(false)
      setKeyboardTaskId(null)
    }
    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    if (!isScheduleOpen) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if (keyboardTaskId) setKeyboardTaskId(null)
      else setIsScheduleOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isScheduleOpen, keyboardTaskId])

  useEffect(() => {
    if (!todayFocusRequest) return
    const timeoutId = window.setTimeout(() => {
      const todayElement = calendarRef.current?.querySelector<HTMLElement>('[data-calendar-today="true"]')
      todayElement?.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'center', inline: 'nearest' })
      setTodayFocusRequest(0)
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [currentDate, mode, prefersReducedMotion, todayFocusRequest])

  const selectDate = useCallback((date: Date) => {
    setSelectedDate(date)
    onDateChange(date)
  }, [onDateChange])

  const goToToday = useCallback(() => {
    const today = new Date()
    setSelectedDate(today)
    setTodayFocusRequest((request) => request + 1)
    onDateChange(today)
  }, [onDateChange])

  const createTodo = useCallback((date: string) => {
    onOpenCreateModal?.(date)
    if (!onOpenCreateModal) onAddTodo(date)
  }, [onAddTodo, onOpenCreateModal])

  const handleCalendarScroll = useCallback((event: React.UIEvent<HTMLElement>) => {
    const nextScrolled = event.currentTarget.scrollTop > 0
    setIsCalendarScrolled((current) => current === nextScrolled ? current : nextScrolled)
  }, [])

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 })
    return Array.from({ length: differenceInCalendarDays(end, start) + 1 }, (_, index) => addDays(start, index))
  }, [currentDate])
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(currentDate, { weekStartsOn: 0 }), index)),
    [currentDate]
  )
  const visibleDates = mode === 'month' ? monthDays : weekDays
  const todosByDate = useMemo(
    () => segmentTodosByDate(todos, visibleDates.map((day) => format(day, 'yyyy-MM-dd'))),
    [todos, visibleDates]
  )

  const applyDrop = useCallback(async (payload: CalendarDragPayload, targetDate: string) => {
    const todo = todos.find((item) => item.id === payload.todoId)
    if (!todo) return
    try {
      const updates = payload.origin === 'drawer'
        ? scheduleTodoForDate(targetDate)
        : shiftTodo(todo, payload.sourceDate, targetDate)
      await onUpdateTodo(todo.id, updates)
    } catch (error) {
      toast.error('安排任务失败', {
        description: error instanceof Error ? error.message : '请稍后重试',
      })
    }
  }, [onUpdateTodo, todos])

  const handleDrop = useCallback((event: React.DragEvent<HTMLElement>, targetDate: string) => {
    event.preventDefault()
    const payload = dragState || readDragPayload(event)
    setDragOverDate(null)
    setDragState(null)
    if (payload) void applyDrop(payload, targetDate)
  }, [applyDrop, dragState])

  const handleCalendarDragStart = useCallback((event: React.DragEvent<HTMLButtonElement>, todo: Todo, sourceDate: string) => {
    const payload: CalendarDragPayload = { origin: 'calendar', todoId: todo.id, sourceDate }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(CALENDAR_DRAG_MIME, JSON.stringify(payload))
    event.dataTransfer.setData('text/plain', JSON.stringify(payload))
    setDragState(payload)
  }, [])

  const handleDrawerDragStart = useCallback((event: React.DragEvent<HTMLButtonElement>, todo: Todo) => {
    const payload: CalendarDragPayload = { origin: 'drawer', todoId: todo.id }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(CALENDAR_DRAG_MIME, JSON.stringify(payload))
    event.dataTransfer.setData('text/plain', JSON.stringify(payload))
    setKeyboardTaskId(null)
    setDragState(payload)
  }, [])

  const clearDragState = useCallback(() => {
    setDragState(null)
    setDragOverDate(null)
  }, [])

  const activateDate = useCallback((date: Date) => {
    const targetDate = format(date, 'yyyy-MM-dd')
    if (keyboardTaskId) {
      void applyDrop({ origin: 'drawer', todoId: keyboardTaskId }, targetDate)
      setKeyboardTaskId(null)
      setSelectedDate(date)
      onDateChange(date)
      return
    }
    selectDate(date)
  }, [applyDrop, keyboardTaskId, onDateChange, selectDate])

  const openTodo = useCallback((todo: Todo) => {
    setIsScheduleOpen(false)
    setKeyboardTaskId(null)
    onOpenModal(todo)
  }, [onOpenModal])

  const toggleSchedule = useCallback(() => {
    setIsScheduleOpen((isOpen) => {
      if (!isOpen) onCloseTodoDetails?.()
      return !isOpen
    })
    setKeyboardTaskId(null)
  }, [onCloseTodoDetails])

  const sharedDayProps = {
    selectedTodoId,
    onActivate: activateDate,
    onOpenTodo: openTodo,
    onCreate: createTodo,
    onDragStart: handleCalendarDragStart,
    onDragEnd: clearDragState,
    onDragOverDate: setDragOverDate,
    onDrop: handleDrop,
    hasKeyboardTask: !!keyboardTaskId,
  }

  return (
    <div className="flex h-full min-h-0 w-full overflow-hidden bg-background">
      <main ref={calendarRef} onScroll={handleCalendarScroll} className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-background px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
        <div className="mx-auto w-full">
          <div className="-mx-4 sticky top-0 z-30 flex flex-col bg-background/95 px-4 pt-4 backdrop-blur-sm sm:-mx-6 sm:px-6 sm:pt-5 lg:-mx-8 lg:px-8">
            <CalendarHeader
              currentDate={currentDate}
              mode={mode}
              isDesktop={isDesktop}
              isScheduleOpen={isScheduleOpen}
              onDateChange={selectDate}
              onGoToToday={goToToday}
              onModeChange={setMode}
              onToggleSchedule={toggleSchedule}
            />

            {mode === 'month' && (
              <div className={`grid grid-cols-7 border-b bg-muted/30 ${isCalendarScrolled ? 'border-[oklch(var(--border))]' : 'border-transparent'}`} role="row">
                {WEEKDAYS.map((day) => (
                  <div key={day} role="columnheader" className="py-2 text-center text-xs font-medium text-muted-foreground">{day}</div>
                ))}
              </div>
            )}
          </div>

          {mode === 'month' && (
            <>
              <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-lg border border-[oklch(var(--border))] bg-[oklch(var(--border))]" role="grid" aria-label="月视图">
                {monthDays.map((day) => {
                  const dateString = format(day, 'yyyy-MM-dd')
                  return (
                    <DayCell
                      key={day.toISOString()}
                      date={day}
                      todos={todosByDate[dateString] || []}
                      isCurrentMonth={isSameMonth(day, currentDate)}
                      selected={isSameDay(day, selectedDate)}
                      isDropTarget={dragOverDate === dateString}
                      {...sharedDayProps}
                    />
                  )
                })}
              </div>
            </>
          )}

          {mode === 'week' && (
            <WeekView
              currentDate={currentDate}
              selectedDate={selectedDate}
              todosByDate={todosByDate}
              dragOverDate={dragOverDate}
              {...sharedDayProps}
            />
          )}
        </div>
      </main>

      <AnimatePresence initial={false}>
        {isScheduleOpen && (
          <ScheduleDrawer
            todos={todos}
            reducedMotion={!!prefersReducedMotion}
            keyboardTaskId={keyboardTaskId}
            draggingTaskId={dragState?.origin === 'drawer' ? dragState.todoId : null}
            onClose={() => {
              setIsScheduleOpen(false)
              setKeyboardTaskId(null)
            }}
            onOpenTodo={openTodo}
            onSelectForKeyboard={(todo) => setKeyboardTaskId((current) => current === todo.id ? null : todo.id)}
            onDragStart={handleDrawerDragStart}
            onDragEnd={clearDragState}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
