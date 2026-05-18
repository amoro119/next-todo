// app/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { useLiveQuery as useDexieLiveQuery } from "dexie-react-hooks";
import debounce from "lodash.debounce";
import { parseDidaCsv } from "../lib/csvParser";
import { TodoList } from "../components/TodoList";
import { ViewSwitcher } from "../components/ViewSwitcher";
import ShortcutSwitch from "../components/ModeSwitcher";
import ContainerHeader from "../components/ContainerHeader";
import GoalsMainInterface, {
  GoalsMainInterfaceRef,
} from "../components/goals/GoalsMainInterface";
import GoalsList from "../components/goals/GoalsList";
import GoalModal, { GoalFormData } from "../components/goals/GoalModal";
import GoalDetails from "../components/goals/GoalDetails";
import GoalHeader from "../components/goals/GoalHeader";
import TodoModal from "../components/TodoModal";
import ManageListsModal from "../components/ManageListsModal";
import TaskSearchModal from "../components/TaskSearchModal";
import CalendarView from "../components/CalendarView";
import {
  useOptimizedInboxFilter,
  useOptimizedInboxSort,
  useInboxCacheCleanup,
} from "../components/InboxPerformanceOptimizer";
import type { Todo, List, Goal } from "../lib/types";
import { RecurringTaskIntegration } from "../lib/recurring/RecurringTaskIntegration";
import { UpgradePrompt } from "../components/UpgradePrompt";
import SyncSettingsModal from "../components/SyncSettingsModal";
import { ModeIndicator } from "../components/ModeIndicator";
import { db } from "@/lib/db/dexie";
import { createDexieDatabaseAPI } from "@/lib/db/databaseAPI";
import type { DatabaseAPI } from "@/lib/db/databaseAPI";
import { useTodosQuery, useListsQuery, useGoalsQuery } from "@/lib/hooks/useDexieQuery";
import type { Todo as DbTodo } from "@/lib/db/types";

/**
 * 清理 UUID 字段，确保只有有效的 UUID 字符串被保留
 */
function sanitizeUuidField(value: unknown): string | null {
  if (!value) return null;
  
  const stringValue = String(value);
  
  // 检查是否是有效的 UUID 格式 (8-4-4-4-12 格式)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (uuidRegex.test(stringValue)) {
    return stringValue;
  }
  
  // 如果不是有效的 UUID，返回 null
  console.warn(`Invalid UUID value received: ${stringValue}, setting to null`);
  return null;
}

// Backward-compat wrapper for RecurringTaskIntegration
function createBackwardCompatApi(base: DatabaseAPI): DatabaseAPI & {
  insert: (table: string, data: Record<string, unknown>) => Promise<unknown>;
  query: <T = unknown>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
  transaction: (queries: Array<{ sql: string; params?: unknown[] }>) => Promise<void>;
} {
  return {
    ...base,

    async insert(table: string, data: Record<string, unknown>) {
      if (table === "todos") {
        const mapped: Record<string, unknown> = {
          ...data,
          content: data.content ?? data.notes ?? null,
        };
        delete mapped.notes;
        delete mapped.list_name;
        return base.addTodo(mapped as Partial<DbTodo>);
      }
      if (table === "lists") return base.addList(data as Partial<List>);
      if (table === "goals") return base.addGoal(data as Partial<Goal>);
      throw new Error(`Unsupported table: ${table}`);
    },

    async query<T = unknown>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> {
      if (sql.includes("SELECT * FROM todos WHERE id = ANY(")) {
        const todos = await base.getTodos();
        const ids = (params?.[0] as string[]) || [];
        const matched = todos.filter(t => ids.includes(t.id));
        return { rows: matched as T[] };
      }
      if (sql.includes("SELECT * FROM todos WHERE id")) {
        const todos = await base.getTodos();
        const id = params?.[0] as string;
        const matched = todos.filter(t => t.id === id);
        return { rows: matched as T[] };
      }
      if (sql.includes("SELECT id FROM todos WHERE is_recurring")) {
        const todos = await base.getTodos();
        const matched = todos
          .filter(t => t.is_recurring && !t.completed)
          .map(t => ({ id: t.id }));
        return { rows: matched as T[] };
      }
      console.warn("Unsupported query pattern:", sql.substring(0, 80));
      return { rows: [] as T[] };
    },

    async transaction(queries: Array<{ sql: string; params?: unknown[] }>) {
      for (const q of queries) {
        if (q.sql.toUpperCase().startsWith("INSERT INTO TODOS")) {
          const p = (q.params || []) as unknown[];
          const data: Record<string, unknown> = {
            id: p[0],
            title: p[1],
            content: p[2] ?? null,
            completed: p[3] ?? false,
            due_date: p[4] ?? null,
            created_time: p[5] ?? new Date().toISOString(),
            repeat: p[7] ?? null,
            is_recurring: p[8] ?? false,
            instance_number: p[9] ?? null,
            next_due_date: p[10] ?? null,
          };
          await base.addTodo(data as Partial<DbTodo>);
        }
      }
    },
  };
}

// --- 日期缓存类 ---
class DateCache {
  // ... (no changes in this class)
  // ...
  private dateCache = new Map<string, string>();
  private todayCache: { date: string; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 60000; // 1分钟缓存

  getTodayString(): string {
    const now = Date.now();
    if (
      !this.todayCache ||
      now - this.todayCache.timestamp > this.CACHE_DURATION
    ) {
      const date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
      this.todayCache = { date, timestamp: now };
    }
    return this.todayCache.date;
  }

  getDateCache(utcDate: string | null | undefined): string {
    if (!utcDate) return "";
    return this.dateCache.get(utcDate) || "";
  }

  setDateCache(utcDate: string, result: string) {
    this.dateCache.set(utcDate, result);
  }

  clear() {
    this.dateCache.clear();
  }
}

const dateCache = new DateCache();

// --- 日期转换函数 ---
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  if (!utcDate) return "";

  const cached = dateCache.getDateCache(utcDate);
  if (cached) return cached;

  try {
    const date = new Date(utcDate);
    if (isNaN(date.getTime())) return "";

    const result = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);

    dateCache.setDateCache(utcDate, result);
    return result;
  } catch {
    return "";
  }
};

