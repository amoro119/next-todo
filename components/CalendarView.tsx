// components/CalendarView.tsx
"use client";

import { useMemo, useCallback, memo, useEffect, useRef } from 'react';
import type { Todo } from '../lib/types';
import { useCalendarPerformanceMonitor, calendarPerfMonitor } from './CalendarPerformanceMonitor';
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

// 优化的高性能缓存系统
class CalendarCache {
  private dateCache = new Map<string, string>();
  private utcDateCache = new Map<string, string | null>();
  private todosByDateCache = new Map<string, Record<string, Todo[]>>();
  private calendarDaysCache = new Map<string, any>();
  private lastTodosHash = '';
  private lastCurrentDateKey = '';

  // 优化的缓存键生成 - 使用哈希而不是拼接所有ID
  private generateTodosHash(todos: Todo[]): string {
    let hash = 0;
    const str = `${todos.length}-${todos.map(t => `${t.id}-${t.start_date}-${t.due_date}-${t.completed}-${t.deleted}`).join(',')}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  private generateDateKey(currentDate: Date): string {
    return `${currentDate.getFullYear()}-${currentDate.getMonth()}`;
  }

  getDateCache(utcDate: string | null | undefined): string {
    if (!utcDate) return '';
    return this.dateCache.get(utcDate) || '';
  }

  setDateCache(utcDate: string, result: string): void {
    // 限制缓存大小
    if (this.dateCache.size > 1000) {
      const firstKey = this.dateCache.keys().next().value;
      this.dateCache.delete(firstKey);
    }
    this.dateCache.set(utcDate, result);
  }

  getUtcDateCache(localDate: string): string | null | undefined {
    return this.utcDateCache.get(localDate);
  }

  setUtcDateCache(localDate: string, result: string | null): void {
    if (this.utcDateCache.size > 100) {
      const firstKey = this.utcDateCache.keys().next().value;
      this.utcDateCache.delete(firstKey);
    }
    this.utcDateCache.set(localDate, result);
  }

  getCalendarDaysCache(currentDate: Date): any {
    const key = this.generateDateKey(currentDate);
    return this.calendarDaysCache.get(key);
  }

  setCalendarDaysCache(currentDate: Date, result: any): void {
    const key = this.generateDateKey(currentDate);
    // 只保留最近3个月的缓存
    if (this.calendarDaysCache.size > 3) {
      const firstKey = this.calendarDaysCache.keys().next().value;
      this.calendarDaysCache.delete(firstKey);
    }
    this.calendarDaysCache.set(key, result);
  }

  getTodosByDateCache(todos: Todo[], currentDate: Date): Record<string, Todo[]> | null {
    const todosHash = this.generateTodosHash(todos);
    const dateKey = this.generateDateKey(currentDate);
    const cacheKey = `${todosHash}-${dateKey}`;
    
    if (todosHash === this.lastTodosHash && dateKey === this.lastCurrentDateKey) {
      return this.todosByDateCache.get(cacheKey) || null;
    }
    return null;
  }

  setTodosByDateCache(todos: Todo[], currentDate: Date, result: Record<string, Todo[]>): void {
    const todosHash = this.generateTodosHash(todos);
    const dateKey = this.generateDateKey(currentDate);
    const cacheKey = `${todosHash}-${dateKey}`;
    
    this.lastTodosHash = todosHash;
    this.lastCurrentDateKey = dateKey;
    
    // 限制缓存大小
    if (this.todosByDateCache.size > 5) {
      const firstKey = this.todosByDateCache.keys().next().value;
      this.todosByDateCache.delete(firstKey);
    }
    this.todosByDateCache.set(cacheKey, result);
  }

  // 智能清除 - 只在必要时清除相关缓存
  clearDateCaches(): void {
    this.dateCache.clear();
    this.utcDateCache.clear();
  }

  clearTodosCaches(): void {
    this.todosByDateCache.clear();
    this.lastTodosHash = '';
  }

  clearAll(): void {
    this.dateCache.clear();
    this.utcDateCache.clear();
    this.todosByDateCache.clear();
    this.calendarDaysCache.clear();
    this.lastTodosHash = '';
    this.lastCurrentDateKey = '';
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

// 优化的日历单元格组件 - 支持虚拟化
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

  // 虚拟化处理 - 限制显示的待办事项数量
  const MAX_VISIBLE_TODOS = 4;
  const visibleTodos = todos.slice(0, MAX_VISIBLE_TODOS);
  const hiddenCount = todos.length - MAX_VISIBLE_TODOS;

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
      <ul className={`day-todos ${todos.length > MAX_VISIBLE_TODOS ? 'has-many-todos' : ''}`}>
        {visibleTodos.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            onClick={handleTodoClick}
            onDragStart={handleTodoDragStart}
          />
        ))}
        {hiddenCount > 0 && (
          <li className="more-todos-indicator" onClick={handleCellClick}>
            +{hiddenCount} 更多...
          </li>
        )}
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
  
  // 性能监控
  useCalendarPerformanceMonitor(todos.length);
  
  // 防抖优化 - 避免频繁的拖拽更新
  const dragTimeoutRef = useRef<NodeJS.Timeout>();
  
  // 优化的日历天数计算 - 使用缓存
  const { calendarDays, visibleInterval } = useMemo(() => {
    const cached = calendarCache.getCalendarDaysCache(currentDate);
    if (cached) return cached;
    
    const start = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
    const days = eachDayOfInterval({ start, end });
    
    const result = {
        calendarDays: days.map((day) => ({
            date: format(day, 'yyyy-MM-dd'),
            dayOfMonth: format(day, 'd'),
            isCurrentMonth: isSameMonth(day, currentDate),
            isToday: isToday(day),
        })),
        visibleInterval: { start, end }
    };
    
    calendarCache.setCalendarDaysCache(currentDate, result);
    return result;
  }, [currentDate]);

  // 优化的待办事项分布计算
  const todosByDate = useMemo(() => {
    // 检查缓存
    const cached = calendarCache.getTodosByDateCache(todos, currentDate);
    if (cached) {
      calendarPerfMonitor.recordCacheHit();
      return cached;
    }
    
    calendarPerfMonitor.recordCacheMiss();
    
    // 预分配map以提高性能
    const map: Record<string, Todo[]> = Object.create(null);
    calendarDays.forEach(day => {
      map[day.date] = [];
    });

    // 优化的过滤和处理
    const validTodos = todos.filter(todo => 
      !todo.deleted && (todo.start_date || todo.due_date)
    );
    
    // 批量处理日期转换以减少重复计算
    const todoDateInfo = validTodos.map(todo => {
      const sDateStr = utcToLocalDateString(todo.start_date);
      const dDateStr = utcToLocalDateString(todo.due_date);
      
      const sDate = sDateStr ? parseISO(sDateStr) : null;
      const dDate = dDateStr ? parseISO(dDateStr) : null;

      let startDate = sDate || dDate;
      let endDate = dDate || sDate;
      
      if (!startDate || !endDate) return null;

      if (startDate > endDate) {
        [startDate, endDate] = [endDate, startDate];
      }

      // 快速跳过不在可见范围内的待办事项
      if (endDate < visibleInterval.start || startDate > visibleInterval.end) {
        return null;
      }

      return {
        todo,
        startDate: max([startDate, visibleInterval.start]),
        endDate: min([endDate, visibleInterval.end])
      };
    }).filter(Boolean);

    // 批量分配待办事项到日期
    todoDateInfo.forEach(({ todo, startDate, endDate }) => {
      const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
      daysInRange.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        if (map[dateStr]) {
          map[dateStr].push(todo);
        }
      });
    });

    // 优化排序 - 使用更高效的排序算法
    const sortTodos = (todos: Todo[]) => {
      return todos.sort((a, b) => {
        // 使用位运算优化比较
        const aCompleted = a.completed ? 1 : 0;
        const bCompleted = b.completed ? 1 : 0;
        if (aCompleted !== bCompleted) {
          return aCompleted - bCompleted;
        }
        return (b.priority || 0) - (a.priority || 0);
      });
    };

    // 批量排序所有日期的待办事项
    Object.keys(map).forEach(dateStr => {
      if (map[dateStr].length > 1) {
        map[dateStr] = sortTodos(map[dateStr]);
      }
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
    
    // 清除之前的防抖定时器
    if (dragTimeoutRef.current) {
      clearTimeout(dragTimeoutRef.current);
    }
    
    // 使用防抖来避免快速拖拽时的多次更新
    dragTimeoutRef.current = setTimeout(() => {
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
    }, 100); // 100ms防抖延迟
  }, [todos, onUpdateTodo]);
  
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  // 智能缓存清除策略
  useEffect(() => {
    // 只在todos变化时清除todos相关缓存
    calendarCache.clearTodosCaches();
  }, [todos]);

  useEffect(() => {
    // 日期变化时不需要清除所有缓存，日期缓存会自动处理
  }, [currentDate]);

  // 清理防抖定时器
  useEffect(() => {
    return () => {
      if (dragTimeoutRef.current) {
        clearTimeout(dragTimeoutRef.current);
      }
    };
  }, []);

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