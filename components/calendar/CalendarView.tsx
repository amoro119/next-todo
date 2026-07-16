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
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { Todo } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsDesktopLayout } from '@/lib/hooks/useIsDesktopLayout'
import { dbUTCToDisplayDate, localDateToDbUTC } from '@/lib/utils/dateUtils'

type CalendarMode = 'month' | 'week' | 'agenda'

interface CalendarViewProps {
  todos: Todo[]
  currentDate: Date
  onDateChange: (newDate: Date) => void
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => Promise<void>
  onOpenModal: (todo: Todo) => void
  onAddTodo: (date: string) => void
  onOpenCreateModal?: (date: string) => void
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

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

function shiftTodo(todo: Todo, sourceDate: string, targetDate: string) {
  const delta = differenceInCalendarDays(parseISO(targetDate), parseISO(sourceDate))
  const { start, end } = todoDates(todo)
  const nextStart = format(addDays(parseISO(start || targetDate), delta), 'yyyy-MM-dd')
  const nextEnd = format(addDays(parseISO(end || nextStart), delta), 'yyyy-MM-dd')
  return {
    start_date: localDateToDbUTC(nextStart),
    due_date: localDateToDbUTC(nextEnd),
  }
}

interface CalendarHeaderProps {
  currentDate: Date
  selectedDate: Date
  mode: CalendarMode
  isDesktop: boolean
  onDateChange: (date: Date) => void
  onGoToToday: () => void
  onModeChange: (mode: CalendarMode) => void
}

function CalendarHeader({
  currentDate,
  selectedDate,
  mode,
  isDesktop,
  onDateChange,
  onGoToToday,
  onModeChange,
}: CalendarHeaderProps) {
  const shift = (amount: number) => {
    const next =
      mode === 'month'
        ? addMonths(currentDate, amount)
        : mode === 'agenda'
          ? addDays(selectedDate, amount)
          : addWeeks(currentDate, amount)
    onDateChange(next)
  }

  const navigationLabel = mode === 'month' ? ['上个月', '下个月'] : mode === 'agenda' ? ['前一天', '后一天'] : ['上一周', '下一周']

  return (
    <header className="mb-4 sm:flex sm:items-center sm:justify-between sm:gap-6">
      <div className="flex items-center justify-between gap-2 sm:justify-start">
        <Button type="button" variant="ghost" size={isDesktop ? 'icon' : 'mobileIcon'} onClick={() => shift(-1)} aria-label={navigationLabel[0]}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <div className="min-w-[156px] px-2 text-center sm:text-left">
          <h1 className="text-base font-semibold text-foreground">
            {format(mode === 'agenda' ? selectedDate : currentDate, 'yyyy 年 MM 月')}
          </h1>
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
              <TabsTrigger className="text-xs data-[state=active]:shadow-none" value="agenda">日程</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>
    </header>
  )
}

interface TodoPillProps {
  todo: Todo
  onOpen: (todo: Todo) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, todo: Todo) => void
}

function TodoPill({ todo, onOpen, onDragStart }: TodoPillProps) {
  const stateClassName = todo.completed
    ? 'bg-[oklch(var(--calendar-task-completed-bg))] font-normal text-[oklch(var(--calendar-task-completed-foreground))] line-through hover:bg-[oklch(var(--calendar-task-completed-hover))]'
    : 'bg-[oklch(var(--calendar-task-open-bg))] font-medium text-[oklch(var(--calendar-task-open-foreground))] hover:bg-[oklch(var(--calendar-task-open-hover))]'

  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => onDragStart(event, todo)}
      onClick={(event) => {
        event.stopPropagation()
        onOpen(todo)
      }}
      className={`block min-h-7 w-full cursor-pointer truncate rounded-[4px] px-2 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${stateClassName}`}
      aria-label={`${todo.completed ? '已完成' : '未完成'}任务：${todo.title}`}
    >
      {todo.list_name && <span className="mr-1 opacity-70">[{todo.list_name}]</span>}
      {todo.title}
    </button>
  )
}

interface DayCellProps {
  date: Date
  todos: Todo[]
  isCurrentMonth?: boolean
  selected?: boolean
  onSelect: (date: Date) => void
  onOpenTodo: (todo: Todo) => void
  onCreate: (date: string) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, todo: Todo, sourceDate: string) => void
  onDrop: (event: React.DragEvent<HTMLElement>, targetDate: string) => void
}

