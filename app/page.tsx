// app/page.tsx
"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { useLiveQuery } from "@electric-sql/pglite-react";
import type { Todo, List } from "../lib/types";
import Image from "next/image";
import dynamic from 'next/dynamic';
import debounce from 'lodash.debounce';
import { v4 as uuid } from 'uuid';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { sendChangesToServer, createTodoChange, createListChange, ListChange, TodoChange } from '../lib/changes';
import { parseDidaCsv } from '../lib/csvParser';
import ManageListsModal from "../components/ManageListsModal";
import CalendarView from "../components/CalendarView";
import QuickActions from "../components/QuickActions";
import { ViewSwitcher } from "../components/ViewSwitcher";
import { TodoList } from "../components/TodoList";

// 高性能缓存系统
class DateCache {
  private dateCache = new Map<string, string>();
  private todayCache: { date: string; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 60000; // 1分钟缓存

  getTodayString(): string {
    const now = Date.now();
    if (!this.todayCache || (now - this.todayCache.timestamp) > this.CACHE_DURATION) {
      const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
      this.todayCache = { date: todayStr, timestamp: now };
    }
    return this.todayCache.date;
  }

  getDateCache(utcDate: string | null | undefined): string {
    if (!utcDate) return '';
    return this.dateCache.get(utcDate) || '';
  }

  setDateCache(utcDate: string, result: string): void {
    this.dateCache.set(utcDate, result);
  }

  clear(): void {
    this.dateCache.clear();
    this.todayCache = null;
  }
}

// 全局缓存实例
const dateCache = new DateCache();

const TodoDetailsModal = dynamic(() => import('../components/TodoDetailsModal'), {
  ssr: false,
});

// Helper functions
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  if (!utcDate) return '';
  
  const cached = dateCache.getDateCache(utcDate);
  if (cached) return cached;
  
  try {
    const date = new Date(utcDate);
    if (isNaN(date.getTime())) {
      const dateOnlyMatch = utcDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) {
        dateCache.setDateCache(utcDate, utcDate);
        return utcDate;
      }
      return '';
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const result = formatter.format(date);
    dateCache.setDateCache(utcDate, result);
    return result;
  } catch (e) {
    console.error("Error formatting date:", utcDate, e);
    return '';
  }
};

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

// Type conversion functions
const normalizeTodo = (raw: Record<string, unknown>): Todo => {
  return {
    ...raw,
    completed: raw.completed === true || raw.completed === 'true' || raw.completed === 1 || raw.completed === '1',
    deleted: raw.deleted === true || raw.deleted === 'true' || raw.deleted === 1 || raw.deleted === '1',
    priority: typeof raw.priority === 'string' ? parseInt(raw.priority, 10) : (raw.priority as number) ?? 0,
    sort_order: typeof raw.sort_order === 'string' ? parseInt(raw.sort_order, 10) : (raw.sort_order as number) ?? 0,
  } as Todo;
};

const normalizeList = (raw: Record<string, unknown>): List => {
  return {
    ...raw,
    is_hidden: raw.is_hidden === true || raw.is_hidden === 'true' || raw.is_hidden === 1 || raw.is_hidden === '1',
    sort_order: typeof raw.sort_order === 'string' ? parseInt(raw.sort_order, 10) : (raw.sort_order as number) ?? 0,
  } as List;
};

type LastAction =
  | { type: 'toggle-complete'; data: { id: string; previousCompletedTime: string | null, previousCompleted: boolean } }
  | { type: 'delete'; data: Todo }
  | { type: 'restore'; data: Todo }
  | { type: 'batch-complete'; data: { id: string; previousCompletedTime: string | null, previousCompleted: boolean }[] };

const camelToSnake = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);


