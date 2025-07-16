// app/page.tsx
'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { v4 as uuid } from 'uuid'
import { useLiveQuery } from '@electric-sql/pglite-react'
import debounce from 'lodash.debounce'
import { parseDidaCsv } from '../lib/csvParser'
import { sendChangesToServer, createTodoChange, createListChange, type TodoChange, type ListChange } from '../lib/changes'
import { TodoList } from '../components/TodoList'
import { ViewSwitcher } from '../components/ViewSwitcher'
import QuickActions from '../components/QuickActions'
import TodoDetailsModal from '../components/TodoDetailsModal'
import ManageListsModal from '../components/ManageListsModal'
import CalendarView from '../components/CalendarView'
import type { Todo, List } from '../lib/types'

// --- 统一的数据库API层 ---
interface DatabaseAPI {
  query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }>
  write: (sql: string, params?: any[]) => Promise<void>
  transaction: (queries: { sql: string; params?: any[] }[]) => Promise<void>
}

function getDatabaseAPI(): DatabaseAPI {
  // 检查是否在Electron环境中
  if (typeof window !== 'undefined' && (window as any).electron?.db) {
    // Electron环境
    return {
      query: async (sql: string, params?: any[]) => {
        const result = await (window as any).electron.db.query(sql, params);
        return result;
      },
      write: async (sql: string, params?: any[]) => {
        await (window as any).electron.db.write(sql, params);
      },
      transaction: async (queries: { sql: string; params?: any[] }[]) => {
        await (window as any).electron.db.transaction(queries);
      }
    };
  } else if (typeof window !== 'undefined' && (window as any).pg) {
    // Web环境 - 使用PGlite
    const pg = (window as any).pg;
    return {
      query: async (sql: string, params?: any[]) => {
        return await pg.query(sql, params);
      },
      write: async (sql: string, params?: any[]) => {
        await pg.query(sql, params);
      },
      transaction: async (queries: { sql: string; params?: any[] }[]) => {
        await pg.transaction(async (tx: any) => {
          for (const { sql, params } of queries) {
            await tx.query(sql, params);
          }
        });
      }
    };
  } else {
    // 环境不可用
    throw new Error('Database API not available. Please ensure the application is properly initialized.');
  }
}