function DayCell({
  date,
  todos,
  isCurrentMonth = true,
  selected,
  onSelect,
  onOpenTodo,
  onCreate,
  onDragStart,
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
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onSelect(date)
        }
      }}
      onClick={() => onSelect(date)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(event, dateString)}
      data-calendar-today={isToday(date) && isCurrentMonth ? 'true' : undefined}
      className={`group min-h-[112px] p-2 text-left transition-colors focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${dayStateClassName}`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1 text-xs font-medium transition-colors ${dateMarkerClassName}`}
          onClick={(event) => {
            event.stopPropagation()
            onSelect(date)
          }}
          onKeyDown={(event) => event.stopPropagation()}
          aria-label={`选择 ${dateString}`}
          aria-current={isToday(date) ? 'date' : undefined}
        >
          {format(date, 'd')}
        </button>
        {isCurrentMonth && (
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
            onOpen={onOpenTodo}
            onDragStart={(event, item) => onDragStart(event, item, dateString)}
          />
        ))}
      </div>
    </div>
  )
}

interface AgendaViewProps {
  selectedDate: Date
  todos: Todo[]
  onOpenTodo: (todo: Todo) => void
  onCreate: (date: string) => void
  onDragStart: (event: React.DragEvent<HTMLButtonElement>, todo: Todo, sourceDate: string) => void
  onDrop: (event: React.DragEvent<HTMLElement>, targetDate: string) => void
}

function AgendaView({ selectedDate, todos, onOpenTodo, onCreate, onDragStart, onDrop }: AgendaViewProps) {
  const dateString = format(selectedDate, 'yyyy-MM-dd')
  return (
    <section
      className="rounded-lg bg-muted/20 p-4 sm:p-5"
      data-calendar-today={isToday(selectedDate) ? 'true' : undefined}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => onDrop(event, dateString)}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{format(selectedDate, 'M月d日')} 的日程</h2>
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
              onOpen={onOpenTodo}
              onDragStart={(event, item) => onDragStart(event, item, dateString)}
            />
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onCreate(dateString)}
          className="min-h-28 w-full rounded-md border border-dashed border-border px-4 py-8 text-sm text-muted-foreground transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
  onSelect,
  onOpenTodo,
  onCreate,
  onDragStart,
  onDrop,
}: Omit<React.ComponentProps<typeof DayCell>, 'date' | 'todos' | 'isCurrentMonth' | 'selected'> & {
  currentDate: Date
  selectedDate: Date
  todosByDate: Record<string, Todo[]>
}) {
  const days = Array.from({ length: 7 }, (_, index) =>
    addDays(startOfWeek(currentDate, { weekStartsOn: 0 }), index)
  )
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-1 rounded-lg border border-border bg-muted/30 p-1" role="grid" aria-label="周视图">
        {days.map((day) => (
          <button
            type="button"
            key={day.toISOString()}
            onClick={() => onSelect(day)}
            data-calendar-today={isToday(day) ? 'true' : undefined}
            aria-pressed={isSameDay(day, selectedDate)}
            className={`min-h-11 rounded-md px-1 py-2 text-xs transition-colors ${isSameDay(day, selectedDate) ? 'bg-[oklch(var(--foreground))] text-[oklch(var(--background))]' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
          >
            <span className="block">{WEEKDAYS[day.getDay()]}</span>
            <span className="mt-0.5 block font-semibold">{format(day, 'd')}</span>
          </button>
        ))}
      </div>
      <AgendaView
        selectedDate={selectedDate}
        todos={todosByDate[format(selectedDate, 'yyyy-MM-dd')] || []}
        onOpenTodo={onOpenTodo}
        onCreate={onCreate}
        onDragStart={onDragStart}
        onDrop={onDrop}
      />
    </div>
  )
}

