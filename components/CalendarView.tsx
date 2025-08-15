// components/CalendarView.tsx
"use client";

import { useMemo, useCallback, memo, useEffect } from 'react';
import type { Todo } from '../lib/types';
import { useCalendarPerformanceMonitor, calendarPerfMonitor } from './CalendarPerformanceMonitor';
import { useOptimizedClick, useOptimizedDrag, useINPMonitoring } from './INPOptimizer';
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
  subMonths
} from 'date-fns';

interface CalendarViewProps {
  todos: Todo[];
  currentDate: Date;
  onDateChange: (newDate: Date) => void;
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => Promise<void>;
  onOpenModal: (todo: Todo) => void;
  onAddTodo: (date: string) => void;
  onOpenCreateModal?: (date: string) => void;
}

// 优化的高性能缓存系统
class CalendarCache {
  private dateCache = new Map<string, string>();
  private utcDateCache = new Map<string, string | null>();
  private todosByDateCache = new Map<string, Record<string, Todo[]>>();
  private calendarDaysCache = new Map<string, { calendarDays: Array<{
    date: string;
    dayOfMonth: string;
    isCurrentMonth: boolean;
    isToday: boolean;
  }>; visibleInterval: { start: Date; end: Date } }>();
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
      if (firstKey) {
        this.dateCache.delete(firstKey);
      }
    }
    this.dateCache.set(utcDate, result);
  }

  getUtcDateCache(localDate: string): string | null | undefined {
    return this.utcDateCache.get(localDate);
  }

  setUtcDateCache(localDate: string, result: string | null): void {
    if (this.utcDateCache.size > 100) {
      const firstKey = this.utcDateCache.keys().next().value;
      if (firstKey) {
        this.utcDateCache.delete(firstKey);
      }
    }
    this.utcDateCache.set(localDate, result);
  }

  getCalendarDaysCache(currentDate: Date): { calendarDays: Array<{
    date: string;
    dayOfMonth: string;
    isCurrentMonth: boolean;
    isToday: boolean;
  }>; visibleInterval: { start: Date; end: Date } } | undefined {
    const key = this.generateDateKey(currentDate);
    return this.calendarDaysCache.get(key);
  }

  setCalendarDaysCache(currentDate: Date, result: { calendarDays: Array<{
    date: string;
    dayOfMonth: string;
    isCurrentMonth: boolean;
    isToday: boolean;
  }>; visibleInterval: { start: Date; end: Date } }): void {
    const key = this.generateDateKey(currentDate);
    // 只保留最近3个月的缓存
    if (this.calendarDaysCache.size > 3) {
      const firstKey = this.calendarDaysCache.keys().next().value;
      if (firstKey) {
        this.calendarDaysCache.delete(firstKey);
      }
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
      if (firstKey) {
        this.todosByDateCache.delete(firstKey);
      }
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

// 优化的日历单元格组件 - 始终显示所有待办事项
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
  onOpenCreateModal?: (date: string) => void;
}

const DayCell = memo<DayCellProps>(({ 
  day, 
  todos, 
  onDragOver, 
  onDrop, 
  onAddTodo, 
  onOpenModal, 
  onDragStart,
  onOpenCreateModal
}) => {
  const handleAddTodo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onOpenCreateModal(day.date);
  }, [day.date, onOpenCreateModal]);

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

  // 移除虚拟化限制，始终显示所有待办事项
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
      <ul className="day-todos show-all">
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
  const handlePrevMonth = useOptimizedClick(() => {
    onDateChange(subMonths(currentDate, 1));
  }, { priority: 'high' });

  const handleNextMonth = useOptimizedClick(() => {
    onDateChange(addMonths(currentDate, 1));
  }, { priority: 'high' });

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
  onOpenCreateModal,
}: CalendarViewProps) {
  
  // 性能监控
  useCalendarPerformanceMonitor(todos.length);
  
  // INP优化
  const { handleDragStart, handleDrop, handleDragOver } = useOptimizedDrag();
  const { startInteraction, endInteraction } = useINPMonitoring('CalendarView');
  
  // 为 onOpenCreateModal 提供默认值
  const handleOpenCreateModal = onOpenCreateModal || (() => {});
  
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

  // 批处理函数 - 提取到外部避免重复创建
  const processTodoBatch = useCallback((
    batch: Todo[], 
    map: Map<string, Todo[]>, 
    visibleInterval: { start: Date; end: Date }
  ) => {
    batch.forEach(todo => {
      const sDateStr = utcToLocalDateString(todo.start_date);
      const dDateStr = utcToLocalDateString(todo.due_date);
      
      // 优化日期解析 - 避免重复创建Date对象
      let startDate: Date | null = null;
      let endDate: Date | null = null;
      
      if (sDateStr) startDate = parseISO(sDateStr);
      if (dDateStr) endDate = parseISO(dDateStr);
      
      if (!startDate && !endDate) return;
      
      startDate = startDate || endDate!;
      endDate = endDate || startDate;

      if (startDate > endDate) {
        [startDate, endDate] = [endDate, startDate];
      }

      // 快速边界检查
      if (endDate < visibleInterval.start || startDate > visibleInterval.end) {
        return;
      }

      // 优化日期范围计算
      const clampedStart = startDate < visibleInterval.start ? visibleInterval.start : startDate;
      const clampedEnd = endDate > visibleInterval.end ? visibleInterval.end : endDate;
      
      const daysInRange = eachDayOfInterval({ start: clampedStart, end: clampedEnd });
      
      // 批量添加到对应日期
      daysInRange.forEach((day: Date) => {
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayTodos = map.get(dateStr);
        if (dayTodos) {
          dayTodos.push(todo);
        }
      });
    });

    // 批量排序 - 使用稳定排序
    map.forEach((todos) => {
      if (todos.length > 1) {
        todos.sort((a, b) => {
          // 优化比较逻辑
          if (a.completed !== b.completed) {
            return a.completed ? 1 : -1;
          }
          return (b.priority || 0) - (a.priority || 0);
        });
      }
    });
  }, []);

  // 高性能待办事项分布计算 - 使用时间切片和批处理
  const todosByDate = useMemo(() => {
    // 检查缓存
    const cached = calendarCache.getTodosByDateCache(todos, currentDate);
    if (cached) {
      calendarPerfMonitor.recordCacheHit();
      return cached;
    }
    
    calendarPerfMonitor.recordCacheMiss();
    
    // 使用Map提升性能，避免原型链查找
    const map = new Map<string, Todo[]>();
    calendarDays.forEach(day => {
      map.set(day.date, []);
    });

    // 预过滤有效待办事项
    const validTodos = todos.filter(todo => 
      !todo.deleted && (todo.start_date || todo.due_date)
    );

    // 直接处理所有待办事项，确保立即显示
    // 对于大数据量，仍然可以考虑优化，但不能影响显示
    processTodoBatch(validTodos, map, visibleInterval);

    // 转换Map为普通对象以保持兼容性
    const result: Record<string, Todo[]> = {};
    map.forEach((todos, date) => {
      result[date] = todos;
    });

    // 缓存结果
    calendarCache.setTodosByDateCache(todos, currentDate, result);
    
    return result;
  }, [todos, calendarDays, visibleInterval, currentDate, processTodoBatch]);

  const getTodosForDate = useCallback((dateStr: string) => {
    const todosForDate = todosByDate[dateStr] || [];
    // 在开发环境下添加调试信息
    if (process.env.NODE_ENV === 'development' && todosForDate.length > 0) {
      console.log(`日期 ${dateStr} 有 ${todosForDate.length} 个任务:`, todosForDate.map(t => t.title));
    }
    return todosForDate;
  }, [todosByDate]);

  const optimizedHandleDragStart = useCallback((e: React.DragEvent<HTMLLIElement>, todoId: string, sourceDate: string) => {
    startInteraction();
    handleDragStart(e, { todoId, sourceDate }, { priority: 'high' });
    endInteraction();
  }, [handleDragStart, startInteraction, endInteraction]);

  const optimizedHandleDrop = useCallback((e: React.DragEvent<HTMLDivElement>, dropDateStr: string) => {
    startInteraction();
    
    handleDrop(e, ({ todoId, sourceDate }) => {
      if (!todoId) return;

      const todoToUpdate = todos.find(t => t.id === todoId);
      if (!todoToUpdate) return;
      
      const dropDateUTC = localDateToEndOfDayUTC(dropDateStr);
      if (!dropDateUTC) return;

      const isSingleDay = !todoToUpdate.start_date || !todoToUpdate.due_date || 
                         todoToUpdate.start_date === todoToUpdate.due_date;

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
    }, { priority: 'normal' });
    
    endInteraction();
  }, [handleDrop, todos, onUpdateTodo, startInteraction, endInteraction]);

  // 智能缓存清除策略
  useEffect(() => {
    // 只在todos变化时清除todos相关缓存
    calendarCache.clearTodosCaches();
    // 在开发环境下添加调试信息
    if (process.env.NODE_ENV === 'development') {
      console.log('日历视图: todos变化，清除缓存', { todosCount: todos.length });
    }
  }, [todos]);

  useEffect(() => {
    // 日期变化时不需要清除所有缓存，日期缓存会自动处理
  }, [currentDate]);

  // 清理资源
  useEffect(() => {
    return () => {
      // 清理缓存等资源
      calendarCache.clearTodosCaches();
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
            onDrop={optimizedHandleDrop}
            onAddTodo={onAddTodo}
            onOpenModal={onOpenModal}
            onDragStart={optimizedHandleDragStart}
            onOpenCreateModal={handleOpenCreateModal}
          />
        ))}
      </div>
    </div>
  );
}