const localDateToEndOfDayUTC = (
  localDate: string | null | undefined
): string | null => {
  if (!localDate) return null;
  // 与 TodoDetailsModal.tsx 中 localDateToDbUTC 保持一致
  if (/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
    const [year, month, day] = localDate.split("-").map(Number);
    const d = new Date(Date.UTC(year, month - 1, day, 16, 0));
    d.setUTCDate(d.getUTCDate() - 1); // 减一天
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
      d.getUTCDate()
    )} 16:00:00+00`;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(localDate))
    return localDate; // ISO 8601 format
  return null;
};

// --- 数据标准化函数 ---
function formatDbDate(val: unknown): string | null {
  if (!val) return null;
  if (typeof val === "string") {
    // 旧格式 "YYYY-MM-DD 160000" → 修复为标准 UTC 后转换
    if (/^\d{4}-\d{2}-\d{2} 160000$/.test(val)) {
      val = val.replace(' 160000', ' 16:00:00+00');
    }
    // 数据库 UTC 格式 "YYYY-MM-DD HH:mm:ss+HH" → 转换为 Asia/Shanghai 纯日期
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}[+-]\d{2}$/.test(val)) {
      try {
        const date = new Date(val);
        if (!isNaN(date.getTime())) {
          return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          }).format(date);
        }
      } catch { /* fall through */ }
      return null;
    }
    // 已经是纯日期格式 YYYY-MM-DD（无时区信息，直接返回）
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val;
    // ISO 字符串或其他可解析格式 → 用 Intl 转换到 Asia/Shanghai 日期
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(d);
    }
  }
  return null;
}

const normalizeTodo = (raw: Todo): Todo => ({
  id: String(raw.id),
  title: String(raw.title || ""),
  completed: Boolean(raw.completed),
  deleted: Boolean(raw.deleted_at) || Boolean(raw.deleted),
  sort_order: Number(raw.sort_order) || 0,
  due_date: formatDbDate(raw.due_date),
  content: raw.content ? String(raw.content) : null,
  tags: raw.tags ? String(raw.tags) : null,
  priority: Number(raw.priority) || 0,
  created_time: raw.created_time
    ? String(raw.created_time)
    : new Date().toISOString(),
  completed_time: raw.completed_time ? String(raw.completed_time) : null,
  start_date: formatDbDate(raw.start_date),
  list_id: raw.list_id ? String(raw.list_id) : null,
  list_name: raw.list_name ? String(raw.list_name) : null,
  // 重复任务相关字段
  repeat: raw.repeat ? String(raw.repeat) : null,
  reminder: raw.reminder ? String(raw.reminder) : null,
  is_recurring: Boolean(raw.is_recurring),
  recurring_parent_id: raw.recurring_parent_id
    ? String(raw.recurring_parent_id)
    : null,
  instance_number: raw.instance_number ? Number(raw.instance_number) : null,
  next_due_date: formatDbDate(raw.next_due_date),
  // 目标关联字段
  goal_id: sanitizeUuidField(raw.goal_id),
  sort_order_in_goal: raw.sort_order_in_goal
    ? Number(raw.sort_order_in_goal)
    : null,
});

const normalizeList = (raw: List): List => ({
  // ... (no changes in this function)
  // ...
  id: String(raw.id),
  name: String(raw.name || ""),
  sort_order: Number(raw.sort_order) || 0,
  is_hidden: Boolean(raw.is_hidden),
  modified: raw.modified ? String(raw.modified) : new Date().toISOString(),
});

type LastAction =
  | {
      type: "toggle-complete";
      data: {
        id: string;
        previousCompletedTime: string | null;
        previousCompleted: boolean;
      };
    }
  | { type: "delete"; data: Todo }
  | { type: "restore"; data: Todo }
  | {
      type: "batch-complete";
      data: {
        id: string;
        previousCompletedTime: string | null;
        previousCompleted: boolean;
      }[];
    };

export default function TodoListPage() {
  const api = useMemo(() => {
    const base = createDexieDatabaseAPI(db);
    return createBackwardCompatApi(base);
  }, []);

  // 初始化重复任务系统
  useEffect(() => {
    RecurringTaskIntegration.initialize(api);
  }, [api]);

  // 模式状态管理
  const [currentMode, setCurrentMode] = useState<"todo" | "goals">(() => {
    if (typeof window !== "undefined") {
      const savedMode = localStorage.getItem("app_mode") as "todo" | "goals";
      return savedMode || "todo";
    }
    return "todo";
  });

  const [currentView, setCurrentView] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("currentView") || "today";
    }
    return "inbox";
  });

  const [searchRefreshTrigger, setSearchRefreshTrigger] = useState(0);

  useEffect(() => {
    localStorage.setItem("currentView", currentView);
  }, [currentView]);

  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoDate, setNewTodoDate] = useState<string | null>(null);
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [slogan, setSlogan] = useState("今日事今日毕，勿将今事待明日!.☕");
  const [originalSlogan, setOriginalSlogan] = useState(slogan);
  const [isEditingSlogan, setIsEditingSlogan] = useState(false);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [isManageListsModalOpen, setIsManageListsModalOpen] = useState(false);
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [isCalendarCreateModalOpen, setIsCalendarCreateModalOpen] =
    useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string>("");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const goalsMainInterfaceRef = useRef<GoalsMainInterfaceRef>(null);
  const addTodoInputRef = useRef<HTMLInputElement>(null);

  // 使用 Dexie hooks 替代 useLiveQuery
  const { data: todosRaw } = useTodosQuery();
  const { data: listsRaw } = useListsQuery();
  const { data: goalsRaw } = useGoalsQuery();
  const sloganMeta = useDexieLiveQuery(() => db.meta.get("slogan"), []);

  const todos = useMemo(() => {
    if (!todosRaw) return [];
    const normalized = todosRaw.map(normalizeTodo);
    const completedCount = normalized.filter(t => t.completed).length;
    const withDueDate = normalized.filter(t => !!t.due_date).length;
    const withStartDate = normalized.filter(t => !!t.start_date).length;
    console.log(`[page.tsx] todos: ${todosRaw.length} raw → ${normalized.length} normalized | completed=${completedCount} | withDueDate=${withDueDate} | withStartDate=${withStartDate} | deleted=${normalized.filter(t => t.deleted).length}`);
    return normalized;
  }, [todosRaw]);

  const lists = useMemo(() => {
    if (!listsRaw) return [];
    return listsRaw.map(normalizeList);
  }, [listsRaw]);

  const goals = useMemo(() => {
    if (!goalsRaw || !listsRaw || !todosRaw) return [];
    return goalsRaw.map((goal) => {
      const list = listsRaw.find((l) => l.id === goal.list_id);
      const taskTodos = todosRaw.filter(
        (t) => t.goal_id === goal.id && !t.deleted
      );
      const completedTasks = taskTodos.filter((t) => t.completed);
      return {
        ...goal,
        list_name: list?.name ?? null,
        total_tasks: taskTodos.length,
        completed_tasks: completedTasks.length,
        progress:
          taskTodos.length > 0
            ? Math.round((completedTasks.length / taskTodos.length) * 100)
            : 0,
      } as Goal;
    });
  }, [goalsRaw, listsRaw, todosRaw]);

  useEffect(() => {
    if (sloganMeta?.value) {
      setSlogan(String(sloganMeta.value));
    }
  }, [sloganMeta]);

  // 使用优化的收件箱过滤函数
  const {
    filterInboxTodos,
    utcToLocalDateString: optimizedUtcToLocalDateString,
  } = useOptimizedInboxFilter();
  const { sortInboxTodos } = useOptimizedInboxSort();
  const { clearFilterCache } = useInboxCacheCleanup();

  // --- FIX START: Create todos with list names ---
  const todosWithListNames = useMemo(() => {
    const listMap = new Map(lists.map((list) => [list.id, list.name]));
    const result = todos.map((todo) => ({
      ...todo,
      list_name: todo.list_id ? listMap.get(todo.list_id) || null : null,
    }));
    console.log(`[page.tsx] todosWithListNames: ${todos.length} → ${result.length}`);
    return result;
  }, [todos, lists]);
  // --- FIX END ---

  // 修复：添加一个状态来跟踪当前日期，并定期更新
  const [todayStrInUTC8, setTodayStrInUTC8] = useState(() =>
    dateCache.getTodayString()
  );

  // 定期更新日期状态
  useEffect(() => {
    const interval = setInterval(() => {
      setTodayStrInUTC8(dateCache.getTodayString());
    }, 60000); // 每分钟检查一次

    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcut for search modal (Ctrl+K / Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsSearchModalOpen((prev) => !prev);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // 在视图切换时清空输入框
  useEffect(() => {
    setNewTodoTitle("");
    setNewGoalTitle("");
  }, [currentView]);

  // 模式切换事件监听器
  useEffect(() => {
    const handleModeChange = (event: CustomEvent) => {
      const { mode } = event.detail;
      setCurrentMode(mode);
    };

    window.addEventListener("modeChanged", handleModeChange as EventListener);
    return () =>
      window.removeEventListener(
        "modeChanged",
        handleModeChange as EventListener
      );
  }, []);
  // --- FIX: Use todosWithListNames for all subsequent calculations ---
  const uncompletedTodos = useMemo(
    () => {
      const result = todosWithListNames.filter((t: Todo) => !t.completed && !t.deleted);
      console.log(`[page.tsx] uncompletedTodos: ${todosWithListNames.length} → ${result.length} (filtered completed=${todosWithListNames.filter(t => t.completed).length}, deleted=${todosWithListNames.filter(t => t.deleted).length})`);
      if (result.length > 0 && result.length <= 10) {
        result.forEach(t => {
          console.log(`[page.tsx] uncompleted: id=${t.id} title="${t.title.substring(0, 30)}" list_id=${t.list_id || 'null'} due_date=${t.due_date || 'null'} start_date=${t.start_date || 'null'} repeat=${!!t.repeat} recurring_parent_id=${!!t.recurring_parent_id} deleted=${t.deleted}`);
        });
      }
      return result;
    },
    [todosWithListNames]
  );

  // Memoized values for GoalModal to prevent unnecessary re-renders
  const memoizedLists = useMemo(() => lists, [lists]);
  const memoizedUncompletedTodos = useMemo(
    () => uncompletedTodos,
    [uncompletedTodos]
  );

  const completedTodos = useMemo(
    () =>
      // ... (no changes in this block)
      // ...
      todosWithListNames.filter((t: Todo) => t.completed && !t.deleted),
    [todosWithListNames]
  );

  const recycledTodos = useMemo(
    () =>
      // ... (no changes in this block)
      // ...
      todosWithListNames.filter((t: Todo) => t.deleted),
    [todosWithListNames]
  );

  // 优化的收件箱数据计算 - 使用独立的useMemo
  const inboxTodos = useMemo(() => {
    if (currentView !== "inbox") return [];

    const filteredTodos = filterInboxTodos(uncompletedTodos);
    console.log(`[page.tsx] inbox filter: ${uncompletedTodos.length} uncompleted → ${filteredTodos.length} passed`);

    const sortedTodos = sortInboxTodos(filteredTodos);

    return sortedTodos;
  }, [currentView, uncompletedTodos, filterInboxTodos, sortInboxTodos]);

  // 优化的今日任务计算
  const todayTodos = useMemo(() => {
    if (currentView !== "today") return [];

    const sample = todosWithListNames.slice(0, 5);
    sample.forEach(t => {
      if (t.due_date) {
        console.log(`[today-debug] due_date raw="${t.due_date}" → utcToLocal="${utcToLocalDateString(t.due_date)}" | parsed=${new Date(t.due_date).toString()} | valid=${!isNaN(new Date(t.due_date).getTime())}`);
      }
    });

    const result = todosWithListNames
      .filter((t: Todo) => {
        if (t.deleted) return false;

        const startDateStr = utcToLocalDateString(t.start_date);
        const dueDateStr = utcToLocalDateString(t.due_date);

        // If task has both start_date and due_date, check if today is within the range
        if (startDateStr && dueDateStr) {
          return startDateStr <= todayStrInUTC8 && dueDateStr >= todayStrInUTC8;
        }

        // If task only has due_date, check if due_date is today or past
        if (dueDateStr) {
          return dueDateStr <= todayStrInUTC8;
        }

        // If task only has start_date, check if start_date is today or past
        if (startDateStr) {
          return startDateStr <= todayStrInUTC8 && !t.completed;
        }

        return false;
      })
      .sort((a: Todo, b: Todo) => {
        const aDate = utcToLocalDateString(a.due_date || a.start_date);
        const bDate = utcToLocalDateString(b.due_date || b.start_date);
        if (aDate && bDate) return aDate.localeCompare(bDate);
        if (aDate) return -1;
        if (bDate) return 1;
        return 0;
      });
    console.log(`[page.tsx] today filter: ${todosWithListNames.length} total → ${result.length} passed (today=${todayStrInUTC8})`);
    return result;
  }, [currentView, todosWithListNames, todayStrInUTC8]);

  const listTodos = useMemo(() => {
    if (currentView === "inbox" || currentView === "completed" ||
        currentView === "recycle" || currentView === "today" ||
        currentView === "calendar" || currentView === "goals-main") {
      return [];
    }

    const list = lists.find((l: List) => l.name === currentView);
    return list
      ? uncompletedTodos.filter((t: Todo) => t.list_id === list.id)
      : uncompletedTodos;
  }, [currentView, lists, uncompletedTodos]);

  // 轻量级的displayTodos计算 - 只做简单的选择
  const displayTodos = useMemo(() => {
    switch (currentView) {
      case "inbox":
        return inboxTodos;
      case "completed":
        return completedTodos;
      case "recycle":
        return recycledTodos;
      case "today":
        return todayTodos;
      case "calendar":
        return uncompletedTodos;
      default:
        return listTodos;
    }
  }, [
    currentView,
    inboxTodos,
    completedTodos,
    recycledTodos,
    todayTodos,
    uncompletedTodos,
    listTodos,
  ]);

  const todosByList = useMemo(() => {
    // ... (no changes in this block)
    // ...
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

  // 计算各清单下的目标数量
  const goalsByList = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const goal of goals) {
      if (goal.list_id) {
        const list = lists.find((l: List) => l.id === goal.list_id);
        if (list) {
          counts[list.name] = (counts[list.name] || 0) + 1;
        }
      }
    }
    return counts;
  }, [goals, lists]);

  const recycleBinCount = useMemo(() => recycledTodos.length, [recycledTodos]);

  useEffect(() => {
    // ... (no changes in this block)
    // ...
    const interval = setInterval(() => {
      dateCache.clear();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleEditSlogan = useCallback(() => {
    // ... (no changes in this block)
    // ...
    setOriginalSlogan(slogan);
    setIsEditingSlogan(true);
  }, [slogan]);

  const handleUpdateSlogan = useCallback(
    debounce(async () => {
      setIsEditingSlogan(false);
      if (slogan === originalSlogan) return;
      await db.meta.put({
        key: "slogan",
        value: slogan,
        updated_at: new Date().toISOString(),
        deleted_at: null,
      });
    }, 500),
    [slogan, originalSlogan]
  );

  const handleSloganKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // ... (no changes in this block)
      // ...
      if (e.key === "Enter") handleUpdateSlogan();
      else if (e.key === "Escape") {
        setSlogan(originalSlogan);
        setIsEditingSlogan(false);
      }
    },
    [handleUpdateSlogan, originalSlogan]
  );

  const handleAddTodo = useCallback(() => {
    if (!newTodoTitle.trim()) return;
    setIsTodoModalOpen(true);
  }, [newTodoTitle]);

  const handleCreateTodo = useCallback(
    async (todoData: Omit<Todo, "id" | "created_time">) => {
      const newTodoData = {
        ...todoData,
        id: uuid(),
        created_time: new Date().toISOString(),
      };

      await api.addTodo(newTodoData);
      setIsTodoModalOpen(false);
      setNewTodoTitle("");
      // 修复：只有在非日历视图下才重置日期，保持日历视图中的日期状态
      if (currentView !== "calendar") {
        setNewTodoDate(null);
      }
    },
    [api, currentView]
  );

  const handleCreateTodoFromCalendar = useCallback(
    async (
      title: string,
      listId: string | null,
      startDate: string | null,
      dueDate: string | null
    ) => {
      const newTodoData = {
        id: uuid(),
        title: title,
        list_id: listId,
        start_date: startDate,
        due_date: dueDate,
        created_time: new Date().toISOString(),
        completed: false,
        deleted: false,
      };

      await api.addTodo(newTodoData);
      setIsCalendarCreateModalOpen(false);
    },
    [api]
  );

  const handleUpdateTodo = useCallback(
    async (
      todoId: string,
      updates: Partial<Omit<Todo, "id" | "list_name">>
    ) => {
      // 检查 updates 是否为 null 或 undefined
      if (!updates || Object.keys(updates).length === 0) return;
      
      // 先更新任务
      await api.updateTodo(todoId, updates);
      
      // 如果是完成操作，处理周期任务
      if (updates.completed === true) {
        try {
          await RecurringTaskIntegration.handleTaskUpdate(todoId, updates, api);
        } catch (error) {
          console.error('Failed to handle recurring task:', error);
          // 不影响原任务的完成状态
        }
      }
    },
    [api]
  );

  const handleToggleComplete = useCallback(
    async (todo: Todo) => {
      // 只负责状态管理，不直接处理周期任务
      setLastAction({
        type: "toggle-complete",
        data: {
          id: todo.id,
          previousCompletedTime: todo.completed_time,
          previousCompleted: !!todo.completed,
        },
      });
      
      const updates = {
        completed_time: todo.completed ? null : new Date().toISOString(),
        completed: !todo.completed,
      };

      // 统一通过 handleUpdateTodo 处理
      await handleUpdateTodo(todo.id, updates);
      
      setSearchRefreshTrigger((prev) => prev + 1);
    },
    [handleUpdateTodo]
  );

  const handleDeleteTodo = useCallback(
    async (todoId: string) => {
      const todoToDelete = todos.find((t: Todo) => t.id === todoId);
      if (!todoToDelete) return;
      setLastAction({ type: "delete", data: todoToDelete });
      if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
      await api.updateTodo(todoId, { deleted: true });
      // 触发搜索结果刷新
      setSearchRefreshTrigger((prev) => prev + 1);
    },
    [todos, selectedTodo, api]
  );

  const handleRestoreTodo = useCallback(
    async (todoId: string) => {
      const todoToRestore = recycledTodos.find((t: Todo) => t.id === todoId);
      if (!todoToRestore) return;
      setLastAction({ type: "restore", data: todoToRestore });
      if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
      await api.updateTodo(todoId, { deleted: false });
      // 触发搜索结果刷新
      setSearchRefreshTrigger((prev) => prev + 1);
    },
    [recycledTodos, selectedTodo, api]
  );

  const handlePermanentDeleteTodo = useCallback(
    async (todoId: string) => {
      const todoToDelete = recycledTodos.find((t: Todo) => t.id === todoId);
      if (!todoToDelete) return;
      const confirmed = window.confirm(
        `确认要永久删除任务 "${todoToDelete.title}" 吗？此操作无法撤销。`
      );
      if (confirmed) {
        await api.deleteTodo(todoId);
        if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
      }
    },
    [recycledTodos, selectedTodo, api]
  );

  const handleSaveTodoDetails = useCallback(
    async (updatedTodo: Todo) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { list_name: _, ...updateData } = updatedTodo;
      await handleUpdateTodo(updatedTodo.id, updateData);
      setSelectedTodo(null);
      // 触发搜索结果刷新
      setSearchRefreshTrigger((prev) => prev + 1);
    },
    [handleUpdateTodo]
  );

  const handleAddList = useCallback(
    async (name: string): Promise<List | null> => {
      try {
        const newList = {
          id: uuid(),
          name,
          sort_order: lists.length,
          is_hidden: false,
          modified: new Date().toISOString(),
        };
        await api.addList(newList);
        return newList;
      } catch (error) {
        console.error("Failed to add list:", error);
        alert(
          `添加清单失败: ${
            error instanceof Error ? error.message : "未知错误"
          }`
        );
        return null;
      }
    },
    [lists, api]
  );

  const handleDeleteList = useCallback(
    async (listId: string) => {
      const listToDelete = lists.find((l: List) => l.id === listId);
      if (!listToDelete) return;
      const confirmed = window.confirm(
        `确认删除清单 "${listToDelete.name}" 吗？清单下的所有待办事项将被移至收件箱。`
      );
      if (!confirmed) return;

      // 获取需要更新的待办事项
      const allTodos = await api.getTodos();
      const todosToUpdate = allTodos.filter((t) => t.list_id === listId);

      // 1. 先将清单下的所有待办事项移至收件箱
      for (const todo of todosToUpdate) {
        await api.updateTodo(todo.id, { list_id: null });
      }

      // 2. 删除清单
      await api.deleteList(listId);

      if (currentView === listToDelete.name) setCurrentView("inbox");
    },
    [lists, currentView, api]
  );

  const handleUpdateList = useCallback(
    async (listId: string, updates: Partial<Omit<List, "id">>) => {
      if (Object.keys(updates).length === 0) return;
      await api.updateList(listId, updates);
    },
    [api]
  );

  const handleUpdateListsOrder = useCallback(
    async (reorderedLists: List[]) => {
      for (let index = 0; index < reorderedLists.length; index++) {
        const list = reorderedLists[index];
        await api.updateList(list.id, { sort_order: index });
      }
    },
    [api]
  );

  const handleAddTodoFromCalendar = useCallback((date: string) => {
    // ... (no changes in this block)
    // ...
    setNewTodoDate(date);
    addTodoInputRef.current?.focus();
  }, []);

  const handleOpenCalendarCreateModal = useCallback((date: string) => {
    setCalendarSelectedDate(date);
    setIsCalendarCreateModalOpen(true);
  }, []);

  // 目标相关处理函数
  const handleCreateGoal = useCallback(() => {
    setIsGoalModalOpen(true);
  }, []);

  const handleEditGoal = useCallback((goal: Goal) => {
    setEditingGoalId(goal.id);
    setIsGoalModalOpen(true);
  }, []);

  const handleSubmitGoal = useCallback(async () => {
    if (!newGoalTitle.trim()) return;

    // 设置临时状态并打开模态框，让GoalModal处理创建逻辑
    setEditingGoalId("new");
    setIsGoalModalOpen(true);
  }, [newGoalTitle]);

  const handleCloseGoalModal = useCallback(() => {
    setIsGoalModalOpen(false);
    setEditingGoalId(null);
  }, []);

  const handleGoalCreated = useCallback(
    async (goalId: string): Promise<void> => {
      console.log("目标创建成功，准备切换到详情页面，目标ID:", goalId);

      return new Promise(async (resolve, reject) => {
        try {
          // 切换到目标模式
          setCurrentMode("goals");
          setCurrentView("goals-main");

          // 保存模式到 localStorage
          if (typeof window !== "undefined") {
            localStorage.setItem("app_mode", "goals");
          }

          // 从数据库查询新创建的目标
          const allGoals = await api.getGoals();
          const goalRaw = allGoals.find((g) => g.id === goalId);

          if (goalRaw) {
            const allLists = await api.getLists();
            const list = allLists.find((l) => l.id === goalRaw.list_id);
            const allTodos = await api.getTodos();
            const taskTodos = allTodos.filter(
              (t) => t.goal_id === goalId && !t.deleted
            );
            const completedTasks = taskTodos.filter((t) => t.completed);
            const goal = {
              ...goalRaw,
              list_name: list?.name ?? null,
              total_tasks: taskTodos.length,
              completed_tasks: completedTasks.length,
              progress:
                taskTodos.length > 0
                  ? Math.round(
                      (completedTasks.length / taskTodos.length) * 100
                    )
                  : 0,
            } as Goal;

            console.log("从数据库获取到目标数据:", goal);

            // 直接使用目标数据选择目标
            if (goalsMainInterfaceRef.current) {
              // 立即切换到目标详情页面，不等待 useLiveQuery 更新
              console.log("立即切换到目标详情页面");
              goalsMainInterfaceRef.current.selectGoalDirectly(goal);

              // 给一个很短的延迟确保状态更新完成
              setTimeout(() => {
                console.log("目标切换完成");
                resolve();
              }, 50);
            } else {
              console.error("GoalsMainInterface ref 不可用");
              reject(new Error("GoalsMainInterface ref 不可用"));
            }
          } else {
            console.error("数据库中未找到新创建的目标");
            reject(new Error("数据库中未找到新创建的目标"));
          }
        } catch (error) {
          console.error("查询新创建的目标失败:", error);
          reject(error);
        }
      });
    },
    [api]
  );

  // 移除 handleViewGoalsList 函数，因为不再需要通过按钮进入目标列表

  const handleSaveGoal = useCallback(
    async (goalData: GoalFormData): Promise<string> => {
      try {
        console.log("开始保存目标:", goalData);

        // 检查是创建还是更新
        const isUpdate = !!(goalData.goalId && goalData.goalId !== "new");
        const goalId = isUpdate ? goalData.goalId : uuid();

        if (isUpdate) {
          // 更新模式
          const updateData = {
            name: goalData.name,
            description: goalData.description || null,
            list_id: sanitizeUuidField(goalData.list_id), // 使用 UUID 清理
            start_date: goalData.start_date || null,
            due_date: goalData.due_date || null,
            priority: goalData.priority || 0,
          };

          console.log("更新目标数据:", updateData);
          await api.updateGoal(goalId, updateData);
          console.log("目标更新成功，ID:", goalId);
          
          // 更新 selectedGoal 状态，确保 GoalDetails 页面显示最新的数据
          setSelectedGoal(prevSelectedGoal => {
            if (prevSelectedGoal && prevSelectedGoal.id === goalId) {
              return {
                ...prevSelectedGoal,
                ...updateData,
                id: goalId
              } as Goal;
            }
            return prevSelectedGoal;
          });

          // 更新 GoalsMainInterface 组件内部的 selectedGoal 状态
          if (goalsMainInterfaceRef.current) {
            const updatedGoal = {
              ...goals.find(g => g.id === goalId),
              ...updateData,
              id: goalId
            } as Goal;
            goalsMainInterfaceRef.current.updateSelectedGoal(updatedGoal);
          }
        } else {
          // 创建模式
          const goal = {
            id: goalId,
            name: goalData.name,
            description: goalData.description || null,
            list_id: sanitizeUuidField(goalData.list_id), // 使用 UUID 清理
            start_date: goalData.start_date || null,
            due_date: goalData.due_date || null,
            priority: goalData.priority || 0,
            created_time: new Date().toISOString(),
            is_archived: false,
          };

          console.log("准备插入目标数据:", goal);
          await api.addGoal(goal);
          console.log("目标插入成功，ID:", goalId);
        }

        // 只有在创建新目标或明确需要更新关联任务时才处理关联的待办事项
        if (!isUpdate) {
          const associatedTodos = goalData.associatedTodos || {
            existing: [],
            new: [],
          };

          // 关联现有待办事项
          if (associatedTodos.existing && associatedTodos.existing.length > 0) {
            console.log("关联现有待办事项:", associatedTodos.existing);
            for (let i = 0; i < associatedTodos.existing.length; i++) {
              const todoId = associatedTodos.existing[i];
              await api.updateTodo(todoId, {
                goal_id: goalId,
                sort_order_in_goal: i + 1,
              });
            }
          }

          // 创建新的待办事项
          if (associatedTodos.new && associatedTodos.new.length > 0) {
            console.log("创建新待办事项:", associatedTodos.new);
            const existingCount = associatedTodos.existing?.length || 0;
            for (let i = 0; i < associatedTodos.new.length; i++) {
              const todoTitle = associatedTodos.new[i];
              if (todoTitle.trim()) {
                const todoId = uuid();
                const newTodo = {
                  id: todoId,
                  title: todoTitle.trim(),
                  completed: false,
                  deleted: false,
                  sort_order: 0,
                  list_id: goalData.list_id || null,
                  goal_id: goalId,
                  sort_order_in_goal: existingCount + i + 1,
                  created_time: new Date().toISOString(),
                };
                await api.addTodo(newTodo);
              }
            }
          }
        }

        return goalId;
      } catch (error) {
        console.error("保存目标失败:", error);
        alert(
          `保存目标失败: ${
            error instanceof Error ? error.message : "未知错误"
          }`
        );
        throw error;
      }
    },
    [goals, api]
  );

  const handleUpdateGoal = useCallback(
    async (updatedGoal: Goal) => {
      try {
        // 移除计算字段和只读字段，这些字段不应该被更新到数据库中
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { list_name: _, progress: __, total_tasks: ___, completed_tasks: ____, ...updateData } = updatedGoal;
        // 清理 UUID 字段
        if (updateData.list_id !== undefined) {
          updateData.list_id = sanitizeUuidField(updateData.list_id);
        }
        await api.updateGoal(updatedGoal.id, updateData);
        
        // 更新 selectedGoal 状态，确保 GoalDetails 页面显示最新的数据
        setSelectedGoal(prevSelectedGoal => {
          if (prevSelectedGoal && prevSelectedGoal.id === updatedGoal.id) {
            return updatedGoal;
          }
          return prevSelectedGoal;
        });
        
        // 更新 GoalsMainInterface 组件内部的 selectedGoal 状态
        if (goalsMainInterfaceRef.current) {
          goalsMainInterfaceRef.current.updateSelectedGoal(updatedGoal);
        }
      } catch (error) {
        console.error("更新目标失败:", error);
        alert(
          `更新目标失败: ${error instanceof Error ? error.message : "未知错误"}`
        );
      }
    },
    [api]
  );

  const handleCreateTodoForGoal = useCallback(
    async (todoData: Partial<Todo>) => {
      try {
        const newTodo = {
          ...todoData,
          id: uuid(),
          created_time: new Date().toISOString(),
        };
        await api.addTodo(newTodo);
      } catch (error) {
        console.error("创建待办事项失败:", error);
        alert(
          `创建待办事项失败: ${
            error instanceof Error ? error.message : "未知错误"
          }`
        );
      }
    },
    [api]
  );

  const handleDeleteGoal = useCallback(
    async (goalId: string) => {
      const goalToDelete = goals.find((g: Goal) => g.id === goalId);
      if (!goalToDelete) return;
      
      const confirmed = window.confirm(
        `确认要删除目标 "${goalToDelete.name}" 吗？此操作无法撤销。`
      );
      
      if (confirmed) {
        await api.deleteGoal(goalId);
        // 同时删除与该目标关联的所有待办事项
        const allTodos = await api.getTodos();
        const todosToUpdate = allTodos.filter((t) => t.goal_id === goalId);
        
        // 将目标下的所有待办事项的目标ID设为null
        for (const todo of todosToUpdate) {
          await api.updateTodo(todo.id, { goal_id: null });
        }
      }
    },
    [goals, api]
  );

  const handleAssociateTasks = useCallback(
    async (taskIds: string[], goalId: string) => {
      try {
        // 更新每个任务的 goal_id 字段
        for (const taskId of taskIds) {
          await api.updateTodo(taskId, { goal_id: goalId });
        }
        console.log(`成功关联 ${taskIds.length} 个任务到目标 ${goalId}`);
      } catch (error) {
        console.error("关联任务失败:", error);
        alert(
          `关联任务失败: ${
            error instanceof Error ? error.message : "未知错误"
          }`
        );
      }
    },
    [api]
  );

  const handleUndo = useCallback(async () => {
    if (!lastAction) {
      alert("没有可撤销的操作");
      return;
    }
    try {
      switch (lastAction.type) {
        case "toggle-complete":
          await handleUpdateTodo(lastAction.data.id, {
            completed_time: lastAction.data.previousCompletedTime,
            completed: lastAction.data.previousCompleted,
          });
          break;
        case "delete":
          await handleUpdateTodo(lastAction.data.id, { deleted: false });
          break;
        case "restore":
          await handleUpdateTodo(lastAction.data.id, { deleted: true });
          break;
        case "batch-complete": {
          const lastActionData = lastAction.data;
          // 使用 handleUpdateTodo 确保一致性
          for (const d of lastActionData) {
            await handleUpdateTodo(d.id, {
              completed_time: d.previousCompletedTime,
              completed: d.previousCompleted,
            });
          }
          break;
        }
      }
    } catch (error) {
      alert(
        `撤销操作失败: ${error instanceof Error ? error.message : "未知错误"}`
      );
    }
    setLastAction(null);
  }, [lastAction, handleUpdateTodo]);

  const handleMarkAllCompleted = useCallback(async () => {
    const todosToUpdate = displayTodos.filter((t: Todo) => !t.completed_time);
    if (todosToUpdate.length === 0) return;
    const confirmed = await window.confirm(
      `确认将当前视图的 ${todosToUpdate.length} 项全部标记为完成吗？`
    );
    if (!confirmed) return;
    
    const newCompletedTime = new Date().toISOString();
    setLastAction({
      type: "batch-complete",
      data: todosToUpdate.map((t: Todo) => ({
        id: t.id,
        previousCompletedTime: t.completed_time,
        previousCompleted: !!t.completed,
      })),
    });
    
    // 使用 handleUpdateTodo 确保周期任务处理逻辑被正确触发
    const updates = {
      completed: true,
      completed_time: newCompletedTime,
    };
    
    // 逐个处理以确保周期任务生成
    for (const todo of todosToUpdate) {
      await handleUpdateTodo(todo.id, updates);
    }
  }, [displayTodos, handleUpdateTodo]);

  const handleImport = useCallback(
    async (file: File) => {
      // ... (no changes in this block)
      // ...
      const reader = new FileReader();
      reader.onload = async (e) => {
        const content = e.target?.result as string;
        if (!content) return;
        try {
          let todosToImport: Partial<Todo>[] = [];
          if (file.name.endsWith(".csv")) {
            const { todos, removedTodos } = parseDidaCsv(content);
            todosToImport = [...todos, ...removedTodos].map((t) => ({
              ...t,
              deleted: !!(t as unknown as { removed?: boolean }).removed,
            }));
            console.log(`[CSV Import] Parsed: ${todos.length} active + ${removedTodos.length} removed = ${todosToImport.length} total`);
            console.log(`[CSV Import] With completedTime: ${todosToImport.filter(t => t.completed_time).length} | Without: ${todosToImport.filter(t => !t.completed_time).length}`);
          } else if (file.name.endsWith(".sql")) {
            // SQL 导入暂不支持 - 使用 Dexie 后不再直接执行 SQL
            alert("SQL 文件导入在当前版本中暂不可用。请使用 CSV 格式导入。");
            return;
          } else {
            alert("不支持的文件格式。请选择 .csv 或 .sql 文件。");
            return;
          }
          if (todosToImport.length === 0) {
            alert("没有找到可导入的事项。");
            return;
          }

          // 检查和预览重复任务
          const recurringTasks = todosToImport.filter(
            (todo) => todo.is_recurring && todo.repeat
          );
          if (recurringTasks.length > 0) {
            const previewMessage =
              `发现 ${recurringTasks.length} 个重复任务：\n\n` +
              recurringTasks
                .map((task) => {
                  try {
                    const description = task.repeat
                      ? require("../lib/recurring/RRuleEngine").RRuleEngine.generateHumanReadableDescription(
                          task.repeat
                        )
                      : "重复任务";
                    return `• ${task.title}: ${description}`;
                  } catch (error) {
                    return `• ${task.title}: 重复任务 (格式可能有误)`;
                  }
                })
                .join("\n") +
              "\n\n是否继续导入？";

            const confirmed = confirm(previewMessage);
            if (!confirmed) {
              return;
            }
          }
          const listNames = new Set(
            todosToImport
              .map((t) => t.list_name)
              .filter((s): s is string => !!s)
          );
          const existingListNames = new Set(lists.map((l: List) => l.name));
          const newListsToCreate = [...listNames].filter(
            (name) => !existingListNames.has(name)
          );

          const createdLists: List[] = [];
          for (let i = 0; i < newListsToCreate.length; i++) {
            const listName = newListsToCreate[i];
            const newListData = {
              id: uuid(),
              name: listName,
              is_hidden: false,
              sort_order: lists.length + i,
            };
            createdLists.push(newListData);
            await api.addList(newListData);
          }

          const currentLists = await api.getLists();
          const listNameToIdMap = new Map<string, string>();
          currentLists.forEach((list) =>
            listNameToIdMap.set(list.name, list.id)
          );

          const createdTodos: Todo[] = [];
          for (const todo of todosToImport) {
            const listId = todo.list_name
              ? listNameToIdMap.get(todo.list_name) || null
              : null;
            const newTodoData = {
              id: uuid(),
              title: todo.title || "",
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
              repeat: todo.repeat || null,
              reminder: todo.reminder || null,
              is_recurring: todo.is_recurring || false,
              recurring_parent_id: todo.recurring_parent_id || null,
              instance_number: todo.instance_number || null,
              next_due_date: todo.next_due_date || null,
              goal_id: todo.goal_id || null,
              sort_order_in_goal: todo.sort_order_in_goal || null,
            };
            await api.addTodo(newTodoData);
            createdTodos.push(newTodoData as Todo);
          }

          const summary = `成功导入 ${createdLists.length} 个清单和 ${createdTodos.length} 个待办事项。`;
          if (recurringTasks.length > 0) {
            alert(
              summary +
                `\n注意：重复任务已导入，但需要重新设置重复规则。`
            );
          } else {
            alert(summary);
          }
        } catch (error) {
          console.error("导入失败:", error);
          alert(
            `导入失败: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      };
      reader.readAsText(file);
    },
    [lists, api]
  );

  const handleExport = useCallback(async () => {
    try {
      // 导出为 SQL 格式
      const allTodos = todos; // 包含已删除的任务
      const allLists = lists;

      let sqlContent = "-- Todo App Database Export\n";
      sqlContent += `-- Export Date: ${new Date().toISOString()}\n\n`;

      // 清空现有数据
      sqlContent += "-- Clear existing data\n";
      sqlContent += "DELETE FROM todos;\n";
      sqlContent += "DELETE FROM lists;\n\n";

      // 导出 lists 表
      sqlContent += "-- Insert lists\n";
      for (const list of allLists) {
        const name = list.name.replace(/'/g, "''"); // 转义单引号
        sqlContent += `INSERT INTO lists (id, name, sort_order, is_hidden, modified) VALUES ('${
          list.id
        }', '${name}', ${list.sort_order}, ${list.is_hidden}, '${
          list.modified || new Date().toISOString()
        }');\n`;
      }

      sqlContent += "\n-- Insert todos\n";
      // 导出 todos 表
      for (const todo of allTodos) {
        const title = todo.title.replace(/'/g, "''");
        const content = todo.content ? todo.content.replace(/'/g, "''") : null;
        const tags = todo.tags ? todo.tags.replace(/'/g, "''") : null;
        const repeat = todo.repeat ? todo.repeat.replace(/'/g, "''") : null;
        const reminder = todo.reminder
          ? todo.reminder.replace(/'/g, "''")
          : null;

        sqlContent += `INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id, repeat, reminder, is_recurring, recurring_parent_id, instance_number, next_due_date, modified) VALUES (`;
        sqlContent += `'${todo.id}', `;
        sqlContent += `'${title}', `;
        sqlContent += `${todo.completed}, `;
        sqlContent += `${todo.deleted}, `;
        sqlContent += `${todo.sort_order}, `;
        sqlContent += `${todo.due_date ? `'${todo.due_date}'` : "NULL"}, `;
        sqlContent += `${content ? `'${content}'` : "NULL"}, `;
        sqlContent += `${tags ? `'${tags}'` : "NULL"}, `;
        sqlContent += `${todo.priority}, `;
        sqlContent += `'${todo.created_time}', `;
        sqlContent += `${
          todo.completed_time ? `'${todo.completed_time}'` : "NULL"
        }, `;
        sqlContent += `${todo.start_date ? `'${todo.start_date}'` : "NULL"}, `;
        sqlContent += `${todo.list_id ? `'${todo.list_id}'` : "NULL"}, `;
        sqlContent += `${repeat ? `'${repeat}'` : "NULL"}, `;
        sqlContent += `${reminder ? `'${reminder}'` : "NULL"}, `;
        sqlContent += `${todo.is_recurring || false}, `;
        sqlContent += `${
          todo.recurring_parent_id
            ? `'${todo.recurring_parent_id}'`
            : "NULL"
        }, `;
        sqlContent += `${todo.instance_number ?? "NULL"}, `;
        sqlContent += `${
          todo.next_due_date ? `'${todo.next_due_date}'` : "NULL"
        }, `;
        sqlContent += `'${
          todo.modified || new Date().toISOString()
        }'`;
        sqlContent += ");\n";
      }

      const blob = new Blob([sqlContent], { type: "application/sql" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `todos-${new Date().toISOString().split("T")[0]}.sql`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export failed:", error);
      alert(
        `导出失败: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
  }, [todos, lists]);

  const handleOpenSearch = useCallback(() => {
    setIsSearchModalOpen(true);
  }, []);

  return (
    <>
      <div className="bg-pattern"></div>
      {/* 开发模式下显示模式指示器 */}
      {process.env.NODE_ENV === "development" && <ModeIndicator />}
      <div className="todo-wrapper">
        <div id="todo-app" className={`todo-app ${currentMode}`}>
          <ContainerHeader
            mode={currentMode}
            currentView={currentView}
            newTodoTitle={currentMode === "goals" ? newGoalTitle : newTodoTitle}
            newTodoDate={newTodoDate}
            onTitleChange={
              currentMode === "goals" ? setNewGoalTitle : setNewTodoTitle
            }
            onAddTodo={handleAddTodo}
            onSubmitGoal={handleSubmitGoal}
          />

          <div
            className={`container main ${
              currentView === "calendar" ? "main-full-width" : ""
            }`}
          >
            <ViewSwitcher
              currentView={currentView}
              setCurrentView={setCurrentView}
              lists={lists}
              inboxCount={filterInboxTodos(uncompletedTodos).length}
              todayCount={
                todosWithListNames.filter(
                  (t: Todo) =>
                    !t.deleted &&
                    t.due_date &&
                    utcToLocalDateString(t.due_date) === todayStrInUTC8
                ).length
              }
              todosByList={todosByList}
              goalsByList={goalsByList}
              mode={currentMode}
            />

            {currentMode === "goals" ? (
              // 目标模式界面
              selectedGoal ? (
                <GoalDetails
                  goal={selectedGoal}
                  todos={todos.filter(
                    (todo) => todo.goal_id === selectedGoal.id
                  )}
                  goals={goals}
                  lists={lists}
                  onUpdateGoal={handleUpdateGoal}
                  onUpdateTodo={handleUpdateTodo}
                  onDeleteTodo={handleDeleteTodo}
                  onCreateTodo={handleCreateTodoForGoal}
                  onAssociateTasks={handleAssociateTasks}
                  onClose={() => setSelectedGoal(null)}
                />
              ) : (
                <div className="todo-list-box">
                  <GoalsMainInterface
                    ref={goalsMainInterfaceRef}
                    goals={
                      currentView === "goals-main"
                        ? goals
                        : goals.filter((goal) => goal.list_name === currentView)
                    }
                    todos={todos}
                    lists={lists}
                    onUpdateGoal={handleUpdateGoal}
                    onUpdateTodo={handleUpdateTodo}
                    onDeleteTodo={handleDeleteTodo}
                    onDeleteGoal={handleDeleteGoal}
                    onCreateTodo={handleCreateTodoForGoal}
                    onAssociateTasks={handleAssociateTasks}
                    onEditGoal={handleEditGoal}
                    onArchiveGoal={(goalId) =>
                      console.log("Archive goal:", goalId)
                    }
                  />
                </div>
              )
            ) : // 待办模式界面
            currentView !== "calendar" ? (
              <div className="todo-list-box">
                {selectedGoal ? (
                  <>
                    <GoalHeader
                      selectedGoal={selectedGoal}
                      goalCount={goals.length}
                      onBackToList={() => setSelectedGoal(null)}
                      onEditGoal={handleEditGoal}
                    />
                    <GoalDetails
                      goal={selectedGoal}
                      todos={displayTodos.filter(todo => todo.goal_id === selectedGoal.id)}
                      goals={goals}
                      lists={lists}
                      onUpdateGoal={handleUpdateGoal}
                      onUpdateTodo={handleUpdateTodo}
                      onDeleteTodo={handleDeleteTodo}
                      onCreateTodo={handleCreateTodoForGoal}
                      onAssociateTasks={handleAssociateTasks}
                      onClose={() => setSelectedGoal(null)}
                    />
                  </>
                ) : (
                  <>
                    <div className="bar-message flex">
                      {currentView !== "recycle" &&
                        displayTodos.some((t: Todo) => !t.completed_time) && (
                          <button
                            className="btn-small completed-all btn-allFinish"
                            onClick={handleMarkAllCompleted}
                          >
                            全部标为完成
                          </button>
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
                          <div
                            className="bar-message-text"
                            onDoubleClick={handleEditSlogan}
                          >
                            {slogan}
                          </div>
                        )}
                      </div>

                    <TodoList
                      todos={displayTodos}
                      goals={goals}
                      lists={lists}
                      currentView={currentView}
                      onToggleComplete={handleToggleComplete}
                      onDelete={handleDeleteTodo}
                      onRestore={handleRestoreTodo}
                      onSelectTodo={setSelectedTodo}
                      onViewGoal={(goalId) => {
                        const goal = goals.find(g => g.id === goalId);
                        if (goal) {
                          setSelectedGoal(goal);
                        }
                      }}
                      onUpdateGoal={handleUpdateGoal}
                      onCreateTodo={handleCreateTodoForGoal}
                      onAssociateTasks={handleAssociateTasks}
                      onEditGoal={handleEditGoal}
                    />

                    <div className="bar-message bar-bottom">
                      <div className="bar-message-text">
                        {currentView !== "recycle" ? (
                          <span>
                            {
                              displayTodos.filter((t: Todo) => !t.completed_time)
                                .length
                            }{" "}
                            项未完成
                          </span>
                        ) : (
                          <span>共 {recycledTodos.length} 项</span>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <CalendarView
                todos={todosWithListNames}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                onUpdateTodo={handleUpdateTodo}
                onOpenModal={setSelectedTodo}
                onAddTodo={handleAddTodoFromCalendar}
                onOpenCreateModal={handleOpenCalendarCreateModal}
              />
            )}

            <ShortcutSwitch
              currentView={currentView}
              setCurrentView={setCurrentView}
              onUndo={handleUndo}
              canUndo={!!lastAction}
              recycleBinCount={recycleBinCount}
              onMarkAllCompleted={handleMarkAllCompleted}
              showMarkAllCompleted={displayTodos.some(
                (t: Todo) => !t.completed_time
              )}
              onManageLists={() => setIsManageListsModalOpen(true)}
              onImport={handleImport}
              onOpenSearch={handleOpenSearch}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          </div>
        </div>
      </div>

      {isSettingsOpen && (
        <SyncSettingsModal onClose={() => setIsSettingsOpen(false)} />
      )}

      {isManageListsModalOpen && (
        <ManageListsModal
          lists={lists}
          todosByList={todosByList}
          recycleBinCount={recycleBinCount}
          onAddList={handleAddList}
          onUpdateList={handleUpdateList}
          onDeleteList={handleDeleteList}
          onUpdateListsOrder={handleUpdateListsOrder}
          onClose={() => setIsManageListsModalOpen(false)}
        />
      )}

      {isTodoModalOpen && (
        <TodoModal
          mode="create"
          lists={lists}
          initialData={{ title: newTodoTitle, start_date: newTodoDate, due_date: newTodoDate }}
          onSubmit={handleCreateTodo}
          onClose={() => {
            setIsTodoModalOpen(false);
            setNewTodoTitle("");
          }}
        />
      )}

      {isSearchModalOpen && (
        <TaskSearchModal
          isOpen={isSearchModalOpen}
          todos={todosWithListNames}
          lists={lists}
          goals={goals}
          refreshTrigger={searchRefreshTrigger}
          onSelectTodo={(todo) => setSelectedTodo(todo)}
          onUpdateTodo={handleUpdateTodo}
          onToggleComplete={async (todo) => {
            // 使用 handleToggleComplete 确保周期任务处理被触发
            await handleToggleComplete(todo);
          }}
          onClose={() => setIsSearchModalOpen(false)}
        />
      )}

      {isCalendarCreateModalOpen && (
        <TodoModal
          mode="create"
          lists={lists}
          initialData={{ title: newTodoTitle, start_date: calendarSelectedDate, due_date: calendarSelectedDate }}
            onSubmit={async (todoData) => {
              const listId = todoData.list_id || null;
              // calendarSelectedDate 已经是本地 YYYY-MM-DD 字符串，不需要经过 utcToLocalDateString 转换
              const dueDateUTC = calendarSelectedDate ? localDateToEndOfDayUTC(calendarSelectedDate) : null;

              setIsCalendarCreateModalOpen(false);

              await handleCreateTodo({
                ...todoData,
                list_id: listId,
                due_date: dueDateUTC,
                start_date: dueDateUTC,
              });
            }}
          onClose={() => {
            setIsCalendarCreateModalOpen(false);
            setNewTodoTitle("");
          }}
        />
      )}

      {selectedTodo && (
        <TodoModal
          mode="edit"
          lists={lists}
          initialData={selectedTodo}
          onSubmit={handleSaveTodoDetails}
          onUpdate={handleUpdateTodo}
          onClose={() => setSelectedTodo(null)}
          onDelete={(todoId) => {
            handleDeleteTodo(todoId);
            setSelectedTodo(null);
          }}
        />
      )}

      {isGoalModalOpen && (
        <GoalModal
          isOpen={isGoalModalOpen}
          goal={editingGoalId && editingGoalId !== "new" ? goals.find(g => g.id === editingGoalId) || undefined : undefined}
          goalId={editingGoalId}
          initialName={editingGoalId === "new" ? newGoalTitle : undefined}
          lists={memoizedLists}
          availableTodos={memoizedUncompletedTodos}
          goalTodos={editingGoalId && editingGoalId !== "new" ? todos.filter(t => t.goal_id === editingGoalId) : undefined}
          onSave={handleSaveGoal}
          onClose={handleCloseGoalModal}
          onGoalCreated={handleGoalCreated}
        />
      )}

      {/* 升级提示组件 */}
      <UpgradePrompt />
    </>
  );
}
declare global {
  interface Window {
    electron: unknown;
  }
}
