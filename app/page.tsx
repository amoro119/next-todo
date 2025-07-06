// app/page.tsx
"use client";

import { useEffect, useState, useMemo, useRef, MouseEvent, useCallback } from "react";
import { useLiveQuery, usePGlite } from "@electric-sql/pglite-react";
import type { Todo, List } from "../lib/types";
import Image from "next/image";
import dynamic from 'next/dynamic';
import ManageListsModal from "../components/ManageListsModal";
import CalendarView from "../components/CalendarView";
import QuickActions from "../components/QuickActions";
import { parseDidaCsv } from '../lib/csvParser';
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { v4 as uuid } from 'uuid';
import debounce from 'lodash.debounce';
import { sendChangesToServer, createTodoChange, createListChange, ListChange, TodoChange } from '../lib/changes';


const TodoDetailsModal = dynamic(() => import('../components/TodoDetailsModal'), {
  ssr: false,
});

// Helper functions (保持不变)
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  if (!utcDate) return '';
  try {
    const date = new Date(utcDate);
    if (isNaN(date.getTime())) {
      const dateOnlyMatch = utcDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) return utcDate;
      return '';
    }
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    return formatter.format(date);
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

// 添加类型转换函数
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

// 合并后的主组件
export default function TodoListPage() {
  const pg = usePGlite();

  // 所有 Hooks 必须在早期返回之前调用
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
  const viewSwitcherRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

  // 1. 使用 "提前返回" 模式处理加载状态
  if (!pg) {
    return (
      <div className="fixed inset-0 flex flex-col items-center justify-center bg-white z-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
        <div className="mt-4 text-gray-600">正在连接数据库...</div>
      </div>
    );
  }

  // 2. 在 pg 实例可用后，安全地调用 useLiveQuery
  const todosQuery = useLiveQuery.sql<Todo>`
    SELECT t.*, l.name as list_name
    FROM todos t
    LEFT JOIN lists l ON t.list_id = l.id
    WHERE t.deleted = false
    ORDER BY t.sort_order, t.created_time DESC
  `;
  const todos = ((todosQuery as any)?.rows ?? []).map(normalizeTodo);

  const listsQuery = useLiveQuery.sql<List>`SELECT id, name, sort_order, is_hidden FROM lists ORDER BY sort_order, name`;
  const lists = ((listsQuery as any)?.rows ?? []).map(normalizeList);
  
  const recycledQuery = useLiveQuery.sql<Todo>`SELECT id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id FROM todos WHERE deleted = true`;
  const recycled = ((recycledQuery as any)?.rows ?? []).map(normalizeTodo);
  
  // 重新启用 meta 表查询
  const metaQuery = useLiveQuery.sql<{ key: string, value: string }>`SELECT * FROM meta WHERE key = 'slogan'`;
  const metaResults = (metaQuery as any)?.rows ?? [];

  // 添加错误日志，方便调试
  useEffect(() => {
    if ((todosQuery as any)?.error) console.error("Todos query error:", (todosQuery as any).error);
    if ((listsQuery as any)?.error) console.error("Lists query error:", (listsQuery as any).error);
    if ((recycledQuery as any)?.error) console.error("Recycled query error:", (recycledQuery as any).error);
    // if ((metaQuery as any)?.error) console.error("Meta query error:", (metaQuery as any).error);
  }, [todosQuery, listsQuery, recycledQuery]);
  
  useEffect(() => {
    if (metaResults?.[0]?.value) {
      setSlogan(metaResults[0].value);
    }
  }, [metaResults]);
  
  useEffect(() => {
    if (isEditingSlogan && sloganInputRef.current) {
        sloganInputRef.current.focus();
    }
  }, [isEditingSlogan]);

  const activeTodos = useMemo(() => todos.filter((t: Todo) => !t.deleted), [todos]);

  const calendarVisibleTodos = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const viewStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const viewEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

    return activeTodos.filter((todo: Todo) => {
      if (!todo.start_date && !todo.due_date) {
        return false;
      }
      const todoStartDateStr = utcToLocalDateString(todo.start_date);
      const todoDueDateStr = utcToLocalDateString(todo.due_date);
      if (!todoStartDateStr && !todoDueDateStr) return false;
      const todoStart = todoStartDateStr ? new Date(todoStartDateStr) : new Date(todoDueDateStr!);
      const todoEnd = todoDueDateStr ? new Date(todoDueDateStr) : new Date(todoStartDateStr!);
      const effectiveStart = todoStart < todoEnd ? todoStart : todoEnd;
      const effectiveEnd = todoStart > todoEnd ? todoStart : todoEnd;
      return effectiveStart <= viewEnd && effectiveEnd >= viewStart;
    });
  }, [activeTodos, currentDate]);

  const uncompletedTodos = useMemo(() => activeTodos.filter((t: Todo) => !t.completed_time), [activeTodos]);
  const recycledTodos = useMemo(() => recycled, [recycled]);

  const todayTodos = useMemo(() => {
    const todayStrInUTC8 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    return activeTodos.filter((todo: Todo) => todo.due_date && utcToLocalDateString(todo.due_date) === todayStrInUTC8);
  }, [activeTodos]);

  const inboxTodos = useMemo(() => {
    const todayStrInUTC8 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    return uncompletedTodos.filter((todo: Todo) => {
        const todoDueDateStr = todo.due_date ? utcToLocalDateString(todo.due_date) : '';
        const isOverdue = todoDueDateStr && todoDueDateStr < todayStrInUTC8;
        return !todo.list_id || isOverdue;
    });
  }, [uncompletedTodos]);

  const uncompletedTodosByListId = useMemo(() => {
    return uncompletedTodos.reduce((acc: Record<string, Todo[]>, todo: Todo) => {
      if (todo.list_id) {
        acc[todo.list_id] = acc[todo.list_id] || [];
        acc[todo.list_id].push(todo);
      }
      return acc;
    }, {} as Record<string, Todo[]>);
  }, [uncompletedTodos]);
  
  const listNameToIdMap = useMemo(() => 
    lists.reduce((acc: Record<string, string>, list: List) => {
      acc[list.name] = list.id;
      return acc;
    }, {} as Record<string, string>),
  [lists]);

  const { displayTodos, uncompletedCount } = useMemo(() => {
    if (currentView === 'recycle') {
      return { displayTodos: recycledTodos, uncompletedCount: 0 };
    }
    if (currentView === 'list') {
      return { displayTodos: todayTodos, uncompletedCount: todayTodos.filter((t: Todo) => !t.completed_time).length };
    }
    if (currentView === 'inbox') {
      return { displayTodos: inboxTodos, uncompletedCount: inboxTodos.length };
    }
    
    const listId = listNameToIdMap[currentView];
    if (listId) {
      const listTodos = uncompletedTodosByListId[listId] || [];
      return { displayTodos: listTodos, uncompletedCount: listTodos.length };
    }

    return { displayTodos: [], uncompletedCount: 0 };
  }, [currentView, recycledTodos, todayTodos, inboxTodos, uncompletedTodosByListId, listNameToIdMap]);



  const inboxCount = useMemo(() => inboxTodos.length, [inboxTodos]);
  
  const todosByList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const list of lists) {
        if (uncompletedTodosByListId[list.id]) {
            counts[list.name] = uncompletedTodosByListId[list.id].length;
        }
    }
    return counts;
  }, [lists, uncompletedTodosByListId]);
  
  const recycleBinCount = useMemo(() => recycledTodos.length, [recycledTodos]);

  const handleEditSlogan = () => {
    setOriginalSlogan(slogan);
    setIsEditingSlogan(true);
  };
  
  const handleUpdateSlogan = useCallback(debounce(async () => {
    setIsEditingSlogan(false);
    if (slogan === originalSlogan) return;
    // 重新启用 meta 表操作
    await pg.sql`INSERT INTO meta (key, value) VALUES ('slogan', ${slogan}) ON CONFLICT(key) DO UPDATE SET value = ${slogan}`;
  }, 500), [pg, slogan, originalSlogan]);

  const handleSloganKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleUpdateSlogan();
    else if (e.key === 'Escape') {
      setSlogan(originalSlogan);
      setIsEditingSlogan(false);
    }
  };

  const handleAddTodo = async () => {
    if (!newTodoTitle.trim()) return;

    let listId = null;
    if (currentView !== 'list' && currentView !== 'inbox' && currentView !== 'calendar' && currentView !== 'recycle') {
      const list = lists.find((l: List) => l.name === currentView);
      if (list) listId = list.id;
    }
    
    const todayInUTC8 = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
    const dueDateString = newTodoDate || (currentView === 'list' ? todayInUTC8 : null);
    const dueDateUTC = localDateToEndOfDayUTC(dueDateString);
    const todoId = uuid();
    const createdTime = new Date().toISOString();
    
    try {
      // 使用 ON CONFLICT 处理主键冲突
      await pg.sql`
        INSERT INTO todos (id, title, list_id, due_date, start_date, created_time) 
        VALUES (${todoId}, ${newTodoTitle.trim()}, ${listId}, ${dueDateUTC}, ${dueDateUTC}, ${createdTime})
        ON CONFLICT (id) DO UPDATE SET
          title = EXCLUDED.title,
          list_id = EXCLUDED.list_id,
          due_date = EXCLUDED.due_date,
          start_date = EXCLUDED.start_date,
          created_time = EXCLUDED.created_time
      `;

      // 重新启用手动推送，但添加延迟避免冲突
      setTimeout(async () => {
        try {
          await sendChangesToServer({
            lists: [],
            todos: [createTodoChange(todoId, {
              title: newTodoTitle.trim(),
              list_id: listId,
              due_date: dueDateUTC,
              start_date: dueDateUTC,
              created_time: createdTime,
            }, true)]
          });
        } catch (error) {
          console.error('Failed to sync new todo:', error);
        }
      }, 1000); // 延迟1秒推送

      setNewTodoTitle('');
      setNewTodoDate(null);
    } catch (error) {
      console.error('Failed to add todo:', error);
      alert('添加待办事项失败，请重试');
    }
  };
  
  const handleUpdateTodo = useCallback(async (todoId: string, updates: Partial<Omit<Todo, 'id' | 'list_name'>>) => {
      const keys = Object.keys(updates);
      if (keys.length === 0) return;
      
      const setClauses = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
      const params = [todoId, ...Object.values(updates)];
      
      const query = `UPDATE todos SET ${setClauses} WHERE id = $1`;
      await pg.query(query, params);

      // 重新启用手动推送，但添加延迟避免冲突
      setTimeout(async () => {
        try {
          await sendChangesToServer({
            lists: [],
            todos: [createTodoChange(todoId, updates)]
          });
        } catch (error) {
          console.error('Failed to sync todo update:', error);
        }
      }, 1000); // 延迟1秒推送
  }, [pg]);
  
  const handleToggleComplete = async (todo: Todo) => {
    setLastAction({ type: 'toggle-complete', data: { id: todo.id, previousCompletedTime: todo.completed_time, previousCompleted: !!todo.completed } });
    const newCompletedTime = todo.completed_time ? null : new Date().toISOString();
    const newCompletedFlag = !todo.completed;
    await handleUpdateTodo(todo.id, { completed_time: newCompletedTime, completed: newCompletedFlag });
  };
  
  const handleDeleteTodo = async (todoId: string) => {
    const todoToDelete = todos.find((t: Todo) => t.id === todoId);
    if (!todoToDelete) return;
    setLastAction({ type: 'delete', data: todoToDelete });
    if (selectedTodo && selectedTodo.id === todoId) {
        setSelectedTodo(null);
    }
    await pg.sql`UPDATE todos SET deleted = true WHERE id = ${todoId}`;

    // 推送变化到服务器
    try {
      await sendChangesToServer({
        lists: [],
        todos: [createTodoChange(todoId, { deleted: true })]
      });
    } catch (error) {
      console.error('Failed to sync todo deletion:', error);
    }
  };
  
  const handleRestoreTodo = async (todoId: string) => {
    const todoToRestore = recycled.find((t: Todo) => t.id === todoId);
    if (!todoToRestore) return;
    setLastAction({ type: 'restore', data: todoToRestore });
    if (selectedTodo && selectedTodo.id === todoId) {
        setSelectedTodo(null);
    }
    await pg.sql`UPDATE todos SET deleted = false WHERE id = ${todoId}`;

    // 推送变化到服务器
    try {
      await sendChangesToServer({
        lists: [],
        todos: [createTodoChange(todoId, { deleted: false })]
      });
    } catch (error) {
      console.error('Failed to sync todo restoration:', error);
    }
  };
  
  const handlePermanentDeleteTodo = async (todoId: string) => {
    const todoToDelete = recycled.find((t: Todo) => t.id === todoId);
    if (!todoToDelete) return;
    const confirmed = window.confirm(`确认要永久删除任务 "${todoToDelete.title}" 吗？此操作无法撤销。`);
    if (confirmed) {
      await pg.sql`DELETE FROM todos WHERE id = ${todoId}`;
      
      // 推送变化到服务器
      try {
        await sendChangesToServer({
          lists: [],
          todos: [createTodoChange(todoId, {}, false, true)]
        });
      } catch (error) {
        console.error('Failed to sync permanent todo deletion:', error);
      }

      if (selectedTodo && selectedTodo.id === todoId) {
        setSelectedTodo(null);
      }
    }
  }

  const handleSaveTodoDetails = async (updatedTodo: Todo) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { list_name: _, ...updateData } = updatedTodo;
      await handleUpdateTodo(updatedTodo.id, updateData);
      setSelectedTodo(null);
  };

  const handleAddList = async (name: string): Promise<List | null> => {
    try {
      const newList = { id: uuid(), name, sort_order: lists.length, is_hidden: false };
      
      // 使用 ON CONFLICT 处理主键冲突
      await pg.sql`
        INSERT INTO lists (id, name, sort_order, is_hidden) 
        VALUES (${newList.id}, ${newList.name}, ${newList.sort_order}, ${newList.is_hidden})
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          sort_order = EXCLUDED.sort_order,
          is_hidden = EXCLUDED.is_hidden
      `;
      
      // 重新启用手动推送，但添加延迟避免冲突
      setTimeout(async () => {
        try {
          await sendChangesToServer({
            lists: [createListChange(newList.id, {
              name: newList.name,
              sort_order: newList.sort_order,
              is_hidden: newList.is_hidden,
            }, true)],
            todos: []
          });
        } catch (error) {
          console.error('Failed to sync new list:', error);
        }
      }, 1000); // 延迟1秒推送
      
      return newList;
    } catch (error) {
      console.error("Failed to add list:", error);
      alert(`添加清单失败: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return null;
    }
  };

  const handleDeleteList = async (listId: string) => {
    const listToDelete = lists.find((l: List) => l.id === listId);
    if (!listToDelete) return;
    const confirmed = window.confirm(`确认删除清单 "${listToDelete.name}" 吗？清单下的所有待办事项将被移至收件箱。`);
    if (!confirmed) return;

    // 获取将要被修改的 todo
    const todosToUpdateQuery = await pg.query<{ id: string }>(`SELECT id FROM todos WHERE list_id = $1`, [listId]);
    const todosToUpdate = todosToUpdateQuery.rows;
    
    await pg.transaction(async tx => {
        await tx.sql`UPDATE todos SET list_id = NULL WHERE list_id = ${listId}`;
        await tx.sql`DELETE FROM lists WHERE id = ${listId}`;
    });
    
    // 推送变化到服务器
    try {
      const todoChanges = todosToUpdate.map(todo => createTodoChange(todo.id, { list_id: null }));
      await sendChangesToServer({
        lists: [createListChange(listId, {}, false, true)],
        todos: todoChanges,
      });
    } catch (error) {
      console.error('Failed to sync list deletion:', error);
    }
    
    if (currentView === listToDelete.name) setCurrentView('inbox');
  };

  const handleUpdateList = async (listId: string, updates: Partial<Omit<List, 'id'>>) => {
    const keys = Object.keys(updates);
    if (keys.length === 0) return;
    
    const setClauses = keys.map((key, i) => `"${key}" = $${i + 2}`).join(', ');
    const params = [listId, ...Object.values(updates)];
    
    const query = `UPDATE lists SET ${setClauses} WHERE id = $1`;
    await pg.query(query, params);

    // 推送变化到服务器
    try {
      await sendChangesToServer({
        lists: [createListChange(listId, updates)],
        todos: []
      });
    } catch (error) {
      console.error('Failed to sync list update:', error);
    }
  };

  const handleUpdateListsOrder = async (reorderedLists: List[]) => {
      await pg.transaction(async tx => {
          for(const [index, list] of reorderedLists.entries()) {
              await tx.sql`UPDATE lists SET sort_order = ${index} WHERE id = ${list.id}`;
          }
      });

      // 推送变化到服务器
      setTimeout(async () => {
        try {
          await sendChangesToServer({
            lists: reorderedLists.map((list, index) => createListChange(list.id, { sort_order: index })),
            todos: []
          });
        } catch (error) {
          console.error('Failed to sync lists order update:', error);
        }
      }, 1000);
  };
  
  const handleAddTodoFromCalendar = (date: string) => {
      setNewTodoDate(date);
      addTodoInputRef.current?.focus();
  };

  const handleUndo = async () => {
    if (!lastAction) {
      alert("没有可撤销的操作");
      return;
    }

    try {
      switch (lastAction.type) {
        case 'toggle-complete':
          await handleUpdateTodo(lastAction.data.id, { 
            completed_time: lastAction.data.previousCompletedTime, 
            completed: lastAction.data.previousCompleted
          });
          break;
        case 'delete':
          await handleUpdateTodo(lastAction.data.id, { deleted: false });
          break;
        case 'restore':
          await handleUpdateTodo(lastAction.data.id, { deleted: true });
          break;
        case 'batch-complete': {
          const lastActionData = lastAction.data;
          await pg.transaction(async tx => {
            for (const d of lastActionData) {
                await tx.sql`UPDATE todos SET completed_time = ${d.previousCompletedTime}, completed = ${d.previousCompleted} WHERE id = ${d.id}`;
            }
          });

          // 推送变化到服务器
          setTimeout(async () => {
            try {
              await sendChangesToServer({
                lists: [],
                todos: lastActionData.map(d => createTodoChange(d.id, {
                  completed_time: d.previousCompletedTime,
                  completed: d.previousCompleted,
                }))
              });
            } catch (error) {
              console.error('Failed to sync undo batch completion:', error);
            }
          }, 1000);
          break;
        }
      }
    } catch (error) {
        alert(`撤销操作失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
    setLastAction(null);
  };
  
  const handleMarkAllCompleted = async () => {
    const todosToUpdate = displayTodos.filter((t: Todo) => !t.completed_time);
    if (todosToUpdate.length === 0) return;
    const confirmed = await window.confirm(`确认将当前视图的 ${todosToUpdate.length} 项全部标记为完成吗？`);
    if (!confirmed) return;

    const idsToUpdate = todosToUpdate.map((t: Todo) => t.id);
    const newCompletedTime = new Date().toISOString();
    
    setLastAction({
        type: 'batch-complete',
        data: todosToUpdate.map((t: Todo) => ({ id: t.id, previousCompletedTime: t.completed_time, previousCompleted: !!t.completed }))
    });
    
    await pg.sql`UPDATE todos SET completed = TRUE, completed_time = ${newCompletedTime} WHERE id = ANY(${idsToUpdate}::uuid[])`;

    // 重新启用手动推送，但添加延迟避免冲突
    setTimeout(async () => {
      try {
        await sendChangesToServer({
          lists: [],
          todos: todosToUpdate.map((t: Todo) => createTodoChange(t.id, {
            completed: true,
            completed_time: newCompletedTime
          }))
        });
      } catch (error) {
        console.error('Failed to sync batch completion:', error);
      }
    }, 1000); // 延迟1秒推送
  };
  
  const handleImport = async (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      
      try {
        let todosToImport: Partial<Todo>[] = [];
        if (file.name.endsWith('.csv')) {
          const { todos, removedTodos } = parseDidaCsv(content);
          // Manually map 'removed' property to 'deleted'
          todosToImport = [...todos, ...removedTodos].map(t => ({...t, deleted: !!(t as any).removed}));
        } else {
          const data = JSON.parse(content);
          const importedTodos = data.todos || (Array.isArray(data) ? data : []);
          const importedRecycleBin = data.recycleBin || [];
          todosToImport = [...importedTodos, ...importedRecycleBin];
        }

        if (todosToImport.length === 0) {
          alert('没有找到可导入的事项。'); return;
        }

        const listNames = new Set(todosToImport.map(t => t.list_name).filter((s): s is string => !!s));
        const existingListNames = new Set(lists.map((l: List) => l.name));
        const newListsToCreate = [...listNames].filter(name => !existingListNames.has(name));
        
        const createdLists: ListChange[] = [];
        const createdTodos: TodoChange[] = [];

        await pg.transaction(async tx => {
          if (newListsToCreate.length > 0) {
              let sortOrder = lists.length;
              for (const listName of newListsToCreate) {
                  const newListData = { id: uuid(), name: listName, is_hidden: false, sort_order: sortOrder++ };
                  await tx.sql`INSERT INTO lists (id, name, is_hidden, sort_order) VALUES (${newListData.id}, ${newListData.name}, ${newListData.is_hidden}, ${newListData.sort_order})`;
                  createdLists.push(createListChange(newListData.id, { name: newListData.name, is_hidden: newListData.is_hidden, sort_order: newListData.sort_order }, true));
              }
          }
        });
        
        const currentLists = await pg.query<List>(`SELECT id, name, sort_order, is_hidden FROM lists`);
        const listNameToIdMap = new Map<string, string>();
        currentLists.rows.forEach((list: List) => listNameToIdMap.set(list.name, list.id));

        await pg.transaction(async tx => {
            for (const todo of todosToImport) {
                const listId = todo.list_name ? listNameToIdMap.get(todo.list_name) || null : null;
                const newTodoData = {
                  id: uuid(),
                  title: todo.title || '',
                  completed: !!todo.completed,
                  deleted: !!todo.deleted,
                  sort_order: todo.sort_order || 0,
                  due_date: todo.due_date || null,
                  content: todo.content || null,
                  tags: todo.tags || null,
                  priority: todo.priority === undefined ? 0 : todo.priority,
                  created_time: todo.created_time || new Date().toISOString(),
                  completed_time: todo.completed_time || null,
                  start_date: todo.start_date || null,
                  list_id: listId,
                };

                await tx.sql`
                    INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id)
                    VALUES (${newTodoData.id}, ${newTodoData.title}, ${newTodoData.completed}, ${newTodoData.deleted}, ${newTodoData.sort_order},
                            ${newTodoData.due_date}, ${newTodoData.content}, ${newTodoData.tags},
                            ${newTodoData.priority},
                            ${newTodoData.created_time},
                            ${newTodoData.completed_time},
                            ${newTodoData.start_date},
                            ${newTodoData.list_id}
                    );
                `;
                createdTodos.push(createTodoChange(newTodoData.id, newTodoData, true));
            }
        });
        alert(`成功导入 ${todosToImport.length} 个事项！`);
        
        if (createdLists.length > 0 || createdTodos.length > 0) {
          setTimeout(async () => {
            try {
              await sendChangesToServer({
                lists: createdLists,
                todos: createdTodos
              });
            } catch (error) {
              console.error('Failed to sync imported data:', error);
              alert('本地数据导入成功，但同步到服务器失败。');
            }
          }, 1000);
        }

      } catch (error) {
        console.error("Import failed:", error);
        alert(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    };
    reader.readAsText(file, 'UTF-8');
  };

  const newTodoPlaceholder = useMemo(() => {
    if (newTodoDate) return `为 ${newTodoDate} 添加新事项...`;
    if (currentView !== 'list' && currentView !== 'inbox' && currentView !== 'calendar' && currentView !== 'recycle') {
        return `在"${currentView}"中新增待办...`;
    }
    return '新增待办事项...';
  }, [newTodoDate, currentView]);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!viewSwitcherRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - viewSwitcherRef.current.offsetLeft);
    setScrollLeft(viewSwitcherRef.current.scrollLeft);
  };

  const handleMouseLeaveOrUp = () => { setIsDragging(false); };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !viewSwitcherRef.current) return;
    e.preventDefault();
    const x = e.pageX - viewSwitcherRef.current.offsetLeft;
    const walk = (x - startX) * 2;
    viewSwitcherRef.current.scrollLeft = scrollLeft - walk;
  };

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
                  ref={addTodoInputRef}
                  type="text"
                  className="add-content"
                  placeholder={newTodoPlaceholder}
                  value={newTodoTitle}
                  onChange={(e) => setNewTodoTitle(e.target.value)}
                  onKeyUp={(e) => e.key === 'Enter' && handleAddTodo()}
                />
                <button className="btn submit-btn" type="button" onClick={handleAddTodo}>提交</button>
              </div>
            </div>
          </div>

          <div className={`container main ${currentView === 'calendar' ? 'main-full-width' : ''}`}>
            <div 
                className={`view-switcher ${isDragging ? 'active-drag' : ''}`}
                ref={viewSwitcherRef}
                onMouseDown={handleMouseDown}
                onMouseLeave={handleMouseLeaveOrUp}
                onMouseUp={handleMouseLeaveOrUp}
                onMouseMove={handleMouseMove}
            >
                <button onClick={() => setCurrentView('list')} className={currentView === 'list' ? 'active' : ''}>今日待办</button>
                <button onClick={() => setCurrentView('calendar')} className={currentView === 'calendar' ? 'active' : ''}>日历视图</button>
                <button onClick={() => setCurrentView('inbox')} className={currentView === 'inbox' ? 'active' : ''}>
                    收件箱 {inboxCount > 0 && <span className="badge">{inboxCount}</span>}
                </button>
                {lists.filter((l: List) => !l.is_hidden).map((list: List) => (
                    <button key={list.id} onClick={() => setCurrentView(list.name)} className={currentView === list.name ? 'active' : ''}>
                        {list.name} {(todosByList[list.id] || 0) > 0 && <span className="badge">{todosByList[list.id]}</span>}
                    </button>
                ))}
            </div>

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

                  {todos.length === 0 && displayTodos.length === 0 && currentView !== 'recycle' ? (
                      <div className="todo-list">
                          <div className="empty-tips">
                            {currentView === 'list' && <div>今日无待办事项！🎉</div>}
                            {currentView === 'inbox' && <div>收件箱是空的！👍</div>}
                            {currentView !== 'list' && currentView !== 'inbox' && <div>此清单中没有待办事项！📝</div>}
                          </div>
                      </div>
                  ) : displayTodos.length > 0 ? (
                      <ul className="todo-list">
                          {displayTodos.map((todo: Todo) => (
                              <li key={todo.id} className={`todo-item ${todo.deleted ? 'deleted' : ''}`} onClick={() => setSelectedTodo(todo)}>
                                  <div className={`todo-content ${todo.completed ? "completed" : ""}`}>
                                      {todo.deleted ? (
                                          <button className="todo-btn btn-restore" onClick={(e) => { e.stopPropagation(); handleRestoreTodo(todo.id);}}>
                                              <Image src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkiIGhlaWdodD0iMTkiIHZpZXdCb3g9IjAgMCAxOSAxOSIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTcuMzQ3OTggMi42NTc5MkM3LjcxMTM0IDEuOTEzNDQgNy40MDIzOCAxLjAxNTM1IDYuNjU3OSAwLjY1MTk4OEM1LjkxMzQxIDAuMjg4NjI3IDUuMDE1MzIgMC41OTc1OSA0LjY1MTk2IDEuMzQyMDhMNy4zNDc5OCAyLjY1NzkyWk0xLjUyNiA5LjA4MzMzTDAuMzc1NTcxIDguMTIwNzhDMC4wNzc5NTE2IDguNDc2NDkgLTAuMDM4MzgyIDguOTQ5ODcgMC4wNjA0NjEyIDkuNDAzMDFDMC4xNTkzMDQgOS44NTYxNSAwLjQ2MjIwNiAxMC4yMzgxIDAuODgwOTI0IDEwLjQzNzVMMS41MjYgOS4wODMzM1pNMTQuNTcyNCAxNi41ODkzQzE0LjM0NTYgMTcuMzg2IDE0LjgwNzYgMTguMjE1OCAxNS42MDQ0IDE4LjQ0MjZDMTYuNDAxMiAxOC42Njk0IDE3LjIzMSAxOC4yMDczIDE3LjQ1NzggMTcuNDEwNkwxNC41NzI0IDE2LjU4OTNaTTYuMjUxOTIgMTQuMzMyMUM2LjcxMTE1IDE1LjAyMTMgNy42NDI3NiAxNS4yMDc2IDguMzMyMDUgMTQuNzQ4MUM5LjAyMTM0IDE0LjI4ODUgOS4yMDc2IDEzLjM1NzIgOC43NDgwOCAxMi42Njc5TDYuMjUxOTIgMTQuMzMyMVpNNC42NTE5NiAxLjM0MjA4QzMuNjc2NiAzLjM0MDQ3IDIuNjAwMzMgNS4wNDUyNSAxLjc2NjU4IDYuMjUxMDhDMS4zNTA1OSA2Ljg1MjcyIDAuOTk3MjYzIDcuMzI2ODUgMC43NTAzODQgNy42NDc3MkMwLjYyNzAwNSA3LjgwNzkzIDAuNTMwMzkyIDcuOTI5NyAwLjQ2NjA0NyA4LjAwOTY5QzAuNDMzODggOC4wNDk2NyAwLjQwOTc5NiA4LjA3OTIgMC4zOTQ0ODIgOC4wOTc4NkMwLjM4NjgyNiA4LjEwNzE4IDAuMzgxMzY0IDguMTEzNzkgMC4zNzgxODMgOC4xMTc2M0MwLjM3NjU5MiA4LjExOTU1IDAuMzc1NTcyIDguMTIwNzcgMC4zNzUxMzMgOC4xMjEzQzAuMzc0OTE0IDguMTIxNTcgMC4zNzQ4NCA4LjEyMTY1IDAuMzc0OTEyIDguMTIxNTdDMC4zNzQ5NDggOC4xMjE1MiAwLjM3NTAyMSA4LjEyMTQ0IDAuMzc1MTMxIDguMTIxM0MwLjM3NTE4NiA4LjEyMTI0IDAuMzc1Mjk2IDguMTIxMTEgMC4zNzUzMjMgOC4xMjEwN0MwLjM3NTQ0MiA4LjEyMDkzIDAuMzc1NTcxIDguMTIwNzggMS41MjYgOS4wODMzM0MyLjY3NjQzIDEwLjA0NTkgMi42NzY1OCAxMC4wNDU3IDIuNjc2NzMgMTAuMDQ1NUMyLjY3NjggMTAuMDQ1NCAyLjY3Njk2IDEwLjA0NTIgMi42NzcwOSAxMC4wNDUxQzIuNjc3MzUgMTAuMDQ0OCAyLjY3NzY1IDEwLjA0NDQgMi42Nzc5OCAxMC4wNDRDMi42Nzg2NSAxMC4wNDMyIDIuNjc5NDYgMTAuMDQyMyAyLjY4MDQyIDEwLjA0MTFDMi42ODIzNCAxMC4wMzg4IDIuNjg0ODYgMTAuMDM1OCAyLjY4Nzk0IDEwLjAzMkMyLjY5NDEyIDEwLjAyNDYgMi43MDI2MSAxMC4wMTQzIDIuNzEzMzMgMTAuMDAxM0MyLjczNDc1IDkuOTc1MTYgMi43NjUwOCA5LjkzNzk1IDIuODAzNjIgOS44OTAwNUMyLjg4MDY3IDkuNzk0MjYgMi45OTA2IDkuNjU1NjEgMy4xMjc3OCA5LjQ3NzM4QzMuNDAyMDEgOS4xMjEwNiAzLjc4NTg3IDguNjA1NjIgNC4yMzQxNyA3Ljk1NzI1QzUuMTI5IDYuNjYzMDggNi4yODk3MiA0LjgyNjIgNy4zNDc5OCAyLjY1NzkyTDQuNjUxOTYgMS4zNDIwOFpNMi4wNDcwNCAxMC40ODk5QzMuNzc2MTcgOS44NDk0MiA1LjczMzE5IDkuMTcyMzEgNy42MzggOC43MjEzN0M5LjU3MDA4IDguMjY1OTkgMTEuMzAyNSA4LjA3NjMxIDEyLjYyODggOC4zMDE3QzEzLjg3NTIgOC41MTM1MiAxNC42Mjg0IDkuMDUwMDggMTUuMDE2MyAxMC4wNDA1QzE1LjQ2MjggMTEuMTgwNyAxNS41MzgzIDEzLjE5NTYgMTQuNTcyNCAxNi41ODkzTDE3LjQ1NzggMTcuNDEwNkMxOC4wODQzIDEzLjgwNDIgMTguNjE2NiAxMS4wMDY3IDE3LjgwOTcgOC45NDY0NkMxNi45NDQyIDYuNzM2MzQgMTUuMTMzNyA1LjY4NDM3IDEzLjEzMTQgNS4zNDQxMUMxMS4yMDkyIDUuMDE3NDMgOS4wMDc5OSA1LjMxNDEzIDYuOTQ2OSA1LjgwMjA2QzQuODU4NTYgNi4yOTY0NCAyLjc2MjgzIDcuMDI1NTggMS4wMDQ5NiA3LjY3NjczTDIuMDQ3MDQgMTAuNDg5OVpNOC43NDgwOCAxMi42Njc5QzcuNTIzMTIgMTAuODMwNSA1LjIyOTM0IDkuMTg1OTMgMi4xNzEwOCA3LjcyOTEzTDAuODgwOTI0IDEwLjQzNzVDMy43NzA2NiAxMS44MTQxIDUuNDc2ODggMTMuMTY5NSA2LjI1MTkyIDE0LjMzMjFMOC43NDgwOCAxMi42Njc5WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K" alt="还原" draggable={false} width={16} height={16}/>
                                          </button>
                                      ) : (
                                          <button
                                              className={`todo-btn ${todo.completed ? 'btn-unfinish' : 'btn-finish'}`}
                                              onClick={(e) => { e.stopPropagation(); handleToggleComplete(todo); }}>
                                              {todo.completed && <Image src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAyNCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIuMzYzMTcgOS42NzUwNkMxLjU1OTM5IDkuNDc0NDkgMC43NDUyMDQgOS45NjM0OCAwLjU0NDYyOSAxMC43NjczQzAuMzQ0MDU0IDExLjU3MSAwLjgzMzA0NyAxMi4zODUyIDEuNjM2ODMgMTIuNTg1OEwyLjM2MzE3IDkuNjc1MDZaTTguMTU4NzMgMTZMNi43ODA0MSAxNi41OTE4QzcuMDMwOTggMTcuMTc1NCA3LjYyMTk1IDE3LjU1NzkgOC4yNTU3NSAxNy40OTY5QzguODg5NTQgMTcuNDU1OCA5LjQyODc3IDE3LjAyIDkuNjAxOTEgMTYuNDA4OUw4LjE1ODczIDE2Wk0yMi4zMjYxIDMuNDY0MTNDMjMuMTM0NyAzLjI4NDA2IDIzLjY0NDIgMi40ODI1NyAyMy40NjQxIDEuNjczOTVDMjMuMjg0MSAwLjg2NTMyOCAyMi40ODI2IDAuMzU1NzkxIDIxLjY3MzkgMC41MzU4NjZMMjIuMzI2MSAzLjQ2NDEzWk0xLjYzNjgzIDEyLjU4NThDMi4wMjc2NCAxMi42ODMzIDMuMTIyOTkgMTMuMTUxIDQuMjc3OCAxMy45NDI2QzUuNDM5ODggMTQuNzM5MyA2LjM4OTA2IDE1LjY4MDMgNi43ODA0MSAxNi41OTE4TDkuNTM3MDUgMTUuNDA4MkM4LjgxMDk0IDEzLjcxNzEgNy4zMDE1NyAxMi4zNzgzIDUuOTc0MDYgMTEuNDY4MkM0LjYzOTI3IDEwLjU1MzIgMy4yMTM5OSA5Ljg4NzM4IDIuMzYzMTcgOS42NzUwNkwxLjYzNjgzIDEyLjU4NThaTTkuNjAxOTEgMTYuNDA4OUMxMC4xMzU5IDE0LjUyNDQgMTEuNDk0OCAxMS42NTg1IDEzLjY3MjcgOS4wNjM5NUMxNS44NDQ1IDYuNDc2NzUgMTguNzQxNyA0LjI2MjM1IDIyLjMyNjEgMy40NjQxM0wyMS42NzM5IDAuNTM1ODY2QzE3LjI1ODMgMS41MTkyIDEzLjgyNzUgNC4yMTM0MiAxMS4zNzQ5IDcuMTM1MTRDOC45Mjg1MiAxMC4wNDk1IDcuMzY2NzQgMTMuMjkyOSA2LjcxNTU1IDE1LjU5MTFMOS42MDE5MSAxNi40MDg5WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K" alt="标为未完成" className="icon-finish" draggable={false} width={24} height={18} />}
                                          </button>
                                      )}
                                      
                                      {todo.list_name && <span className="todo-list-name">[{todo.list_name}] </span>}
                                      {todo.title}
                                      {todo.due_date && currentView !== 'list' && !todo.deleted && <span className="todo-due-date">{utcToLocalDateString(todo.due_date)}</span>}
                                      
                                      {!todo.deleted && (
                                          <button className="todo-btn btn-delete" onClick={(e) => { e.stopPropagation(); handleDeleteTodo(todo.id);}}>
                                              <Image src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAxOCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xNS4wOTkzIDE3Ljc1OTdDMTUuNzk0OSAxOC4yMDk4IDE2LjcyMzUgMTguMDEwOCAxNy4xNzM2IDE3LjMxNTJDMTcuNjIzNiAxNi42MTk3IDE3LjQyNDYgMTUuNjkxMSAxNi43MjkxIDE1LjI0MUMxMy4zMDc5IDEzLjAyNzMgMTAuODIwOSAxMC45OTU5IDguOTIyNTEgOS4wMzczOUM5LjA5NzQyIDguODQ5ODIgOS4yNzI5MSA4LjY2NTcxIDkuNDQ4ODggOC40ODUzNEMxMS44ODY0IDUuOTg2OTIgMTQuMjQ3MiA0LjM4MDY2IDE2LjI5NDQgMy45NzEyMkMxNy4xMDY3IDMuODA4NzUgMTcuNjMzNSAzLjAxODUyIDE3LjQ3MTEgMi4yMDYxOEMxNy4zMDg2IDEuMzkzODQgMTYuNTE4NCAwLjg2NzAxMyAxNS4wNjYgMS4wMjk0OEMxMi4yNTMyIDEuNjIwMDUgOS44NjQwNiAzLjc2Mzc5IDcuMzAxNTQgNi4zOTA0N0M3LjE4MTUxIDYuNTEzNCA3LjA2MTgxIDYuNjM3ODkgNi45NDI0OSA2Ljc2Mzc1QzUuNDIwMDEgNC44MDQzMyA0LjM3MDU4IDIuODc2MzIgMy40MjU5MSAwLjg2MzE2NEMzLjA3Mzk5IDAuMTEzMjAyIDIuMTgwNzMgLTAuMjA5NDc1IDEuNDMwNzcgMC4xNDI0NDVDMC42ODA4MDkgMC40OTQzNjUgMC4zNTgxMzIgMS4zODc2MiAwLjcxMDA1MSAyLjEzNzU4QzEuODIwODggNC41MDQ4MSAzLjA3ODk5IDYuNzY1MTEgNC45MjkzMiA5LjA1MzA2QzMuMjIyMDYgMTEuMTM0MSAxLjYyNjY5IDEzLjQzMjggMC4yMjI3MjMgMTUuNzE0MkMtMC4yMTE0NTMgMTYuNDE5NyAwLjAwODUyNzUyIDE3LjM0MzcgMC43MTQwNjQgMTcuNzc3OEMxLjQxOTYgMTguMjEyIDIuMzQzNTIgMTcuOTkyIDIuNzc3NyAxNy4yODY1QzQuMDQ4MTkgMTUuMjIyIDUuNDY0MDUgMTMuMTcyNiA2Ljk1NTU5IDExLjMxNjhDOC45ODUgMTMuMzc2NSAxMS41OTU5IDE1LjQ5MjggMTUuMDk5MyAxNy43NTk3WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K" alt="删除" draggable={false} width={18} height={18}/>
                                          </button>
                                      )}
                                  </div>
                              </li>
                          ))}
                      </ul>
                  ) : currentView === 'recycle' && recycled.length === 0 ? (
                      <div className="todo-list">
                          <div className="empty-tips"><div>回收站是空的！🗑️</div></div>
                      </div>
                  ) : null}

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