export default function CalendarView({
  todos,
  currentDate,
  onDateChange,
  onUpdateTodo,
  onOpenModal,
  onAddTodo,
  onOpenCreateModal,
}: CalendarViewProps) {
  const isDesktop = useIsDesktopLayout()
  const [mode, setMode] = useState<CalendarMode>('month')
  const [selectedDate, setSelectedDate] = useState(currentDate)
  const [dragState, setDragState] = useState<{ todoId: string; sourceDate: string } | null>(null)
  const [todayFocusRequest, setTodayFocusRequest] = useState(0)
  const calendarRef = useRef<HTMLElement>(null)
  const effectiveMode = !isDesktop && mode === 'month' ? 'week' : mode

  useEffect(() => setMode(isDesktop ? 'month' : 'week'), [isDesktop])
  useEffect(() => setSelectedDate(currentDate), [currentDate])

  useEffect(() => {
    if (!todayFocusRequest) return

    const timeoutId = window.setTimeout(() => {
      const todayElement = calendarRef.current?.querySelector<HTMLElement>('[data-calendar-today="true"]')
      todayElement?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      setTodayFocusRequest(0)
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [currentDate, effectiveMode, todayFocusRequest])

  const selectDate = useCallback(
    (date: Date) => {
      setSelectedDate(date)
      onDateChange(date)
    },
    [onDateChange]
  )

  const goToToday = useCallback(() => {
    const today = new Date()
    setSelectedDate(today)
    setTodayFocusRequest((request) => request + 1)
    onDateChange(today)
  }, [onDateChange])

  const createTodo = useCallback(
    (date: string) => {
      onOpenCreateModal?.(date)
      if (!onOpenCreateModal) onAddTodo(date)
    },
    [onAddTodo, onOpenCreateModal]
  )

  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 })
    return Array.from({ length: differenceInCalendarDays(end, start) + 1 }, (_, index) => addDays(start, index))
  }, [currentDate])

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(currentDate, { weekStartsOn: 0 }), index)),
    [currentDate]
  )
  const visibleDates = effectiveMode === 'month' ? monthDays : weekDays
  const todosByDate = useMemo(
    () => segmentTodosByDate(todos, visibleDates.map((day) => format(day, 'yyyy-MM-dd'))),
    [todos, visibleDates]
  )

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>, targetDate: string) => {
      event.preventDefault()
      const payload =
        dragState ||
        (() => {
          try {
            return JSON.parse(event.dataTransfer.getData('text/plain'))
          } catch {
            return null
          }
        })()
      if (!payload?.todoId || !payload?.sourceDate) return
      const todo = todos.find((item) => item.id === payload.todoId)
      if (!todo) return
      void onUpdateTodo(todo.id, shiftTodo(todo, payload.sourceDate, targetDate))
      setDragState(null)
    },
    [dragState, onUpdateTodo, todos]
  )

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLButtonElement>, todo: Todo, sourceDate: string) => {
      const payload = { todoId: todo.id, sourceDate }
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', JSON.stringify(payload))
      setDragState(payload)
    },
    []
  )

  const sharedDayProps = {
    onSelect: selectDate,
    onOpenTodo: onOpenModal,
    onCreate: createTodo,
    onDragStart: handleDragStart,
    onDrop: handleDrop,
  }

  const selectedDateTodos = segmentTodosByDate(todos, [format(selectedDate, 'yyyy-MM-dd')])[
    format(selectedDate, 'yyyy-MM-dd')
  ] || []

  return (
    <main ref={calendarRef} className="min-h-full w-full bg-background px-4 py-4 sm:px-6 sm:py-5 lg:px-8">
      <div className="mx-auto w-full">
        <CalendarHeader
          currentDate={currentDate}
          selectedDate={selectedDate}
          mode={effectiveMode}
          isDesktop={isDesktop}
          onDateChange={selectDate}
          onGoToToday={goToToday}
          onModeChange={setMode}
        />

        {!isDesktop && (
          <div className="mb-4 grid grid-cols-2 gap-1 rounded-md bg-muted p-1" aria-label="移动端日历视图">
            <button
              type="button"
              aria-pressed={effectiveMode === 'week'}
              onClick={() => setMode('week')}
              className={`h-10 rounded-[4px] text-xs font-medium transition-colors ${effectiveMode === 'week' ? 'border border-border bg-background text-foreground' : 'border border-transparent text-muted-foreground'}`}
            >
              本周
            </button>
            <button
              type="button"
              aria-pressed={effectiveMode === 'agenda'}
              onClick={() => setMode('agenda')}
              className={`h-10 rounded-[4px] text-xs font-medium transition-colors ${effectiveMode === 'agenda' ? 'border border-border bg-background text-foreground' : 'border border-transparent text-muted-foreground'}`}
            >
              日程
            </button>
          </div>
        )}

        {effectiveMode === 'month' && (
          <>
            <div className="grid grid-cols-7 bg-muted/30" role="row">
              {WEEKDAYS.map((day) => (
                <div key={day} role="columnheader" className="py-2 text-center text-xs font-medium text-muted-foreground">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-b-lg border border-[oklch(var(--border))] bg-[oklch(var(--border))]" role="grid" aria-label="月视图">
              {monthDays.map((day) => (
                <DayCell
                  key={day.toISOString()}
                  date={day}
                  todos={todosByDate[format(day, 'yyyy-MM-dd')] || []}
                  isCurrentMonth={isSameMonth(day, currentDate)}
                  selected={isSameDay(day, selectedDate)}
                  {...sharedDayProps}
                />
              ))}
            </div>
          </>
        )}

        {effectiveMode === 'week' && (
          <WeekView
            currentDate={currentDate}
            selectedDate={selectedDate}
            todosByDate={todosByDate}
            {...sharedDayProps}
          />
        )}

        {effectiveMode === 'agenda' && (
          <AgendaView
            selectedDate={selectedDate}
            todos={selectedDateTodos}
            onOpenTodo={onOpenModal}
            onCreate={createTodo}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />
        )}
      </div>
    </main>
  )
}