export default function TodoListPage() {
  const [slogan, setSlogan] = useState("今日事今日毕，勿将今事待明日!.☕");
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoDate, setNewTodoDate] = useState<string | null>(null);
  const [showManageListsModal, setShowManageListsModal] = useState(false);
  const [currentView, setCurrentView] = useState("list");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const addTodoInputRef = useRef<HTMLInputElement>(null);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [isEditingSlogan, setIsEditingSlogan] = useState(false);
  const [originalSlogan, setOriginalSlogan] = useState("");
  const sloganInputRef = useRef<HTMLInputElement>(null);

  // 1. 所有 hooks 顶层无条件调用
  const todosQuery = useLiveQuery<Todo>(
    `SELECT t.*, l.name as list_name
     FROM todos t
     LEFT JOIN lists l ON t.list_id = l.id
     WHERE t.deleted = false
     ORDER BY t.sort_order, t.created_time DESC`
  );
  const todos = ((todosQuery?.rows as Record<string, unknown>[] | undefined) || []).map(normalizeTodo);

  const listsQuery = useLiveQuery<List>(
    `SELECT id, name, sort_order, is_hidden FROM lists ORDER BY sort_order, name`
  );
  const lists = ((listsQuery?.rows as Record<string, unknown>[] | undefined) || []).map(normalizeList);
  
  const recycledQuery = useLiveQuery<Todo>(
    `SELECT id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id FROM todos WHERE deleted = true`
  );
  const recycledTodos = ((recycledQuery?.rows as Record<string, unknown>[] | undefined) || []).map(normalizeTodo);
  
  const metaQuery = useLiveQuery<{ key: string, value: string }>(
    `SELECT * FROM meta WHERE key = 'slogan'`
  );

  useEffect(() => {
    if (metaQuery && metaQuery.rows && metaQuery.rows[0]?.value) {
      setSlogan(metaQuery.rows[0].value);
    }
  }, [metaQuery?.rows]);

  useEffect(() => {
    if (isEditingSlogan && sloganInputRef.current) {
        sloganInputRef.current.focus();
    }
  }, [isEditingSlogan]);

  // Derived data with useMemo
  const activeTodos = useMemo(() => todos.filter((t: Todo) => !t.deleted), [todos]);
  const uncompletedTodos = useMemo(() => activeTodos.filter((t: Todo) => !t.completed_time), [activeTodos]);
  const todayStrInUTC8 = useMemo(() => dateCache.getTodayString(), []);

  const calendarVisibleTodos = useMemo(() => {
    if (currentView !== 'calendar') return [];
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const viewStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const viewEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return activeTodos.filter((todo: Todo) => {
      if (!todo.start_date && !todo.due_date) return false;
      const todoStartDateStr = utcToLocalDateString(todo.start_date);
      const todoDueDateStr = utcToLocalDateString(todo.due_date);
      if (!todoStartDateStr && !todoDueDateStr) return false;
      const todoStart = todoStartDateStr ? new Date(todoStartDateStr) : new Date(todoDueDateStr!);
      const todoEnd = todoDueDateStr ? new Date(todoDueDateStr) : new Date(todoStartDateStr!);
      const effectiveStart = todoStart < todoEnd ? todoStart : todoEnd;
      const effectiveEnd = todoStart > todoEnd ? todoStart : todoEnd;
      return effectiveStart <= viewEnd && effectiveEnd >= viewStart;
    });
  }, [activeTodos, currentDate, currentView]);

  const listNameToIdMap = useMemo(() => 
    lists.reduce((acc: Record<string, string>, list: List) => {
      acc[list.name] = list.id;
      return acc;
    }, {} as Record<string, string>),
  [lists]);

  const todayTodos = useMemo(() => {
    if (currentView !== 'list') return [];
    return activeTodos.filter((todo: Todo) => {
      if (!todo.due_date) return false;
      const todoDueDateStr = utcToLocalDateString(todo.due_date);
      return todoDueDateStr === todayStrInUTC8;
    });
  }, [activeTodos, currentView, todayStrInUTC8]);

  const inboxTodos = useMemo(() => {
    if (currentView !== 'inbox') return [];
    return uncompletedTodos.filter((todo: Todo) => {
      const todoDueDateStr = todo.due_date ? utcToLocalDateString(todo.due_date) : '';
      const isOverdue = todoDueDateStr && todoDueDateStr < todayStrInUTC8;
      return !todo.list_id || isOverdue;
    });
  }, [uncompletedTodos, currentView, todayStrInUTC8]);

  const { displayTodos, uncompletedCount } = useMemo(() => {
    if (currentView === 'recycle') {
      return { displayTodos: recycledTodos, uncompletedCount: 0 };
    }
    if (currentView === 'list') {
      return {
        displayTodos: todayTodos,
        uncompletedCount: todayTodos.filter((t: Todo) => !t.completed_time).length
      };
    }
    if (currentView === 'inbox') {
      return { displayTodos: inboxTodos, uncompletedCount: inboxTodos.length };
    }
    const listId = listNameToIdMap[currentView];
    if (listId) {
      const listTodos = uncompletedTodos.filter((todo: Todo) => todo.list_id === listId);
      return { displayTodos: listTodos, uncompletedCount: listTodos.length };
    }
    return { displayTodos: [], uncompletedCount: 0 };
  }, [currentView, todayTodos, inboxTodos, uncompletedTodos, recycledTodos, listNameToIdMap]);
  
  const inboxCount = useMemo(() => {
    return uncompletedTodos.filter((todo: Todo) => {
        const todoDueDateStr = todo.due_date ? utcToLocalDateString(todo.due_date) : '';
        const isOverdue = todoDueDateStr && todoDueDateStr < todayStrInUTC8;
        return !todo.list_id || isOverdue;
    }).length;
  }, [uncompletedTodos, todayStrInUTC8]);
  
  const todosByList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const todo of uncompletedTodos) {
        if (todo.list_id) {
            counts[todo.list_id] = (counts[todo.list_id] || 0) + 1;
        }
    }
    const nameCounts: Record<string, number> = {};
    for (const list of lists) {
        if (counts[list.id]) {
            nameCounts[list.name] = counts[list.id];
        }
    }
    return nameCounts;
  }, [lists, uncompletedTodos]);
  
  const recycleBinCount = useMemo(() => recycledTodos.length, [recycledTodos]);

  useEffect(() => {
    const interval = setInterval(() => {
      dateCache.clear();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleEditSlogan = useCallback(() => {
    setOriginalSlogan(slogan);
    setIsEditingSlogan(true);
  }, [slogan]);
  
  const handleUpdateSlogan = useCallback(debounce(async () => {
    setIsEditingSlogan(false);
    if (slogan === originalSlogan) return;
    await window.electron.db.write(
      `INSERT INTO meta (key, value) VALUES ('slogan', $1) ON CONFLICT(key) DO UPDATE SET value = $1`,
      [slogan]
    );
  }, 500), [slogan, originalSlogan]);

  const handleSloganKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleUpdateSlogan();
    else if (e.key === 'Escape') {
      setSlogan(originalSlogan);
      setIsEditingSlogan(false);
    }
  }, [handleUpdateSlogan, originalSlogan]);

  const handleAddTodo = useCallback(async () => {
    if (!newTodoTitle.trim()) return;
    let listId = null;
    if (currentView !== 'list' && currentView !== 'inbox' && currentView !== 'calendar' && currentView !== 'recycle') {
      const list = lists.find((l: List) => l.name === currentView);
      if (list) listId = list.id;
    }
    const dueDateString = newTodoDate || (currentView === 'list' ? todayStrInUTC8 : null);
    const dueDateUTC = localDateToEndOfDayUTC(dueDateString);
    const todoId = uuid();
    const createdTime = new Date().toISOString();
    
    await window.electron.db.write(
      `INSERT INTO todos (id, title, list_id, due_date, start_date, created_time) VALUES ($1, $2, $3, $4, $5, $6)`,
      [todoId, newTodoTitle.trim(), listId, dueDateUTC, dueDateUTC, createdTime]
    );
    
    setTimeout(async () => {
      try {
        await sendChangesToServer({ lists: [], todos: [createTodoChange(todoId, {
          title: newTodoTitle.trim(), list_id: listId, due_date: dueDateUTC,
          start_date: dueDateUTC, created_time: createdTime,
        }, true)] });
      } catch (error) { console.error('Failed to sync new todo:', error); }
    }, 1000);
    setNewTodoTitle('');
    setNewTodoDate(null);
  }, [newTodoTitle, newTodoDate, currentView, lists, todayStrInUTC8]);
  
  const handleUpdateTodo = useCallback(async (todoId: string, updates: Partial<Omit<Todo, 'id' | 'list_name'>>) => {
      const keys = Object.keys(updates);
      if (keys.length === 0) return;
      const setClauses = keys.map((key, i) => `"${camelToSnake(key)}" = $${i + 2}`).join(', ');
      const params = [todoId, ...Object.values(updates)];
      await window.electron.db.write(`UPDATE todos SET ${setClauses} WHERE id = $1`, params);
      
      setTimeout(async () => {
        try { await sendChangesToServer({ lists: [], todos: [createTodoChange(todoId, updates)] });
        } catch (error) { console.error('Failed to sync todo update:', error); }
      }, 1000);
  }, []);
  
  const handleToggleComplete = useCallback(async (todo: Todo) => {
    setLastAction({ type: 'toggle-complete', data: { id: todo.id, previousCompletedTime: todo.completed_time, previousCompleted: !!todo.completed } });
    const newCompletedTime = todo.completed_time ? null : new Date().toISOString();
    const newCompletedFlag = !todo.completed;
    await handleUpdateTodo(todo.id, { completed_time: newCompletedTime, completed: newCompletedFlag });
  }, [handleUpdateTodo]);
  
  const handleDeleteTodo = useCallback(async (todoId: string) => {
    const todoToDelete = todos.find((t: Todo) => t.id === todoId);
    if (!todoToDelete) return;
    setLastAction({ type: 'delete', data: todoToDelete });
    if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
    await window.electron.db.write(`UPDATE todos SET deleted = true WHERE id = $1`, [todoId]);
    try { await sendChangesToServer({ lists: [], todos: [createTodoChange(todoId, { deleted: true })] });
    } catch (error) { console.error('Failed to sync todo deletion:', error); }
  }, [todos, selectedTodo]);
  
  const handleRestoreTodo = useCallback(async (todoId: string) => {
    const todoToRestore = recycledTodos.find((t: Todo) => t.id === todoId);
    if (!todoToRestore) return;
    setLastAction({ type: 'restore', data: todoToRestore });
    if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
    await window.electron.db.write(`UPDATE todos SET deleted = false WHERE id = $1`, [todoId]);
    try { await sendChangesToServer({ lists: [], todos: [createTodoChange(todoId, { deleted: false })] });
    } catch (error) { console.error('Failed to sync todo restoration:', error); }
  }, [recycledTodos, selectedTodo]);
  
  const handlePermanentDeleteTodo = useCallback(async (todoId: string) => {
    const todoToDelete = recycledTodos.find((t: Todo) => t.id === todoId);
    if (!todoToDelete) return;
    const confirmed = window.confirm(`确认要永久删除任务 "${todoToDelete.title}" 吗？此操作无法撤销。`);
    if (confirmed) {
      await window.electron.db.write(`DELETE FROM todos WHERE id = $1`, [todoId]);
      try { await sendChangesToServer({ lists: [], todos: [createTodoChange(todoId, {}, false, true)] });
      } catch (error) { console.error('Failed to sync permanent todo deletion:', error); }
      if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
    }
  }, [recycledTodos, selectedTodo]);

  const handleSaveTodoDetails = useCallback(async (updatedTodo: Todo) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { list_name: _, ...updateData } = updatedTodo;
      await handleUpdateTodo(updatedTodo.id, updateData);
      setSelectedTodo(null);
  }, [handleUpdateTodo]);

  const handleAddList = useCallback(async (name: string): Promise<List | null> => {
    try {
      const newList = { id: uuid(), name, sort_order: lists.length, is_hidden: false };
      await window.electron.db.write(
        `INSERT INTO lists (id, name, sort_order, is_hidden) VALUES ($1, $2, $3, $4)`,
        [newList.id, newList.name, newList.sort_order, newList.is_hidden]
      );
      setTimeout(async () => {
        try { await sendChangesToServer({ lists: [createListChange(newList.id, {
              name: newList.name, sort_order: newList.sort_order, is_hidden: newList.is_hidden,
            }, true)], todos: [] });
        } catch (error) { console.error('Failed to sync new list:', error); }
      }, 1000);
      return newList;
    } catch (error) { console.error("Failed to add list:", error); alert(`添加清单失败: ${error instanceof Error ? error.message : 'Unknown error'}`); return null; }
  }, [lists.length]);

  const handleDeleteList = useCallback(async (listId: string) => {
    const listToDelete = lists.find((l: List) => l.id === listId);
    if (!listToDelete) return;
    const confirmed = window.confirm(`确认删除清单 "${listToDelete.name}" 吗？清单下的所有待办事项将被移至收件箱。`);
    if (!confirmed) return;
    const todosToUpdateQuery = await window.electron.db.query<{ id: string }>(`SELECT id FROM todos WHERE list_id = $1`, [listId]);
    const todosToUpdate = todosToUpdateQuery.rows;
    await window.electron.db.transaction([
      { sql: `UPDATE todos SET list_id = NULL WHERE list_id = $1`, params: [listId] },
      { sql: `DELETE FROM lists WHERE id = $1`, params: [listId] },
    ]);
    try {
      const todoChanges = todosToUpdate.map(todo => createTodoChange(todo.id, { list_id: null }));
      await sendChangesToServer({ lists: [createListChange(listId, {}, false)], todos: todoChanges });
    } catch (error) { console.error('Failed to sync list deletion:', error); }
    if (currentView === listToDelete.name) setCurrentView('inbox');
  }, [lists, currentView]);

  const handleUpdateList = useCallback(async (listId: string, updates: Partial<Omit<List, 'id'>>) => {
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    const setClauses = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
    const params = [listId, ...Object.values(updates)];
    await window.electron.db.write(`UPDATE lists SET ${setClauses} WHERE id = $1`, params);
    try { await sendChangesToServer({ lists: [createListChange(listId, updates)], todos: [] });
    } catch (error) { console.error('Failed to sync list update:', error); }
  }, []);

  const handleUpdateListsOrder = useCallback(async (reorderedLists: List[]) => {
      const queries = reorderedLists.map((list, index) => ({
        sql: 'UPDATE lists SET sort_order = $1 WHERE id = $2',
        params: [index, list.id]
      }));
      await window.electron.db.transaction(queries);
      setTimeout(async () => {
        try { await sendChangesToServer({ lists: reorderedLists.map((list, index) => createListChange(list.id, { sort_order: index })), todos: [] });
        } catch (error) { console.error('Failed to sync lists order update:', error); }
      }, 1000);
  }, []);
  
  const handleAddTodoFromCalendar = useCallback((date: string) => {
      setNewTodoDate(date);
      addTodoInputRef.current?.focus();
  }, []);

  const handleUndo = useCallback(async () => {
    if (!lastAction) { alert("没有可撤销的操作"); return; }
    try {
      switch (lastAction.type) {
        case 'toggle-complete':
          await handleUpdateTodo(lastAction.data.id, { completed_time: lastAction.data.previousCompletedTime, completed: lastAction.data.previousCompleted });
          break;
        case 'delete':
          await handleUpdateTodo(lastAction.data.id, { deleted: false });
          break;
        case 'restore':
          await handleUpdateTodo(lastAction.data.id, { deleted: true });
          break;
        case 'batch-complete': {
          const lastActionData = lastAction.data;
          const queries = lastActionData.map(d => ({
            sql: 'UPDATE todos SET completed_time = $1, completed = $2 WHERE id = $3',
            params: [d.previousCompletedTime, d.previousCompleted, d.id]
          }));
          await window.electron.db.transaction(queries);
          setTimeout(async () => {
            try { await sendChangesToServer({ lists: [], todos: lastActionData.map(d => createTodoChange(d.id, {
                  completed_time: d.previousCompletedTime, completed: d.previousCompleted,
                })) });
            } catch (error) { console.error('Failed to sync undo batch completion:', error); }
          }, 1000);
          break;
        }
      }
    } catch (error) { alert(`撤销操作失败: ${error instanceof Error ? error.message : '未知错误'}`); }
    setLastAction(null);
  }, [lastAction, handleUpdateTodo]);
  
  const handleMarkAllCompleted = useCallback(async () => {
    const todosToUpdate = displayTodos.filter((t: Todo) => !t.completed_time);
    if (todosToUpdate.length === 0) return;
    const confirmed = await window.confirm(`确认将当前视图的 ${todosToUpdate.length} 项全部标记为完成吗？`);
    if (!confirmed) return;
    const idsToUpdate = todosToUpdate.map((t: Todo) => t.id);
    const newCompletedTime = new Date().toISOString();
    setLastAction({ type: 'batch-complete', data: todosToUpdate.map((t: Todo) => ({ id: t.id, previousCompletedTime: t.completed_time, previousCompleted: !!t.completed })) });
    await window.electron.db.write(`UPDATE todos SET completed = TRUE, completed_time = $1 WHERE id = ANY($2::uuid[])`, [newCompletedTime, idsToUpdate]);
    setTimeout(async () => {
      try { await sendChangesToServer({ lists: [], todos: todosToUpdate.map((t: Todo) => createTodoChange(t.id, {
            completed: true, completed_time: newCompletedTime
          })) });
      } catch (error) { console.error('Failed to sync batch completion:', error); }
    }, 1000);
  }, [displayTodos]);
  
  const handleImport = useCallback(async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      try {
        let todosToImport: Partial<Todo>[] = [];
        if (file.name.endsWith('.csv')) {
          const { todos, removedTodos } = parseDidaCsv(content);
          todosToImport = [...todos, ...removedTodos].map(t => ({...t, deleted: !!(t as unknown as { removed?: boolean }).removed}));
        } else {
          const data = JSON.parse(content);
          const importedTodos = data.todos || (Array.isArray(data) ? data : []);
          const importedRecycleBin = data.recycleBin || [];
          todosToImport = [...importedTodos, ...importedRecycleBin];
        }
        if (todosToImport.length === 0) { alert('没有找到可导入的事项。'); return; }
        const listNames = new Set(todosToImport.map(t => t.list_name).filter((s): s is string => !!s));
        const existingListNames = new Set(lists.map((l: List) => l.name));
        const newListsToCreate = [...listNames].filter(name => !existingListNames.has(name));
        
        const createdLists: ListChange[] = [];
        const newListsQueries = newListsToCreate.map((listName, i) => {
          const newListData = { id: uuid(), name: listName, is_hidden: false, sort_order: lists.length + i };
          createdLists.push(createListChange(newListData.id, newListData, true));
          return {
            sql: 'INSERT INTO lists (id, name, is_hidden, sort_order) VALUES ($1, $2, $3, $4)',
            params: [newListData.id, newListData.name, newListData.is_hidden, newListData.sort_order]
          };
        });
        
        if(newListsQueries.length > 0) {
          await window.electron.db.transaction(newListsQueries);
        }

        const currentListsRes = await window.electron.db.query<List>(`SELECT id, name, sort_order, is_hidden FROM lists`);
        const listNameToIdMap = new Map<string, string>();
        currentListsRes.rows.forEach((list: List) => listNameToIdMap.set(list.name, list.id));
        
        const createdTodos: TodoChange[] = [];
        const newTodoQueries = todosToImport.map(todo => {
            const listId = todo.list_name ? listNameToIdMap.get(todo.list_name) || null : null;
            const newTodoData = {
              id: uuid(), title: todo.title || '', completed: !!todo.completed, deleted: !!todo.deleted, sort_order: todo.sort_order || 0,
              due_date: todo.due_date || null, content: todo.content || null, tags: todo.tags || null, priority: todo.priority === undefined ? 0 : todo.priority,
              created_time: todo.created_time || new Date().toISOString(), completed_time: todo.completed_time || null, start_date: todo.start_date || null, list_id: listId,
            };
            createdTodos.push(createTodoChange(newTodoData.id, newTodoData, true));
            return {
              sql: `INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
              params: [newTodoData.id, newTodoData.title, newTodoData.completed, newTodoData.deleted, newTodoData.sort_order,
                      newTodoData.due_date, newTodoData.content, newTodoData.tags, newTodoData.priority, newTodoData.created_time,
                      newTodoData.completed_time, newTodoData.start_date, newTodoData.list_id]
            };
        });

        if (newTodoQueries.length > 0) {
          await window.electron.db.transaction(newTodoQueries);
        }

        alert(`成功导入 ${todosToImport.length} 个事项！`);
        
        if (createdLists.length > 0 || createdTodos.length > 0) {
          setTimeout(async () => {
            try {
              const batchSize = 100;
              if (createdLists.length > 0) { await sendChangesToServer({ lists: createdLists, todos: [] }); }
              if (createdTodos.length > 0) {
                for (let i = 0; i < createdTodos.length; i += batchSize) {
                  const batch = createdTodos.slice(i, i + batchSize);
                  await sendChangesToServer({ lists: [], todos: batch });
                  if (i + batchSize < createdTodos.length) { await new Promise(resolve => setTimeout(resolve, 500)); }
                }
              }
            } catch (error) { console.error('Failed to sync imported data:', error); alert('本地数据导入成功，但同步到服务器失败。'); }
          }, 1000);
        }
      } catch (error) { console.error("Import failed:", error); alert(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`); }
    };
    reader.readAsText(file, 'UTF-8');
  }, [lists]);

  const newTodoPlaceholder = useMemo(() => {
    if (newTodoDate) return `为 ${newTodoDate} 添加新事项...`;
    if (currentView !== 'list' && currentView !== 'inbox' && currentView !== 'calendar' && currentView !== 'recycle') {
        return `在"${currentView}"中新增待办...`;
    }
    return '新增待办事项...';
  }, [newTodoDate, currentView]);

  // 2. 错误兜底渲染放在所有 hooks 之后
  const hasError = typeof todosQuery === 'object' && todosQuery !== null && 'error' in todosQuery && (todosQuery as { error?: { message?: string } }).error;
  if (!todosQuery) {
    return <div>数据库未就绪或查询失败，请稍后重试。</div>;
  }
  if (hasError) {
    return <div>数据库查询出错：{hasError.message}</div>;
  }

  return (
    <>
      <div className="bg-pattern"></div>
      <div className="todo-wrapper">
        <div id="todo-app" className="todo-app">
          <div className="container header">
            <div className="todo-input">
              <h1 className="title">
                <Image src="/img/todo.svg" alt="Todo" width={180} height={52} draggable={false} />
              </h1>
              <div className="add-content-wrapper">
                <input
                  ref={addTodoInputRef} type="text" className="add-content"
                  placeholder={newTodoPlaceholder} value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  onKeyUp={(e) => e.key === 'Enter' && handleAddTodo()}
                />
                <button className="btn submit-btn" type="button" onClick={handleAddTodo}>提交</button>
              </div>
            </div>
          </div>

          <div className={`container main ${currentView === 'calendar' ? 'main-full-width' : ''}`}>
            <ViewSwitcher
                currentView={currentView}
                setCurrentView={setCurrentView}
                lists={lists}
                inboxCount={inboxCount}
                todosByList={todosByList}
            />

            {currentView !== 'calendar' ? (
                <div className="todo-list-box">
                  <div className="bar-message">
                    {currentView !== 'recycle' && displayTodos.some((t: Todo) => !t.completed_time) && (
                      <button className="btn-small completed-all btn-allFinish" onClick={handleMarkAllCompleted}>全部标为完成</button>
                    )}
                    {isEditingSlogan ? (
                      <input 
                        ref={sloganInputRef} type="text" className="slogan-input"
                        value={slogan} onChange={(e) => setSlogan(e.target.value)}
                        onKeyDown={handleSloganKeyDown} onBlur={handleUpdateSlogan}
                      />
                    ) : (
                      <div className="bar-message-text" onDoubleClick={handleEditSlogan}>{slogan}</div>
                    )}
                  </div>
                  
                  <TodoList
                    todos={displayTodos}
                    currentView={currentView}
                    onToggleComplete={handleToggleComplete}
                    onDelete={handleDeleteTodo}
                    onRestore={handleRestoreTodo}
                    onSelectTodo={setSelectedTodo}
                  />

                  <div className="bar-message bar-bottom">
                    <div className="bar-message-text">
                        {currentView !== 'recycle' ? <span>{uncompletedCount} 项未完成</span> : <span>共 {recycleBinCount} 项</span>}
                    </div>
                  </div>
                </div>
            ) : (
                <CalendarView 
                    todos={calendarVisibleTodos} 
                    currentDate={currentDate} 
                    onDateChange={setCurrentDate}
                    onUpdateTodo={handleUpdateTodo}
                    onOpenModal={setSelectedTodo}
                    onAddTodo={handleAddTodoFromCalendar}
                />
            )}
            
            <QuickActions 
                currentView={currentView}
                setCurrentView={setCurrentView}
                onUndo={handleUndo}
                canUndo={!!lastAction}
                recycleBinCount={recycleBinCount}
                onMarkAllCompleted={handleMarkAllCompleted}
                showMarkAllCompleted={displayTodos.some((t: Todo) => !t.completed_time)}
                onManageLists={() => setShowManageListsModal(true)}
                onImport={handleImport}
            />
          </div>
        </div>
      </div>
      
      {showManageListsModal && (
        <ManageListsModal 
            lists={lists} onClose={() => setShowManageListsModal(false)}
            onAddList={handleAddList} onDeleteList={handleDeleteList}
            onUpdateList={handleUpdateList} onUpdateListsOrder={handleUpdateListsOrder}
        />
      )}
      {selectedTodo && (
        <TodoDetailsModal
          todo={selectedTodo} lists={lists}
          onClose={() => setSelectedTodo(null)} onSave={handleSaveTodoDetails}
          onDelete={handleDeleteTodo} onUpdate={handleUpdateTodo}
          onRestore={handleRestoreTodo}
          onPermanentDelete={handlePermanentDeleteTodo}
        />
      )}
    </>
  );
}

// 在文件顶部添加类型声明
declare global {
  interface Window {
    electron: any;
  }
}