// --- 日期缓存类 ---
class DateCache {
  private dateCache = new Map<string, string>();
  private todayCache: { date: string; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 60000; // 1分钟缓存

  getTodayString(): string {
    const now = Date.now();
    if (!this.todayCache || now - this.todayCache.timestamp > this.CACHE_DURATION) {
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, '0');
      const day = String(today.getDate()).padStart(2, '0');
      this.todayCache = { date: `${year}-${month}-${day}`, timestamp: now };
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

const dateCache = new DateCache();

// --- 日期转换函数 ---
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  if (!utcDate) return '';
  
  const cached = dateCache.getDateCache(utcDate);
  if (cached) return cached;
  
  try {
    const date = new Date(utcDate);
    if (isNaN(date.getTime())) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const result = `${year}-${month}-${day}`;
    
    dateCache.setDateCache(utcDate, result);
    return result;
  } catch {
    return '';
  }
};

const localDateToEndOfDayUTC = (localDate: string | null | undefined): string | null => {
  if (!localDate) return null;
  try {
    const [year, month, day] = localDate.split('-').map(Number);
    const date = new Date(year, month - 1, day, 23, 59, 59, 999);
    return date.toISOString();
  } catch {
    return null;
  }
};

// --- 数据标准化函数 ---
const normalizeTodo = (raw: Record<string, unknown>): Todo => ({
  id: String(raw.id),
  title: String(raw.title || ''),
  completed: Boolean(raw.completed),
  deleted: Boolean(raw.deleted),
  sort_order: Number(raw.sort_order) || 0,
  due_date: raw.due_date ? String(raw.due_date) : null,
  content: raw.content ? String(raw.content) : null,
  tags: raw.tags ? String(raw.tags) : null,
  priority: Number(raw.priority) || 0,
  created_time: raw.created_time ? String(raw.created_time) : new Date().toISOString(),
  completed_time: raw.completed_time ? String(raw.completed_time) : null,
  start_date: raw.start_date ? String(raw.start_date) : null,
  list_id: raw.list_id ? String(raw.list_id) : null,
  list_name: raw.list_name ? String(raw.list_name) : null,
});

const normalizeList = (raw: Record<string, unknown>): List => ({
  id: String(raw.id),
  name: String(raw.name || ''),
  sort_order: Number(raw.sort_order) || 0,
  is_hidden: Boolean(raw.is_hidden),
  modified: raw.modified ? String(raw.modified) : new Date().toISOString(),
});

type LastAction =
  | { type: 'toggle-complete'; data: { id: string; previousCompletedTime: string | null, previousCompleted: boolean } }
  | { type: 'delete'; data: Todo }
  | { type: 'restore'; data: Todo }
  | { type: 'batch-complete'; data: { id: string; previousCompletedTime: string | null, previousCompleted: boolean }[] };

const camelToSnake = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

export default function TodoListPage() {
  // 获取数据库API
  const db = getDatabaseAPI();
  
  // --- 状态管理 ---
  const [currentView, setCurrentView] = useState<string>('today')
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null)
  const [isManageListsOpen, setIsManageListsOpen] = useState(false)
  const [newTodoTitle, setNewTodoTitle] = useState('')
  const [newTodoDate, setNewTodoDate] = useState<string | null>(null)
  const [lastAction, setLastAction] = useState<LastAction | null>(null)
  const [isEditingSlogan, setIsEditingSlogan] = useState(false)
  const [originalSlogan, setOriginalSlogan] = useState('')
  const [slogan, setSlogan] = useState('今日事今日毕，勿将今事待明日!.☕')
  const [currentDate, setCurrentDate] = useState(new Date());
  const addTodoInputRef = useRef<HTMLInputElement>(null)

  // --- 数据查询 ---
  const todosResult = useLiveQuery('SELECT * FROM todos ORDER BY sort_order, created_time DESC')
  const listsResult = useLiveQuery('SELECT * FROM lists ORDER BY sort_order')
  const sloganResult = useLiveQuery('SELECT value FROM meta WHERE key = \'slogan\'')

  // --- 数据标准化 ---
  const todos = useMemo(() => {
    if (!todosResult?.rows) return []
    return todosResult.rows.map(normalizeTodo)
  }, [todosResult?.rows])

  const lists = useMemo(() => {
    if (!listsResult?.rows) return []
    return listsResult.rows.map(normalizeList)
  }, [listsResult?.rows])

  // 从数据库更新slogan
  useEffect(() => {
    if (sloganResult?.rows?.[0]?.value) {
      setSlogan(String(sloganResult.rows[0].value))
    }
  }, [sloganResult?.rows])

  // --- 计算属性 ---
  const todayStrInUTC8 = useMemo(() => dateCache.getTodayString(), [])
  
  const uncompletedTodos = useMemo(() => 
    todos.filter((t: Todo) => !t.completed && !t.deleted), [todos])
  
  const completedTodos = useMemo(() => 
    todos.filter((t: Todo) => t.completed && !t.deleted), [todos])
  
  const recycledTodos = useMemo(() => 
    todos.filter((t: Todo) => t.deleted), [todos])

  const displayTodos = useMemo(() => {
    switch (currentView) {
      case 'inbox':
        return uncompletedTodos.filter((t: Todo) => !t.list_id)
      case 'completed':
        return completedTodos
      case 'recycle':
        return recycledTodos
      case 'today':
        // 今日待办应显示所有今日任务（无论是否已完成），未完成任务排在前面
        return todos
          .filter((t: Todo) => !t.deleted && t.due_date && utcToLocalDateString(t.due_date) === todayStrInUTC8)
          .sort((a, b) => {
            // 未完成优先，已完成靠后
            if (a.completed === b.completed) return 0;
            return a.completed ? 1 : -1;
          });
      case 'calendar':
        return uncompletedTodos
      default:
        const list = lists.find((l: List) => l.name === currentView)
        return list ? uncompletedTodos.filter((t: Todo) => t.list_id === list.id) : uncompletedTodos
    }
  }, [currentView, uncompletedTodos, completedTodos, recycledTodos, lists, todayStrInUTC8, todos])

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

  // --- 事件处理函数 ---
  const handleEditSlogan = useCallback(() => {
    setOriginalSlogan(slogan);
    setIsEditingSlogan(true);
  }, [slogan]);
  
  const handleUpdateSlogan = useCallback(debounce(async () => {
    setIsEditingSlogan(false);
    if (slogan === originalSlogan) return;
    await db.write(
      `INSERT INTO meta (key, value) VALUES ('slogan', $1) ON CONFLICT(key) DO UPDATE SET value = $1`,
      [slogan]
    );
  }, 500), [slogan, originalSlogan, db]);

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
    
    await db.write(
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
  }, [newTodoTitle, newTodoDate, currentView, lists, todayStrInUTC8, db]);
  
