// components/CalendarView.tsx
"use client";

import { useMemo, useCallback, memo, useEffect } from 'react';
import type { Todo } from '../lib/types';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isToday,
  parseISO,
  addMonths,
  subMonths,
  max,
  min
} from 'date-fns';

interface CalendarViewProps {
  todos: Todo[];
  currentDate: Date;
  onDateChange: (newDate: Date) => void;
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => Promise<void>;
  onOpenModal: (todo: Todo) => void;
  onAddTodo: (date: string) => void;
}

// 高性能缓存系统
class CalendarCache {
  private dateCache = new Map<string, string>();
  private utcDateCache = new Map<string, string | null>();
  private todosByDateCache = new Map<string, Record<string, Todo[]>>();
  private cacheKey = '';

  private generateCacheKey(todos: Todo[], currentDate: Date): string {
    return `${todos.length}-${currentDate.getTime()}-${todos.map(t => t.id).join(',')}`;
  }

  getDateCache(utcDate: string | null | undefined): string {
    if (!utcDate) return '';
    return this.dateCache.get(utcDate) || '';
  }

  setDateCache(utcDate: string, result: string): void {
    this.dateCache.set(utcDate, result);
  }

  getUtcDateCache(localDate: string): string | null | undefined {
    return this.utcDateCache.get(localDate);
  }

  setUtcDateCache(localDate: string, result: string | null): void {
    this.utcDateCache.set(localDate, result);
  }

  getTodosByDateCache(todos: Todo[], currentDate: Date): Record<string, Todo[]> | null {
    const key = this.generateCacheKey(todos, currentDate);
    if (key === this.cacheKey) {
      return this.todosByDateCache.get(key) || null;
    }
    return null;
  }

  setTodosByDateCache(todos: Todo[], currentDate: Date, result: Record<string, Todo[]>): void {
    const key = this.generateCacheKey(todos, currentDate);
    this.cacheKey = key;
    this.todosByDateCache.set(key, result);
  }

  clear(): void {
    this.dateCache.clear();
    this.utcDateCache.clear();
    this.todosByDateCache.clear();
  }
}

// 全局缓存实例
const calendarCache = new CalendarCache();

// 优化的日期转换函数
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  if (!utcDate) return '';
  
  // 检查缓存
  const cached = calendarCache.getDateCache(utcDate);
  if (cached) return cached;
  
  try {
    const date = new Date(utcDate);
    if (isNaN(date.getTime())) {
      const dateOnlyMatch = utcDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) {
        calendarCache.setDateCache(utcDate, utcDate);
        return utcDate;
      }
      return '';
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const result = formatter.format(date);
    calendarCache.setDateCache(utcDate, result);
    return result;
  } catch (e) {
    console.error("Error formatting date:", utcDate, e);
    return '';
  }
};

const localDateToEndOfDayUTC = (localDate: string | null | undefined): string | null => {
  if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  
  // 检查缓存
  const cached = calendarCache.getUtcDateCache(localDate);
  if (cached !== undefined) return cached;
  
  try {
    const dateInUTC8 = new Date(`${localDate}T23:59:59.999+08:00`);
    const result = dateInUTC8.toISOString();
    calendarCache.setUtcDateCache(localDate, result);
    return result;
  } catch (e) {
    console.error("Error converting date to UTC:", localDate, e);
    return null;
  }
};

// 优化的待办事项组件
interface TodoItemProps {
  todo: Todo;
  onClick: (e: React.MouseEvent, todo: Todo) => void;
  onDragStart: (e: React.DragEvent<HTMLLIElement>, todoId: string) => void;
}

const TodoItem = memo<TodoItemProps>(({ todo, onClick, onDragStart }) => {
  const handleClick = useCallback((e: React.MouseEvent) => {
    onClick(e, todo);
  }, [onClick, todo]);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLLIElement>) => {
    onDragStart(e, todo.id);
  }, [onDragStart, todo.id]);

  return (
    <li
      className={`calendar-todo-item ${todo.completed ? 'completed' : ''}`}
      onClick={handleClick}
      draggable="true"
      onDragStart={handleDragStart}
      title={todo.title}
    >
      {todo.list_name && <span className="calendar-todo-list-name">[{todo.list_name}]</span>}
      <span className="todo-title-text">{todo.title}</span>
    </li>
  );
});
TodoItem.displayName = 'TodoItem';

