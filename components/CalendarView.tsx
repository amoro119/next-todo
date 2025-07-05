// components/CalendarView.tsx
"use client";

import { useMemo } from 'react';
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

// 辅助函数：将 UTC 时间戳字符串转换为 UTC+8 时区的本地日期字符串 (YYYY-MM-DD)
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  if (!utcDate) return '';
  try {
    const date = new Date(utcDate);
    // 检查日期是否有效
    if (isNaN(date.getTime())) {
      const dateOnlyMatch = utcDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) {
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
    return formatter.format(date);
  } catch (e) {
    console.error("Error formatting date:", utcDate, e);
    return '';
  }
};

// 辅助函数：将本地日期字符串 (YYYY-MM-DD) 转换为代表该日 UTC+8 时区最后一刻的 UTC 时间戳
const localDateToEndOfDayUTC = (localDate: string | null | undefined): string | null => {
  if (!localDate || !/^\d{4}-\d{2}-\d{2}$/.test(localDate)) return null;
  try {
    const dateInUTC8 = new Date(`${localDate}T23:59:59.999+08:00`);
    return dateInUTC8.toISOString();
  } catch (e) {
    console.error("Error converting date to UTC:", localDate, e);
    return null;
  }
};

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
    const map: Record<string, Todo[]> = {};
    calendarDays.forEach(day => {
      map[day.date] = [];
    });

    todos.forEach(todo => {
      if (!todo.start_date && !todo.due_date) return;
      
      const sDateStr = utcToLocalDateString(todo.start_date);
      const dDateStr = utcToLocalDateString(todo.due_date);
      
      const sDate = sDateStr ? parseISO(sDateStr) : null;
      const dDate = dDateStr ? parseISO(dDateStr) : null;

      // 统一处理，确定一个有效的开始和结束日期
      let startDate = sDate || dDate;
      let endDate = dDate || sDate;
      
      if (!startDate || !endDate) return; // 如果没有有效日期则跳过

      // 保证 startDate 在 endDate 之前
      if (startDate > endDate) {
        [startDate, endDate] = [endDate, startDate];
      }

      // 优化：如果整个待办事项的日期范围完全在可见日历之外，则提前跳过
      if (endDate < visibleInterval.start || startDate > visibleInterval.end) {
        return;
      }

      // 计算待办事项日期范围与可见日历范围的交集
      const iterStart = max([startDate, visibleInterval.start]);
      const iterEnd = min([endDate, visibleInterval.end]);

      // 遍历交集中的每一天，并将待办事项添加到对应的日期中
      const daysInRange = eachDayOfInterval({ start: iterStart, end: iterEnd });
      daysInRange.forEach(day => {
        const dateStr = format(day, 'yyyy-MM-dd');
        if (map[dateStr]) {
          map[dateStr].push(todo);
        }
      });
    });

    return map;
  }, [todos, calendarDays, visibleInterval]);


  const getTodosForDate = (dateStr: string) => {
    return todosByDate[dateStr] || [];
  };

  const handleDragStart = (e: React.DragEvent<HTMLLIElement>, todoId: string, sourceDate: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify({ todoId, sourceDate }));
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>, dropDateStr: string) => {
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
  };
  
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  return (
    <div className="calendar-view">
      <div className="calendar-header">
        <button onClick={() => onDateChange(subMonths(currentDate, 1))}>{'<'}</button>
        <span>{format(currentDate, 'yyyy 年 MM 月')}</span>
        <button onClick={() => onDateChange(addMonths(currentDate, 1))}>{'>'}</button>
      </div>
      <div className="day-name-grid">
        {['日', '一', '二', '三', '四', '五', '六'].map((day) => (
          <div className="day-name" key={day}>{day}</div>
        ))}
      </div>
      <div className="calendar-grid">
        {calendarDays.map((day) => (
          <div
            key={day.date}
            className={`day-cell ${!day.isCurrentMonth ? 'not-current-month' : ''} ${day.isToday ? 'is-today' : ''}`}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, day.date)}
            onClick={() => day.isCurrentMonth && onAddTodo(day.date)}
          >
            <div className="day-header">
              <span className="day-number">{day.dayOfMonth}</span>
              {day.isCurrentMonth && (
                <button className="add-todo-calendar" onClick={(e) => { e.stopPropagation(); onAddTodo(day.date); }}>+</button>
              )}
            </div>
            <ul className="day-todos">
              {getTodosForDate(day.date).map((todo) => (
                <li
                  key={todo.id}
                  className={`calendar-todo-item ${todo.completed ? 'completed' : ''}`}
                  onClick={(e) => { e.stopPropagation(); onOpenModal(todo); }}
                  draggable="true"
                  onDragStart={(e) => handleDragStart(e, todo.id, day.date)}
                >
                  {todo.list_name && <span className="calendar-todo-list-name">[{todo.list_name}]</span>}
                  {todo.title}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}