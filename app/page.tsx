// app/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { v4 as uuid } from "uuid";
import { useLiveQuery } from "@electric-sql/pglite-react";
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
import { CalendarPerformanceDisplay } from "../components/CalendarPerformanceMonitor";
import {
  useOptimizedInboxFilter,
  useOptimizedInboxSort,
  useInboxCacheCleanup,
  inboxPerfMonitor,
  InboxPerformanceDisplay,
} from "../components/InboxPerformanceOptimizer";
import type { Todo, List } from "../lib/types";
import dynamic from "next/dynamic";
import { getDbWrapper } from "../lib/sync/initOfflineSync";
import { RecurringTaskIntegration } from "../lib/recurring/RecurringTaskIntegration";
import { UpgradePrompt } from "../components/UpgradePrompt";
import { ModeIndicator } from "../components/ModeIndicator";

// 动态导入调试组件，避免服务端渲染问题
const OfflineSyncDebugger = dynamic(
  () => import("../components/OfflineSyncDebugger"),
  { ssr: false }
);

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

// --- 统一的数据库API层 ---
interface DatabaseAPI {
  query: <T = any>(sql: string, params?: any[]) => Promise<{ rows: T[] }>;
  insert: (
    table: "todos" | "lists" | "goals",
    data: Record<string, any>
  ) => Promise<unknown>;
  update: (
    table: "todos" | "lists" | "goals",
    id: string,
    data: Record<string, unknown>
  ) => Promise<unknown>;
  delete: (table: "todos" | "lists" | "goals", id: string) => Promise<unknown>;
  transaction: (
    queries: { sql: string; params?: unknown[] }[]
  ) => Promise<void>;
  rawWrite: (sql: string, params?: unknown[]) => Promise<unknown>;
}