// 优化的日历单元格组件
interface DayCellProps {
  day: {
    date: string;
    dayOfMonth: string;
    isCurrentMonth: boolean;
    isToday: boolean;
  };
  todos: Todo[];
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>, date: string) => void;
  onAddTodo: (date: string) => void;
  onOpenModal: (todo: Todo) => void;
  onDragStart: (e: React.DragEvent<HTMLLIElement>, todoId: string, sourceDate: string) => void;
}

const DayCell = memo<DayCellProps>(({ 
  day, 
  todos, 
  onDragOver, 
  onDrop, 
  onAddTodo, 
  onOpenModal, 
  onDragStart 
}) => {
  const handleAddTodo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAddTodo(day.date);
  }, [day.date, onAddTodo]);

  const handleCellClick = useCallback(() => {
    if (day.isCurrentMonth) {
      onAddTodo(day.date);
    }
  }, [day.isCurrentMonth, day.date, onAddTodo]);

  const handleTodoClick = useCallback((e: React.MouseEvent, todo: Todo) => {
    e.stopPropagation();
    onOpenModal(todo);
  }, [onOpenModal]);

  const handleTodoDragStart = useCallback((e: React.DragEvent<HTMLLIElement>, todoId: string) => {
    onDragStart(e, todoId, day.date);
  }, [day.date, onDragStart]);

  return (
    <div
      className={`day-cell ${!day.isCurrentMonth ? 'not-current-month' : ''} ${day.isToday ? 'is-today' : ''}`}
      onDragOver={onDragOver}
      onDrop={(e) => onDrop(e, day.date)}
      onClick={handleCellClick}
    >
      <div className="day-header">
        <span className="day-number">{day.dayOfMonth}</span>
        {day.isCurrentMonth && (
          <button className="add-todo-calendar" onClick={handleAddTodo}>+</button>
        )}
      </div>
      <ul className="day-todos">
        {todos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onClick={handleTodoClick}
            onDragStart={handleTodoDragStart}
          />
        ))}
      </ul>
    </div>
  );
});
DayCell.displayName = 'DayCell';

// 优化的日历头部组件
interface CalendarHeaderProps {
  currentDate: Date;
  onDateChange: (newDate: Date) => void;
}

const CalendarHeader = memo<CalendarHeaderProps>(({ currentDate, onDateChange }) => {
  const handlePrevMonth = useCallback(() => {
    onDateChange(subMonths(currentDate, 1));
  }, [currentDate, onDateChange]);

  const handleNextMonth = useCallback(() => {
    onDateChange(addMonths(currentDate, 1));
  }, [currentDate, onDateChange]);

  return (
    <div className="calendar-header">
      <button onClick={handlePrevMonth}>{'<'}</button>
      <span>{format(currentDate, 'yyyy 年 MM 月')}</span>
      <button onClick={handleNextMonth}>{'>'}</button>
    </div>
  );
});
CalendarHeader.displayName = 'CalendarHeader';

// 优化的星期标题组件
const WeekDaysHeader = memo(() => (
  <div className="day-name-grid">
    {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
      <div className="day-name" key={day}>{day}</div>
    ))}
  </div>
));
WeekDaysHeader.displayName = 'WeekDaysHeader';