  const handleUpdateTodo = useCallback(async (todoId: string, updates: Partial<Omit<Todo, 'id' | 'list_name'>>) => {
      const keys = Object.keys(updates);
      if (keys.length === 0) return;
      const setClauses = keys.map((key, i) => `"${camelToSnake(key)}" = $${i + 2}`).join(', ');
      const params = [todoId, ...Object.values(updates)];
      await db.write(`UPDATE todos SET ${setClauses} WHERE id = $1`, params);
      
      setTimeout(async () => {
        try { await sendChangesToServer({ lists: [], todos: [createTodoChange(todoId, updates)] });
        } catch (error) { console.error('Failed to sync todo update:', error); }
      }, 1000);
  }, [db]);
  
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
    await db.write(`UPDATE todos SET deleted = true WHERE id = $1`, [todoId]);
    try { await sendChangesToServer({ lists: [], todos: [createTodoChange(todoId, { deleted: true })] });
    } catch (error) { console.error('Failed to sync todo deletion:', error); }
  }, [todos, selectedTodo, db]);
  
  const handleRestoreTodo = useCallback(async (todoId: string) => {
    const todoToRestore = recycledTodos.find((t: Todo) => t.id === todoId);
    if (!todoToRestore) return;
    setLastAction({ type: 'restore', data: todoToRestore });
    if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
    await db.write(`UPDATE todos SET deleted = false WHERE id = $1`, [todoId]);
    try { await sendChangesToServer({ lists: [], todos: [createTodoChange(todoId, { deleted: false })] });
    } catch (error) { console.error('Failed to sync todo restoration:', error); }
  }, [recycledTodos, selectedTodo, db]);
  
  const handlePermanentDeleteTodo = useCallback(async (todoId: string) => {
    const todoToDelete = recycledTodos.find((t: Todo) => t.id === todoId);
    if (!todoToDelete) return;
    const confirmed = window.confirm(`确认要永久删除任务 "${todoToDelete.title}" 吗？此操作无法撤销。`);
    if (confirmed) {
      await db.write(`DELETE FROM todos WHERE id = $1`, [todoId]);
      try { await sendChangesToServer({ lists: [], todos: [createTodoChange(todoId, {}, false, true)] });
      } catch (error) { console.error('Failed to sync permanent todo deletion:', error); }
      if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
    }
  }, [recycledTodos, selectedTodo, db]);

  const handleSaveTodoDetails = useCallback(async (updatedTodo: Todo) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { list_name: _, ...updateData } = updatedTodo;
      await handleUpdateTodo(updatedTodo.id, updateData);
      setSelectedTodo(null);
  }, [handleUpdateTodo]);

  const handleAddList = useCallback(async (name: string): Promise<List | null> => {
    try {
      const newList = { id: uuid(), name, sort_order: lists.length, is_hidden: false };
      await db.write(
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
  }, [lists.length, db]);

  const handleDeleteList = useCallback(async (listId: string) => {
    const listToDelete = lists.find((l: List) => l.id === listId);
    if (!listToDelete) return;
    const confirmed = window.confirm(`确认删除清单 "${listToDelete.name}" 吗？清单下的所有待办事项将被移至收件箱。`);
    if (!confirmed) return;
    const todosToUpdateQuery = await db.query<{ id: string }>(`SELECT id FROM todos WHERE list_id = $1`, [listId]);
    const todosToUpdate = todosToUpdateQuery.rows;
    await db.transaction([
      { sql: `UPDATE todos SET list_id = NULL WHERE list_id = $1`, params: [listId] },
      { sql: `DELETE FROM lists WHERE id = $1`, params: [listId] },
    ]);
    try {
      const todoChanges = todosToUpdate.map(todo => createTodoChange(todo.id, { list_id: null }));
      await sendChangesToServer({ lists: [createListChange(listId, {}, false)], todos: todoChanges });
    } catch (error) { console.error('Failed to sync list deletion:', error); }
    if (currentView === listToDelete.name) setCurrentView('inbox');
  }, [lists, currentView, db]);

  const handleUpdateList = useCallback(async (listId: string, updates: Partial<Omit<List, 'id'>>) => {
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    const setClauses = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
    const params = [listId, ...Object.values(updates)];
    await db.write(`UPDATE lists SET ${setClauses} WHERE id = $1`, params);
    // 补全 name 字段，防止同步时 name 为 null
    const list = lists.find(l => l.id === listId);
    const fullUpdates = { ...updates };
    if (list && (fullUpdates.name === undefined || fullUpdates.name === null)) {
      fullUpdates.name = list.name;
    }
    try {
      await sendChangesToServer({ lists: [createListChange(listId, fullUpdates)], todos: [] });
    } catch (error) { console.error('Failed to sync list update:', error); }
  }, [db, lists]);

  const handleUpdateListsOrder = useCallback(async (reorderedLists: List[]) => {
      const queries = reorderedLists.map((list, index) => ({
        sql: 'UPDATE lists SET sort_order = $1 WHERE id = $2',
        params: [index, list.id]
      }));
      await db.transaction(queries);
      setTimeout(async () => {
        try { await sendChangesToServer({ lists: reorderedLists.map((list, index) => createListChange(list.id, { sort_order: index })), todos: [] });
        } catch (error) { console.error('Failed to sync lists order update:', error); }
      }, 1000);
  }, [db]);
  
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
          await db.transaction(queries);
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
  }, [lastAction, handleUpdateTodo, db]);
  
  const handleMarkAllCompleted = useCallback(async () => {
    const todosToUpdate = displayTodos.filter((t: Todo) => !t.completed_time);
    if (todosToUpdate.length === 0) return;
    const confirmed = await window.confirm(`确认将当前视图的 ${todosToUpdate.length} 项全部标记为完成吗？`);
    if (!confirmed) return;
    const idsToUpdate = todosToUpdate.map((t: Todo) => t.id);
    const newCompletedTime = new Date().toISOString();
    setLastAction({ type: 'batch-complete', data: todosToUpdate.map((t: Todo) => ({ id: t.id, previousCompletedTime: t.completed_time, previousCompleted: !!t.completed })) });
    await db.write(`UPDATE todos SET completed = TRUE, completed_time = $1 WHERE id = ANY($2::uuid[])`, [newCompletedTime, idsToUpdate]);
    setTimeout(async () => {
      try { await sendChangesToServer({ lists: [], todos: todosToUpdate.map((t: Todo) => createTodoChange(t.id, {
            completed: true, completed_time: newCompletedTime
          })) });
      } catch (error) { console.error('Failed to sync batch completion:', error); }
    }, 1000);
  }, [displayTodos, db]);
  
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
          await db.transaction(newListsQueries);
        }

        const currentListsRes = await db.query<List>(`SELECT id, name, sort_order, is_hidden FROM lists`);
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
          await db.transaction(newTodoQueries);
        }

        alert(`成功导入 ${todosToImport.length} 个事项！`);
      } catch (error) {
        console.error('Import failed:', error);
        alert(`导入失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    };
    reader.readAsText(file);
  }, [lists, db]);

  const handleExport = useCallback(() => {
    const data = {
      todos: todos.filter((t: Todo) => !t.deleted),
      recycleBin: recycledTodos,
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `todos-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [todos, recycledTodos]);

  // --- 渲染逻辑 ---
  return (
    <>
      <div className="bg-pattern"></div>
      <div className="todo-wrapper">
        <div id="todo-app" className="todo-app">
          <div className="container header">
            <div className="todo-input">
              <h1 className="title">
                <img src="/img/todo.svg" alt="Todo" width={180} height={52} draggable={false} />
              </h1>
              <div className="add-content-wrapper">
                <input
                  ref={addTodoInputRef}
                  type="text"
                  className="add-content"
                  placeholder={newTodoDate ? `为 ${newTodoDate} 添加新事项...` : (currentView !== 'list' && currentView !== 'inbox' && currentView !== 'calendar' && currentView !== 'recycle') ? `在"${currentView}"中新增待办...` : '新增待办事项...'}
                  value={newTodoTitle}
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
              inboxCount={todos.filter(t => !t.list_id && !t.completed && !t.deleted).length}
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
                      type="text"
                      className="slogan-input"
                      value={slogan}
                      onChange={(e) => setSlogan(e.target.value)}
                      onKeyDown={handleSloganKeyDown}
                      onBlur={handleUpdateSlogan}
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
                    {currentView !== 'recycle' ? <span>{displayTodos.filter((t: Todo) => !t.completed_time).length} 项未完成</span> : <span>共 {recycledTodos.length} 项</span>}
                  </div>
                </div>
              </div>
            ) : (
              <CalendarView
                todos={todos}
                onAddTodo={handleAddTodoFromCalendar}
                onUpdateTodo={handleUpdateTodo}
                onOpenModal={setSelectedTodo}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
              />
            )}

            <QuickActions
              currentView={currentView}
              setCurrentView={setCurrentView}
              onUndo={handleUndo}
              canUndo={!!lastAction}
              recycleBinCount={recycledTodos.length}
              onMarkAllCompleted={handleMarkAllCompleted}
              showMarkAllCompleted={displayTodos.some((t: Todo) => !t.completed_time)}
              onManageLists={() => setIsManageListsOpen(true)}
              onImport={handleImport}
            />
          </div>

          {selectedTodo && (
            <TodoDetailsModal
              todo={selectedTodo}
              lists={lists}
              onSave={handleSaveTodoDetails}
              onClose={() => setSelectedTodo(null)}
              onDelete={handleDeleteTodo}
              onUpdate={handleUpdateTodo}
              onRestore={handleRestoreTodo}
              onPermanentDelete={handlePermanentDeleteTodo}
            />
          )}

          {isManageListsOpen && (
            <ManageListsModal
              lists={lists}
              onAddList={handleAddList}
              onDeleteList={handleDeleteList}
              onUpdateList={handleUpdateList}
              onUpdateListsOrder={handleUpdateListsOrder}
              onClose={() => setIsManageListsOpen(false)}
            />
          )}
        </div>
      </div>
    </>
  )
}// 扩展 Window 接口以包含 electron 属性
declare global {
  interface Window {
    electron: any;
  }
}