function getDatabaseAPI(): DatabaseAPI {
  // 优先使用渲染进程中的 PGlite（与 useLiveQuery 使用的实例一致），避免读写落在不同数据库
  if (typeof window !== "undefined" && (window as unknown).pg) {
    const dbWrapper = getDbWrapper();

    if (!dbWrapper) {
      // 免费模式或未启用离线包装：直接使用 PGlite 实例
      const pg = (window as unknown as { pg: unknown }).pg;
      return {
        query: (sql, params) => pg.query(sql, params),
        insert: (table, data) => {
          const keys = Object.keys(data);
          const values = Object.values(data);
          const placeholders = keys.map((_, i) => `${i + 1}`).join(", ");
          return pg.query(
            `INSERT INTO ${table} (${keys.join(
              ", "
            )}) VALUES (${placeholders})`,
            values
          );
        },
        update: (table, id, data) => {
          const keys = Object.keys(data);
          const values = Object.values(data);
          const setClause = keys
            .map((key, i) => `${key} = ${i + 2}`)
            .join(", ");
          return pg.query(`UPDATE ${table} SET ${setClause} WHERE id = $1`, [
            id,
            ...values,
          ]);
        },
        delete: (table, id) =>
          pg.query(`DELETE FROM ${table} WHERE id = $1`, [id]),
        rawWrite: (sql, params) => pg.query(sql, params),
        transaction: async (queries) => {
          console.warn(
            "Executing a raw transaction which is not intercepted for offline sync."
          );
          await pg.transaction(async (tx: unknown) => {
            for (const { sql, params } of queries) {
              await (tx as unknown).query(sql, params);
            }
          });
        },
      };
    }

    return {
      query: (sql, params) => dbWrapper.raw.query(sql, params),
      insert: (table, data) => dbWrapper.insert(table, data),
      update: (table, id, data) => dbWrapper.update(table, id, data),
      delete: (table, id) => dbWrapper.delete(table, id),
      rawWrite: (sql, params) => dbWrapper.raw.query(sql, params),
      transaction: async (queries) => {
        console.warn(
          "Executing a raw transaction which is not intercepted for offline sync."
        );
        await dbWrapper.raw.transaction(async (tx: unknown) => {
          for (const { sql, params } of queries) {
            await (tx as unknown).query(sql, params);
          }
        });
      },
    };
  }

  // 回退到 Electron IPC（仅当没有渲染进程 PGlite 可用时）
  if (typeof window !== "undefined" && (window as unknown).electron?.db) {
    return (window as unknown).electron.db as DatabaseAPI;
  }

  // 环境不可用
  throw new Error(
    "Database API not available. Please ensure the application is properly initialized."
  );
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
      const today = new Date();
      const year = today.getFullYear();
      const month = String(today.getMonth() + 1).padStart(2, "0");
      const day = String(today.getDate()).padStart(2, "0");
      this.todayCache = { date: `${year}-${month}-${day}`, timestamp: now };
    }
    return this.todayCache.date;
  }

  getDateCache(utcDate: string | null | undefined): string {
    if (!utcDate) return "";
    return this.dateCache.get(utcDate) || "";
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
  // ... (no changes in this function)
  // ...
  if (!utcDate) return "";

  const cached = dateCache.getDateCache(utcDate);
  if (cached) return cached;

  try {
    const date = new Date(utcDate);
    if (isNaN(date.getTime())) return "";

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const result = `${year}-${month}-${day}`;

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
  // ... (no changes in this function)
  // ...
  if (!val) return null;
  if (typeof val === "string") {
    // 已经是数据库格式
    if (/^\d{4}-\d{2}-\d{2}( 16:00:00\+00)?$/.test(val)) return val;
    // 是 ISO 字符串
    if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return val.slice(0, 10);
    // 是 JS Date 字符串
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, "0");
      const dd = d.getDate().toString().padStart(2, "0");
      return `${y}-${m}-${dd}`;
    }
  }
  // 是 Date 对象
  if (val instanceof Date) {
    const y = val.getFullYear();
    const m = (val.getMonth() + 1).toString().padStart(2, "0");
    const d = val.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  // 尝试 new Date
  const d = new Date(val as string);
  if (!isNaN(d.getTime())) {
    const y = d.getFullYear();
    const m = (d.getMonth() + 1).toString().padStart(2, "0");
    const dd = d.getDate().toString().padStart(2, "0");
    return `${y}-${m}-${dd}`;
  }
  return null;
}