export default function CalendarView({
  todos,
  currentDate,
  onDateChange,
  onUpdateTodo,
  onOpenModal,
  onAddTodo,
}: CalendarViewProps) {
  
  const { calendarDays, visibleInterval } = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start, end });
    return {
        calendarDays: days.map((day) => ({
            date: format(day, 'yyyy-MM-dd'),
            dayOfMonth: format(day, 'd'),
            isCurrentMonth: isSameMonth(day, currentDate),
            isToday: isToday(day),
        })),
        visibleInterval: { start, end }
    };
  }, [currentDate]);

  const todosByDate = useMemo(() => {
    // 检查缓存
    const cached = calendarCache.getTodosByDateCache(todos, currentDate);
    if (cached) return cached;
    
    const map: Record<string, Todo[]> = {};
    calendarDays.forEach(day => {
      map[day.date] = [];
    });

    // 批量处理待办事项，减少循环开销
    const validTodos = todos.filter(todo => todo.start_date || todo.due_date);
    
    validTodos.forEach(todo => {
      const sDateStr = utcToLocalDateString(todo.start_date);
      const dDateStr = utcToLocalDateString(todo.due_date);
      
      const sDate = sDateStr ? parseISO(sDateStr) : null;
      const dDate = dDateStr ? parseISO(dDateStr) : null;

      let startDate = sDate || dDate;
      let endDate = dDate || sDate;
      
      if (!startDate || !endDate) return;

      if (startDate > endDate) {
        [startDate, endDate] = [endDate, startDate];
      }

      // 快速跳过不在可见范围内的待办事项
      if (endDate < visibleInterval.start || startDate > visibleInterval.end) {
        return;
      }

      const iterStart = max([startDate, visibleInterval.start]);
      const iterEnd = min([endDate, visibleInterval.end]);

      const daysInRange = eachDayOfInterval({ start: iterStart, end: iterEnd });
      daysInRange.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        if (map[dateStr]) {
          map[dateStr].push(todo);
        }
      });
    });

    // 缓存结果
    calendarCache.setTodosByDateCache(todos, currentDate, map);
    
    return map;
  }, [todos, calendarDays, visibleInterval, currentDate]);

  const getTodosForDate = useCallback((dateStr: string) => {
    return todosByDate[dateStr] || [];
  }, [todosByDate]);

  const handleDragStart = useCallback((e: React.DragEvent<HTMLLIElement>, todoId: string, sourceDate: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ todoId, sourceDate }));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, dropDateStr: string) => {
    e.preventDefault();
    try {
        const payloadString = e.dataTransfer.getData('application/json');
        if (!payloadString) return;

        const { todoId, sourceDate } = JSON.parse(payloadString);
        if (!todoId) return;

        const todoToUpdate = todos.find(t => t.id === todoId);
        if (!todoToUpdate) return;
        
        const dropDateUTC = localDateToEndOfDayUTC(dropDateStr);
        if (!dropDateUTC) return;

        const isSingleDay = !todoToUpdate.start_date || !todoToUpdate.due_date || todoToUpdate.start_date === todoToUpdate.due_date;

        if (isSingleDay) {
            onUpdateTodo(todoId, { start_date: dropDateUTC, due_date: dropDateUTC });
        } else {
            const isDraggingStartDate = sourceDate === utcToLocalDateString(todoToUpdate.start_date);
            
            if (isDraggingStartDate) {
                const newStartDateUTC = dropDateUTC;
                const dueDateUTC = todoToUpdate.due_date!;
                if (newStartDateUTC > dueDateUTC) {
                    onUpdateTodo(todoId, { start_date: dueDateUTC, due_date: newStartDateUTC });
                } else {
                    onUpdateTodo(todoId, { start_date: newStartDateUTC });
                }
            } else {
                const newDueDateUTC = dropDateUTC;
                const startDateUTC = todoToUpdate.start_date!;
                if (newDueDateUTC < startDateUTC) {
                    onUpdateTodo(todoId, { start_date: newDueDateUTC, due_date: startDateUTC });
                } else {
                    onUpdateTodo(todoId, { due_date: newDueDateUTC });
                }
            }
        }
    } catch (error) {
        console.error("Failed to handle drop event:", error);
    }
  }, [todos, onUpdateTodo]);
  
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  // 清除缓存的副作用
  useEffect(() => {
    // 当 todos 或 currentDate 变化时清除缓存
    calendarCache.clear();
  }, [todos, currentDate]);

  return (
    <div className="calendar-view">
      <CalendarHeader currentDate={currentDate} onDateChange={onDateChange} />
      <WeekDaysHeader />
      <div className="calendar-grid">
        {calendarDays.map((day) => (
          <DayCell
            key={day.date}
            day={day}
            todos={getTodosForDate(day.date)}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onAddTodo={onAddTodo}
            onOpenModal={onOpenModal}
            onDragStart={handleDragStart}
          />
        ))}
      </div>
    </div>
  );
}