const normalizeTodo = (raw: Record<string, unknown>): Todo => ({
  id: String(raw.id),
  title: String(raw.title || ""),
  completed: Boolean(raw.completed),
  deleted: Boolean(raw.deleted),
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

const normalizeList = (raw: Record<string, unknown>): List => ({
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
  const db = getDatabaseAPI();

  // 初始化重复任务系统
  useEffect(() => {
    RecurringTaskIntegration.initialize(db);
  }, [db]);

  // 模式状态管理
  const [currentMode, setCurrentMode] = useState<"todo" | "goals">(() => {
    if (typeof window !== "undefined") {
      const savedMode = localStorage.getItem("app_mode") as "todo" | "goals";
      return savedMode || "todo";
    }
    return "todo";
  });

    const [editingGoalId, setEditingGoalId] = useState<string | null>(null);

  const [currentView, setCurrentView] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const savedMode = localStorage.getItem("app_mode") as "todo" | "goals";
      return savedMode === "goals" ? "goals-main" : "today";
    }
    return "today";
  });
  const [selectedTodo, setSelectedTodo] = useState<Todo | null>(null);
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
    const [isManageListsOpen, setIsManageListsOpen] = useState(false);
  const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newGoalTitle, setNewGoalTitle] = useState("");
  const [newTodoDate, setNewTodoDate] = useState<string | null>(null);
  const [lastAction, setLastAction] = useState<LastAction | null>(null);
  const [isEditingSlogan, setIsEditingSlogan] = useState(false);
  const [originalSlogan, setOriginalSlogan] = useState("");
  const [slogan, setSlogan] = useState("今日事今日毕，勿将今事待明日!.☕");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [searchRefreshTrigger, setSearchRefreshTrigger] = useState(0);
  const [isCalendarCreateModalOpen, setIsCalendarCreateModalOpen] =
    useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState<string>("");
  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [isTodoModalOpen, setIsTodoModalOpen] = useState(false);
  const addTodoInputRef = useRef<HTMLInputElement>(null);
  const goalsMainInterfaceRef = useRef<GoalsMainInterfaceRef>(null);

  // --- START: BUG FIX ---
  // When the view changes, if it's not the calendar view,
  // reset the newTodoDate state to null.
  useEffect(() => {
    if (currentView !== "calendar") {
      setNewTodoDate(null);
    }
  }, [currentView]);
  // --- END: BUG FIX ---

  const todosResult = useLiveQuery(
    "SELECT * FROM todos ORDER BY sort_order, created_time DESC"
  );
  const listsResult = useLiveQuery("SELECT * FROM lists ORDER BY sort_order");
  const sloganResult = useLiveQuery(
    "SELECT value FROM meta WHERE key = 'slogan'"
  );
  const goalsResult = useLiveQuery(
    "SELECT g.*, l.name as list_name, COUNT(t.id) as total_tasks, COUNT(CASE WHEN t.completed = true THEN 1 END) as completed_tasks FROM goals g LEFT JOIN lists l ON g.list_id = l.id LEFT JOIN todos t ON t.goal_id = g.id AND t.deleted = false WHERE g.is_archived = false GROUP BY g.id, l.name ORDER BY g.created_time DESC"
  );

  const todos = useMemo(() => {
    if (!todosResult?.rows) return [];
    return todosResult.rows.map(normalizeTodo);
  }, [todosResult?.rows]);

  const lists = useMemo(() => {
    if (!listsResult?.rows) return [];
    return listsResult.rows.map(normalizeList);
  }, [listsResult?.rows]);

  const goals = useMemo(() => {
    if (!goalsResult?.rows) return [];
    return goalsResult.rows.map((goal: unknown) => ({
      ...goal,
      progress:
        goal.total_tasks > 0
          ? Math.round((goal.completed_tasks / goal.total_tasks) * 100)
          : 0,
    }));
  }, [goalsResult?.rows]);

  useEffect(() => {
    if (sloganResult?.rows?.[0]?.value) {
      setSlogan(String(sloganResult.rows[0].value));
    }
  }, [sloganResult?.rows]);

  // 使用优化的收件箱过滤函数
  const {
    filterInboxTodos,
    utcToLocalDateString: optimizedUtcToLocalDateString,
  } = useOptimizedInboxFilter();
  const { sortInboxTodos } = useOptimizedInboxSort();
  const { clearFilterCache } = useInboxCacheCleanup();

  // --- FIX START: Create todos with list names ---
  const todosWithListNames = useMemo(() => {
    // ... (no changes in this block)
    // ...
    const listMap = new Map(lists.map((list) => [list.id, list.name]));
    return todos.map((todo) => ({
      ...todo,
      list_name: todo.list_id ? listMap.get(todo.list_id) || null : null,
    }));
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
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
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
    () =>
      // ... (no changes in this block)
      // ...
      todosWithListNames.filter((t: Todo) => !t.completed && !t.deleted),
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

    const endFilter = inboxPerfMonitor.startOperation("filter");
    const filteredTodos = filterInboxTodos(uncompletedTodos);
    endFilter(filteredTodos.length);

    const endSort = inboxPerfMonitor.startOperation("sort");
    const sortedTodos = sortInboxTodos(filteredTodos);
    endSort(sortedTodos.length);

    return sortedTodos;
  }, [currentView, uncompletedTodos, filterInboxTodos, sortInboxTodos]);

  // 优化的今日任务计算
  const todayTodos = useMemo(() => {
    if (currentView !== "today") return [];

    return todosWithListNames
      .filter((t: Todo) => {
        if (t.deleted) return false;

        const startDateStr = utcToLocalDateString(t.start_date);
        const dueDateStr = utcToLocalDateString(t.due_date);

        // If task has both start_date and due_date, check if today falls within the range
        if (startDateStr && dueDateStr) {
          return startDateStr <= todayStrInUTC8 && todayStrInUTC8 <= dueDateStr;
        }

        // If task only has due_date, check if it matches today
        if (dueDateStr) {
          return dueDateStr === todayStrInUTC8;
        }

        // If task only has start_date, check if it matches today
        if (startDateStr) {
          return startDateStr === todayStrInUTC8;
        }

        return false;
      })
      .sort((a, b) => {
        // First sort by completion status (uncompleted first)
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        // Then sort by priority (higher priority first)
        return (b.priority || 0) - (a.priority || 0);
      });
  }, [currentView, todosWithListNames, todayStrInUTC8]);

  // 优化的列表任务计算
  const listTodos = useMemo(() => {
    if (
      ["inbox", "completed", "recycle", "today", "calendar"].includes(
        currentView
      )
    ) {
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
      // This write is not intercepted for offline sync, which is acceptable for this feature.
      await db.rawWrite(
        `INSERT INTO meta (key, value) VALUES ('slogan', $1) ON CONFLICT(key) DO UPDATE SET value = $1`,
        [slogan]
      );
    }, 500),
    [slogan, originalSlogan, db]
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

      await db.insert("todos", newTodoData);
      setIsTodoModalOpen(false);
      setNewTodoTitle("");
      // 修复：只有在非日历视图下才重置日期，保持日历视图中的日期状态
      if (currentView !== "calendar") {
        setNewTodoDate(null);
      }
    },
    [db, currentView]
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

      await db.insert("todos", newTodoData);
      setIsCalendarCreateModalOpen(false);
    },
    [db]
  );

  const handleUpdateTodo = useCallback(
    async (
      todoId: string,
      updates: Partial<Omit<Todo, "id" | "list_name">>
    ) => {
      // 检查 updates 是否为 null 或 undefined
      if (!updates || Object.keys(updates).length === 0) return;
      await db.update("todos", todoId, updates);
      
      // 处理重复任务生成
      if (updates.completed === true) {
        await RecurringTaskIntegration.handleTaskUpdate(todoId, updates, db);
      }
    },
    [db]
  );

  const handleToggleComplete = useCallback(
    async (todo: Todo) => {
      setLastAction({
        type: "toggle-complete",
        data: {
          id: todo.id,
          previousCompletedTime: todo.completed_time,
          previousCompleted: !!todo.completed,
        },
      });
      const newCompletedTime = todo.completed_time
        ? null
        : new Date().toISOString();
      const newCompletedFlag = !todo.completed;
      const updates = {
        completed_time: newCompletedTime,
        completed: newCompletedFlag,
      };

      await handleUpdateTodo(todo.id, updates);

      // 处理重复任务生成
      if (newCompletedFlag) {
        await RecurringTaskIntegration.handleTaskUpdate(todo.id, updates, db);
      }

      // 触发搜索结果刷新
      setSearchRefreshTrigger((prev) => prev + 1);
    },
    [handleUpdateTodo, db]
  );

  const handleDeleteTodo = useCallback(
    async (todoId: string) => {
      const todoToDelete = todos.find((t: Todo) => t.id === todoId);
      if (!todoToDelete) return;
      setLastAction({ type: "delete", data: todoToDelete });
      if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
      await db.update("todos", todoId, { deleted: true });
      // 触发搜索结果刷新
      setSearchRefreshTrigger((prev) => prev + 1);
    },
    [todos, selectedTodo, db]
  );

  const handleRestoreTodo = useCallback(
    async (todoId: string) => {
      const todoToRestore = recycledTodos.find((t: Todo) => t.id === todoId);
      if (!todoToRestore) return;
      setLastAction({ type: "restore", data: todoToRestore });
      if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
      await db.update("todos", todoId, { deleted: false });
      // 触发搜索结果刷新
      setSearchRefreshTrigger((prev) => prev + 1);
    },
    [recycledTodos, selectedTodo, db]
  );

  const handlePermanentDeleteTodo = useCallback(
    async (todoId: string) => {
      const todoToDelete = recycledTodos.find((t: Todo) => t.id === todoId);
      if (!todoToDelete) return;
      const confirmed = window.confirm(
        `确认要永久删除任务 "${todoToDelete.title}" 吗？此操作无法撤销。`
      );
      if (confirmed) {
        await db.delete("todos", todoId);
        if (selectedTodo && selectedTodo.id === todoId) setSelectedTodo(null);
      }
    },
    [recycledTodos, selectedTodo, db]
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
        await db.insert("lists", newList);
        return newList;
      } catch (error) {
        console.error("Failed to add list:", error);
        alert(
          `添加清单失败: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
        return null;
      }
    },
    [lists.length, db]
  );

  const handleDeleteList = useCallback(
    async (listId: string) => {
      const listToDelete = lists.find((l: List) => l.id === listId);
      if (!listToDelete) return;
      const confirmed = window.confirm(
        `确认删除清单 "${listToDelete.name}" 吗？清单下的所有待办事项将被移至收件箱。`
      );
      if (!confirmed) return;

      // 先获取需要更新的待办事项
      const todosToUpdateQuery = await db.query<{ id: string }>(
        `SELECT id FROM todos WHERE list_id = $1`,
        [listId]
      );
      const todosToUpdate = todosToUpdateQuery.rows;

      // 使用包装器方法来确保同步拦截器能够捕获操作
      // 1. 先将清单下的所有待办事项移至收件箱
      for (const todo of todosToUpdate) {
        await db.update("todos", todo.id, { list_id: null });
      }

      // 2. 删除清单（这将被同步拦截器捕获并同步到远程）
      await db.delete("lists", listId);

      if (currentView === listToDelete.name) setCurrentView("inbox");
    },
    [lists, currentView, db]
  );

  const handleUpdateList = useCallback(
    async (listId: string, updates: Partial<Omit<List, "id">>) => {
      if (Object.keys(updates).length === 0) return;
      await db.update("lists", listId, updates);
    },
    [db]
  );

  const handleUpdateListsOrder = useCallback(
    async (reorderedLists: List[]) => {
      // 使用包装器方法来确保同步拦截器能够捕获操作
      for (let index = 0; index < reorderedLists.length; index++) {
        const list = reorderedLists[index];
        await db.update("lists", list.id, { sort_order: index });
      }
    },
    [db]
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

          // 直接从数据库查询新创建的目标
          const result = await db.query(
            `
          SELECT g.*, l.name as list_name, 
                 COUNT(t.id) as total_tasks, 
                 COUNT(CASE WHEN t.completed = true THEN 1 END) as completed_tasks 
          FROM goals g 
          LEFT JOIN lists l ON g.list_id = l.id 
          LEFT JOIN todos t ON t.goal_id = g.id AND t.deleted = false 
          WHERE g.id = $1 AND g.is_archived = false 
          GROUP BY g.id, l.name
        `,
            [goalId]
          );

          if (result.rows.length > 0) {
            const goalData = result.rows[0];
            const goal = {
              ...goalData,
              progress:
                goalData.total_tasks > 0
                  ? Math.round(
                      (goalData.completed_tasks / goalData.total_tasks) * 100
                    )
                  : 0,
            };

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
    [goals, db]
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
            list_id: sanitizeUuidField(goalData.listId), // 使用 UUID 清理
            start_date: goalData.startDate || null,
            due_date: goalData.dueDate || null,
            priority: goalData.priority || 0,
          };

          console.log("更新目标数据:", updateData);
          await db.update("goals", goalId, updateData);
          console.log("目标更新成功，ID:", goalId);
          
          // 更新 selectedGoal 状态，确保 GoalDetails 页面显示最新的数据
          setSelectedGoal(prevSelectedGoal => {
            if (prevSelectedGoal && prevSelectedGoal.id === goalId) {
              return {
                ...prevSelectedGoal,
                ...updateData,
                id: goalId
              };
            }
            return prevSelectedGoal;
          });
          
          // 更新 GoalsMainInterface 组件内部的 selectedGoal 状态
          if (goalsMainInterfaceRef.current) {
            const updatedGoal = {
              ...goals.find(g => g.id === goalId),
              ...updateData,
              id: goalId
            };
            goalsMainInterfaceRef.current.updateSelectedGoal(updatedGoal);
          }
        } else {
          // 创建模式
          const goal = {
            id: goalId,
            name: goalData.name,
            description: goalData.description || null,
            list_id: sanitizeUuidField(goalData.listId), // 使用 UUID 清理
            start_date: goalData.startDate || null,
            due_date: goalData.dueDate || null,
            priority: goalData.priority || 0,
            created_time: new Date().toISOString(),
            is_archived: false,
          };

          console.log("准备插入目标数据:", goal);
          await db.insert("goals", goal);
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
              await db.update("todos", todoId, {
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
                  list_id: goalData.listId || null,
                  goal_id: goalId,
                  sort_order_in_goal: existingCount + i + 1,
                  created_time: new Date().toISOString(),
                };
                await db.insert("todos", newTodo);
              }
            }
          }
        }

        console.log("目标保存完成！");
        return goalId;
      } catch (error) {
        console.error("保存目标失败:", error);
        throw error;
      }
    },
    [db]
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
        await db.update("goals", updatedGoal.id, updateData);
        
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
    [db, setSelectedGoal]
  );

  const handleCreateTodoForGoal = useCallback(
    async (todoData: Omit<Todo, "id" | "created_time">) => {
      try {
        const newTodo = {
          ...todoData,
          id: uuid(),
          created_time: new Date().toISOString(),
        };
        await db.insert("todos", newTodo);
      } catch (error) {
        console.error("创建待办事项失败:", error);
        alert(
          `创建待办事项失败: ${
            error instanceof Error ? error.message : "未知错误"
          }`
        );
      }
    },
    [db]
  );

  const handleDeleteGoal = useCallback(
    async (goalId: string) => {
      const goalToDelete = goals.find((g: Goal) => g.id === goalId);
      if (!goalToDelete) return;
      
      const confirmed = window.confirm(
        `确认要删除目标 "${goalToDelete.name}" 吗？此操作无法撤销。`
      );
      
      if (confirmed) {
        await db.delete("goals", goalId);
        // 同时删除与该目标关联的所有待办事项
        const todosToUpdateQuery = await db.query<{ id: string }>(
          `SELECT id FROM todos WHERE goal_id = $1`,
          [goalId]
        );
        const todosToUpdate = todosToUpdateQuery.rows;
        
        // 将目标下的所有待办事项的目标ID设为null
        for (const todo of todosToUpdate) {
          await db.update("todos", todo.id, { goal_id: null });
        }
      }
    },
    [goals, db]
  );

  const handleAssociateTasks = useCallback(
    async (taskIds: string[], goalId: string) => {
      try {
        // 更新每个任务的 goal_id 字段
        for (const taskId of taskIds) {
          await db.update("todos", taskId, { goal_id: goalId });
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
    [db]
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
          // 使用包装器方法来确保同步拦截器能够捕获操作
          for (const d of lastActionData) {
            await db.update("todos", d.id, {
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
  }, [lastAction, handleUpdateTodo, db]);

  const handleMarkAllCompleted = useCallback(async () => {
    const todosToUpdate = displayTodos.filter((t: Todo) => !t.completed_time);
    if (todosToUpdate.length === 0) return;
    const confirmed = await window.confirm(
      `确认将当前视图的 ${todosToUpdate.length} 项全部标记为完成吗？`
    );
    if (!confirmed) return;
    const idsToUpdate = todosToUpdate.map((t: Todo) => t.id);
    const newCompletedTime = new Date().toISOString();
    setLastAction({
      type: "batch-complete",
      data: todosToUpdate.map((t: Todo) => ({
        id: t.id,
        previousCompletedTime: t.completed_time,
        previousCompleted: !!t.completed,
      })),
    });
    // This operation is not intercepted for offline sync as it's a raw write.
    await db.rawWrite(
      `UPDATE todos SET completed = TRUE, completed_time = $1 WHERE id = ANY($2::text[])`,
      [newCompletedTime, idsToUpdate]
    );
  }, [displayTodos, db]);

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
          } else if (file.name.endsWith(".sql")) {
            // 处理 SQL 文件导入
            const confirmed = confirm(
              "导入 SQL 文件将会覆盖当前所有数据，是否继续？"
            );
            if (!confirmed) {
              return;
            }

            // 执行 SQL 语句
            const sqlStatements = content
              .split("\n")
              .map((line) => line.trim())
              .filter((line) => line && !line.startsWith("--")) // 过滤注释和空行
              .join("\n")
              .split(";")
              .map((stmt) => stmt.trim())
              .filter((stmt) => stmt);

            for (const statement of sqlStatements) {
              if (statement) {
                await db.exec(statement);
              }
            }

            alert("SQL 文件导入成功！");
            return; // SQL 导入直接返回，不需要后续处理
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
          // 使用包装器方法来确保同步拦截器能够捕获操作
          for (let i = 0; i < newListsToCreate.length; i++) {
            const listName = newListsToCreate[i];
            const newListData = {
              id: uuid(),
              name: listName,
              is_hidden: false,
              sort_order: lists.length + i,
            };
            createdLists.push(newListData);
            await db.insert("lists", newListData);
          }

          const currentListsRes = await db.query<List>(
            `SELECT id, name, sort_order, is_hidden FROM lists`
          );
          const listNameToIdMap = new Map<string, string>();
          currentListsRes.rows.forEach((list: List) =>
            listNameToIdMap.set(list.name, list.id)
          );

          const createdTodos: Todo[] = [];
          // 使用包装器方法来确保同步拦截器能够捕获操作
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
              // 重复任务相关字段
              repeat: todo.repeat || null,
              reminder: todo.reminder || null,
              is_recurring: !!todo.is_recurring,
              recurring_parent_id: todo.recurring_parent_id || null,
              instance_number: todo.instance_number || null,
              next_due_date: todo.next_due_date || null,
            };
            createdTodos.push(newTodoData as Todo);
            await db.insert("todos", newTodoData);
          }

          alert(`成功导入 ${todosToImport.length} 个事项！`);
        } catch (error) {
          console.error("Import failed:", error);
          alert(
            `导入失败: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      };
      reader.readAsText(file);
    },
    [lists, db]
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
          todo.recurring_parent_id ? `'${todo.recurring_parent_id}'` : "NULL"
        }, `;
        sqlContent += `${todo.instance_number || "NULL"}, `;
        sqlContent += `${
          todo.next_due_date ? `'${todo.next_due_date}'` : "NULL"
        }, `;
        sqlContent += `${todo.modified ? `'${todo.modified}'` : "NULL"}`;
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
      {/* 添加离线同步调试器 */}
      {process.env.NODE_ENV !== "production" && <OfflineSyncDebugger />}
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
                onAddTodo={handleAddTodoFromCalendar}
                onUpdateTodo={handleUpdateTodo}
                onOpenModal={setSelectedTodo}
                currentDate={currentDate}
                onDateChange={setCurrentDate}
                onOpenCreateModal={handleOpenCalendarCreateModal}
              />
            )}

            <ShortcutSwitch
              currentView={currentView}
              setCurrentView={setCurrentView}
              onUndo={handleUndo}
              canUndo={!!lastAction}
              recycleBinCount={recycledTodos.length}
              onMarkAllCompleted={handleMarkAllCompleted}
              showMarkAllCompleted={displayTodos.some(
                (t: Todo) => !t.completed_time
              )}
              onManageLists={() => setIsManageListsOpen(true)}
              onImport={handleImport}
              onOpenSearch={handleOpenSearch}
              onExport={handleExport}
            />
          </div>

          {selectedTodo && (
            <TodoModal
              mode="edit"
              initialData={selectedTodo}
              lists={lists}
              goals={goals}
              onClose={() => setSelectedTodo(null)}
              onSubmit={handleSaveTodoDetails}
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

          {isSearchModalOpen && (
            <TaskSearchModal
              isOpen={isSearchModalOpen}
              onClose={() => setIsSearchModalOpen(false)}
              onSelectTodo={setSelectedTodo}
              onToggleComplete={handleToggleComplete}
              onDelete={handleDeleteTodo}
              currentView={currentView}
              refreshTrigger={searchRefreshTrigger}
            />
          )}

          {isCalendarCreateModalOpen && (
            <TodoModal
              mode="create"
              initialData={{
                start_date: localDateToEndOfDayUTC(calendarSelectedDate),
                due_date: localDateToEndOfDayUTC(calendarSelectedDate),
              }}
              context={{
                view: "calendar",
                selectedDate: calendarSelectedDate,
              }}
              lists={lists}
              goals={goals}
              onClose={() => setIsCalendarCreateModalOpen(false)}
              onSubmit={(todoData) =>
                handleCreateTodoFromCalendar(
                  todoData.title,
                  todoData.list_id,
                  todoData.start_date,
                  todoData.due_date
                )
              }
            />
          )}

          {isTodoModalOpen && (
            <TodoModal
              mode="create"
              initialData={{
                title: newTodoTitle,
                start_date: newTodoDate ? localDateToEndOfDayUTC(newTodoDate) : null,
                due_date: newTodoDate ? localDateToEndOfDayUTC(newTodoDate) : null,
              }}
              context={{
                view: currentView,
                todayDate: todayStrInUTC8,
                selectedDate: newTodoDate || undefined,
                listId: (() => {
                  if (currentView !== "inbox" && currentView !== "today" && currentView !== "calendar" && currentView !== "recycle") {
                    const list = lists.find((l: List) => l.name === currentView);
                    return list ? list.id : undefined;
                  }
                  return undefined;
                })()
              }}
              lists={lists}
              goals={goals}
              onClose={() => setIsTodoModalOpen(false)}
              onSubmit={(todoData) => {
                // 确保创建的待办事项包含列表信息
                // 优先使用用户在TodoModal中选择的清单，如果没有选择则使用当前视图的默认清单
                let listId = todoData.list_id || null;
                if (!listId) {
                  if (
                    currentView !== "list" &&
                    currentView !== "inbox" &&
                    currentView !== "calendar" &&
                    currentView !== "recycle"
                  ) {
                    const list = lists.find((l: List) => l.name === currentView);
                    if (list) listId = list.id;
                  }
                }
                
                // 修复: 在 today 视图下，dueDateString 应为 todayStrInUTC8
                let dueDateString = newTodoDate;
                if (!dueDateString) {
                  if (currentView === "list") {
                    dueDateString = todayStrInUTC8;
                  } else if (currentView === "today") {
                    dueDateString = todayStrInUTC8;
                  } else {
                    dueDateString = null;
                  }
                }

                const dueDateUTC = dueDateString ? localDateToEndOfDayUTC(dueDateString) : null;

                handleCreateTodo({
                  ...todoData,
                  list_id: listId,
                  due_date: dueDateUTC,
                  start_date: dueDateUTC,
                });
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

          {/* 性能监控组件（仅开发环境显示） */}
          <CalendarPerformanceDisplay />
          <InboxPerformanceDisplay />
        </div>
      </div>
    </>
  );
}
declare global {
  interface Window {
    electron: unknown;
  }
}
