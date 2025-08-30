// components/TodoList.tsx
import React, {
  memo,
  useRef,
  useEffect,
  useState,
  forwardRef,
  useMemo,
  useCallback,
} from "react";
import Image from "next/image";
import { TransitionGroup, CSSTransition } from "react-transition-group";
import type { Todo, Goal, List } from "../lib/types";
import { RecurringTaskGenerator } from "../lib/recurring/RecurringTaskGenerator";
import { inboxCache } from "./InboxPerformanceOptimizer";
import { useINPOptimization, useOptimizedClick, useINPMonitoring } from "./INPOptimizer";
import { GoalGroup } from "./GoalGroup";

// 优化的日期转换函数 - 使用缓存
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  return inboxCache.getDateString(utcDate);
};

interface TodoItemProps {
  todo: Todo;
  currentView: string;
  onToggleComplete: (todo: Todo) => void;
  onDelete: (todoId: string) => void;
  onRestore: (todoId: string) => void;
  onSelectTodo: (todo: Todo) => void;
  delay: number;
  animationTrigger: number;
}

const TodoItem = memo(
  forwardRef<HTMLLIElement, TodoItemProps>(
    (
      {
        todo,
        currentView,
        onToggleComplete,
        onDelete,
        onRestore,
        onSelectTodo,
        delay,
        animationTrigger,
      },
      ref
    ) => {
      const [show, setShow] = useState(false);
      const timerRef = useRef<NodeJS.Timeout | null>(null);

      // 优化动画逻辑 - 减少不必要的重渲染
      useEffect(() => {
        setShow(false);

        // 清除之前的定时器
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }

        // 对于大量数据，减少动画延迟
        const optimizedDelay = delay > 1000 ? Math.min(delay, 100) : delay;

        timerRef.current = setTimeout(() => setShow(true), optimizedDelay);

        return () => {
          if (timerRef.current) {
            clearTimeout(timerRef.current);
          }
        };
      }, [delay, animationTrigger]);

      // 使用INP优化的事件处理器
      const handleToggleComplete = useOptimizedClick(
        () => onToggleComplete(todo),
        { stopPropagation: true, priority: 'high' }
      );

      const handleDelete = useOptimizedClick(
        () => onDelete(todo.id),
        { stopPropagation: true, priority: 'high' }
      );

      const handleRestore = useOptimizedClick(
        () => onRestore(todo.id),
        { stopPropagation: true, priority: 'high' }
      );

      const handleSelectTodo = useOptimizedClick(
        () => onSelectTodo(todo),
        { priority: 'normal' }
      );

      // 缓存计算结果
      const isRecurringTask = useMemo(
        () => RecurringTaskGenerator.isOriginalRecurringTask(todo),
        [todo]
      );

      const isTaskInstance = useMemo(
        () => RecurringTaskGenerator.isTaskInstance(todo),
        [todo]
      );

      const recurringDescription = useMemo(
        () =>
          isRecurringTask
            ? RecurringTaskGenerator.getTaskRecurrenceDescription(todo)
            : "",
        [todo, isRecurringTask]
      );

      const formattedDueDate = useMemo(
        () => (todo.due_date ? utcToLocalDateString(todo.due_date) : ""),
        [todo.due_date]
      );

      const formattedNextDueDate = useMemo(
        () =>
          todo.next_due_date ? utcToLocalDateString(todo.next_due_date) : "",
        [todo.next_due_date]
      );

      return (
        <li
          ref={ref}
          className={`todo-item${todo.deleted ? " deleted" : ""} ${
            show ? "fade-in" : ""
          }`}
          data-delay={delay}
          onClick={handleSelectTodo}
          style={{ opacity: show ? 1 : 0 }}
        >
          <div className={`todo-content ${todo.completed ? "completed" : ""}`}>
            {todo.deleted ? (
              <button className="todo-btn btn-restore" onClick={handleRestore}>
                <Image
                  src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTkiIGhlaWdodD0iMTkiIHZpZXdCb3g9IjAgMCAxOSAxOSIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTcuMzQ3OTggMi42NTc5MkM3LjcxMTM0IDEuOTEzNDQgNy40MDIzOCAxLjAxNTM1IDYuNjU3OSAwLjY1MTk4OEM1LjkxMzQxIDAuMjg4NjI3IDUuMDE1MzIgMC41OTc1OSA0LjY1MTk2IDEuMzQyMDhMNy4zNDc5OCAyLjY1NzkyWk0xLjUyNiA5LjA4MzMzTDAuMzc1NTcxIDguMTIwNzhDMC4wNzc5NTE2IDguNDc2NDkgLTAuMDM4MzgyIDguOTQ5ODcgMC4wNjA0NjEyIDkuNDAzMDFDMC4xNTkzMDQgOS44NTYxNSAwLjQ2MjIwNiAxMC4yMzgxIDAuODgwOTI0IDEwLjQzNzVMMS41MjYgOS4wODMzM1pNMTQuNTcyNCAxNi41ODkzQzE0LjM0NTYgMTcuMzg2IDE0LjgwNzYgMTguMjE1OCAxNS42MDQ0IDE4LjQ0MjZDMTYuNDAxMiAxOC42Njk0IDE3LjIzMSAxOC4yMDczIDE3LjQ1NzggMTcuNDEwNkwxNC41NzI0IDE2LjU4OTNaTTYuMjUxOTIgMTQuMzMyMUM2LjcxMTE1IDE1LjAyMTMgNy42NDI3NiAxNS4yMDc2IDguMzMyMDUgMTQuNzQ4MUM5LjAyMTM0IDE0LjI4ODUgOS4yMDc2IDEzLjM1NzIgOC43NDgwOCAxMi42Njc5TDYuMjUxOTIgMTQuMzMyMVpNNC42NTE5NiAxLjM0MjA4QzMuNjc2NiAzLjM0MDQ3IDIuNjAwMzMgNS4wNDUyNSAxLjc2NjU4IDYuMjUxMDhDMS4zNTA1OSA2Ljg1MjcyIDAuOTk3MjYzIDcuMzI2ODUgMC43NTAzODQgNy42NDc3MkMwLjYyNzAwNSA3Ljc4MDkzIDAuNTMwMzkyIDcuOTI5NyAwLjQ2NjA0NyA4LjAwOTY5QzAuNDMzODggOC4wNDk2NyAwLjQwOTc5NiA4LjA3OTIgMC4zOTQ0ODIgOC4wOTc4NkMwLjM4NjgyNiA4LjEwNzE4IDAuMzgxMzY0IDguMTEzNzkgMC4zNzgxODMgOC4xMTc2M0MwLjM3NjU5MiA4LjExOTU1IDAuMzc1NTcyIDguMTIwNzcgMC4zNzUxMzMgOC4xMjEzQzAuMzc0OTE0IDguMTIxNTcgMC4zNzQ4NCA4LjEyMTY1IDAuMzc0OTEyIDguMTIxNTdDMC4zNzQ5NDggOC4xMjE1MiAwLjM3NTAyMSA4LjEyMTQ0IDAuMzc1MTMxIDguMTIxM0MwLjM3NTE4NiA4LjEyMTI0IDAuMzc1Mjk2IDguMTIxMTEgMC4zNzUzMjMgOC4xMjEwN0MwLjM3NTQ0MiA4LjEyMDkzIDAuMzc1NTcxIDguMTIwNzggMS41MjYgOS4wODMzM0MyLjY3NjQzIDEwLjA0NTkgMi42NzY1OCAxMC4wNDU3IDIuNjc2NzMgMTAuMDQ1NUMyLjY3NjggMTAuMDQ1NCAyLjY3Njk2IDEwLjA0NTIgMi42NzcwOSAxMC4wNDUxQzIuNjc3MzUgMTAuMDQ0OCAyLjY3NzY1IDEwLjA0NDQgMi42Nzc5OCAxMC4wNDRDMi42Nzg2NSAxMC4wNDMyIDIuNjc5NDYgMTAuMDQyMyAyLjY4MDQyIDEwLjA0MTFDMi42ODIzNCAxMC4wMzg4IDIuNjg0ODYgMTAuMDM1OCAyLjY4Nzk0IDEwLjAzMkMyLjY5NDEyIDEwLjAyNDYgMi43MDI2MSAxMC4wMTQzIDIuNzEzMzMgMTAuMDAxM0MyLjczNDc1IDkuOTc1MTYgMi43NjUwOCA5LjkzNzk1IDIuODAzNjIgOS44OTAwNUMyLjg4MDY3IDkuNzk0MjYgMi45OTA2IDkuNjU1NjEgMy4xMjc3OCA5LjQ3NzM4QzMuNDAyMDEgOS4xMjEwNiAzLjc4NTg3IDguNjA1NjIgNC4yMzQxNyA3Ljk1NzI1QzUuMTI5IDYuNjYzMDggNi4yODk3MiA0LjgyNjIgNy4zNDc5OCAyLjY1NzkyTDQuNjUxOTYgMS4zNDIwOFpNMi4wNDcwNCAxMC40ODk5QzMuNzc2MTcgOS44NDk0MiA1LjczMzE5IDkuMTcyMzEgNy42MzggOC43MjEzN0M5LjU3MDA4IDguMjY1OTkgMTEuMzAyNSA4LjA3NjMxIDEyLjYyODggOC4zMDE3QzEzLjg3NTIgOC41MTM1MiAxNC42Mjg0IDkuMDUwMDggMTUuMDE2MyAxMC4wNDA1QzE1LjQ2MjggMTEuMTgwNyAxNS41MzgzIDEzLjE5NTYgMTQuNTcyNCAxNi41ODkzTDE3LjQ1NzggMTcuNDEwNkMxOC4wODQzIDEzLjgwNDIgMTguNjE2NiAxMS4wMDY3IDE3LjgwOTcgOC45NDY0NkMxNi45NDQyIDYuNzM2MzQgMTUuMTMzNyA1LjY4NDM3IDEzLjEzMTQgNS4zNDQxMUMxMS4yMDkyIDUuMDE3NDMgOS4wMDc5OSA1LjMxNDEzIDYuOTQ2OSA1LjgwMjA2QzQuODU4NTYgNi4yOTY0NCAyLjc2MjgzIDcuMDI1NTggMS4wMDQ5NiA3LjY3NjczTDIuMDQ3MDQgMTAuNDg5OVpNOC43NDgwOCAxMi42Njc5QzcuNTIzMTIgMTAuODMwNSA1LjIyOTM0IDkuMTg1OTMgMi4xNzEwOCA3LjcyOTEzTDAuODgwOTI0IDEwLjQzNzVDMy43NzA2NiAxMS44MTQxIDUuNDc2ODggMTMuMTY5NSA2LjI1MTkyIDE0LjMzMjFMOC43NDgwOCAxMi42Njc5WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K"
                  alt="还原"
                  draggable={false}
                  width={16}
                  height={16}
                />
              </button>
            ) : (
              <button
                className={`todo-btn ${
                  todo.completed ? "btn-unfinish" : "btn-finish"
                }`}
                onClick={handleToggleComplete}
              >
                {todo.completed && (
                  <Image
                    src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAyNCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIuMzYzMTcgOS42NzUwNkMxLjU1OTM5IDkuNDc0NDkgMC43NDUyMDQgOS45NjM0OCAwLjU0NDYyOSAxMC43NjczQzAuMzQ0MDU0IDExLjU3MSAwLjgzMzA0NyAxMi4zODUyIDEuNjM2ODMgMTIuNTg1OEwyLjM2MzE3IDkuNjc1MDZaTTguMTU4NzMgMTZMNi43ODA0MSAxNi41OTE4QzcuMDMwOTggMTcuMTc1NCA3LjYyMTk1IDE3LjU1NzkgOC4yNTU3NSAxNy40OTY5QzguODg5NTQgMTcuNDU1OCA5LjQyODc3IDE3LjAyIDkuNjAxOTEgMTYuNDA4OUw4LjE1ODczIDE2Wk0yMi4zMjYxIDMuNDY0MTNDMjMuMTM0NyAzLjI4NDA2IDIzLjY0NDIgMi40ODI1NyAyMy40NjQxIDEuNjczOTVDMjMuMjg0MSAwLjg2NTMyOCAyMi40ODI2IDAuMzU1NzkxIDIxLjY3MzkgMC41MzU4NjZMMjIuMzI2MSAzLjQ2NDEzWk0xLjYzNjgzIDEyLjU4NThDMi4wMjc2NCAxMi42ODMzIDMuMTIyOTkgMTMuMTUxIDQuMjc3OCAxMy45NDI2QzUuNDM5ODggMTQuNzM5MyA2LjM4OTA2IDE1LjY4MDMgNi43ODA0MSAxNi41OTE4TDkuNTM3MDUgMTUuNDA4MkM4LjgxMDk0IDEzLjcxNzEgNy4zMDE1NyAxMi4zNzgzIDUuOTc0MDYgMTEuNDY4MkM0LjYzOTI3IDEwLjU1MzIgMy4yMTM5OSA5Ljg4NzM4IDIuMzYzMTcgOS42NzUwNkwxLjYzNjgzIDEyLjU4NThaTTkuNjAxOTEgMTYuNDA4OUMxMC4xMzU5IDE0LjUyNDQgMTEuNDk0OCAxMS42NTg1IDEzLjY3MjcgOS4wNjM5NUMxNS44NDQ1IDYuNDc2NzUgMTguNzQxNyA0LjI2MjM1IDIyLjMyNjEgMy40NjQxM0wyMS42NzM5IDAuNTM1ODY2QzE3LjI1ODMgMS41MTkyIDEzLjgyNzUgNC4yMTM0MiAxMS4zNzQ5IDcuMTM1MTRDOC45Mjg1MiAxMC4wNDk1IDcuMzY2NzQgMTMuMjkyOSA2LjcxNTU1IDE1LjU5MTFMOS42MDE5MSAxNi40MDg5WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K"
                    alt="标为未完成"
                    className="icon-finish"
                    draggable={false}
                    width={24}
                    height={18}
                  />
                )}
              </button>
            )}

            {(currentView === "inbox" || currentView === "today") &&
              todo.list_name && (
                <span className="todo-list-name">[{todo.list_name}] </span>
              )}

            {/* 重复任务标识 */}
            {isRecurringTask && (
              <span className="recurring-badge" title={recurringDescription}>
                🔄
              </span>
            )}

            <div className="todo-title">{todo.title}</div>

            {/* 显示重复规则（仅原始重复任务） */}
            {isRecurringTask && recurringDescription && !todo.deleted && (
              <span className="next-due-date" title="重复规则">
                {recurringDescription}
              </span>
            )}

            {formattedDueDate && currentView !== "list" && !todo.deleted && (
              <span className="todo-due-date">{formattedDueDate}</span>
            )}

            {!todo.deleted && (
              <button className="todo-btn btn-delete" onClick={handleDelete}>
                <Image
                  src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAxOCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xNS4wOTkzIDE3Ljc1OTdDMTUuNzk0OSAxOC4yMDk4IDE2LjcyMzUgMTguMDEwOCAxNy4xNzM2IDE3LjMxNTJDMTcuNjIzNiAxNi42MTk3IDE3LjQyNDYgMTUuNjkxMSAxNi43MjkxIDE1LjI0MUMxMy4zMDc5IDEzLjAyNzMgMTAuODIwOSAxMC45OTU5IDguOTIyNTEgOS4wMzczOUM5LjA5NzQyIDguODQ5ODIgOS4yNzI5MSA4LjY2NTcxIDkuNDQ4ODggOC40ODUzNEMxMS44ODY0IDUuOTg2OTIgMTQuMjQ3MiA0LjM4MDY2IDE2LjI5NDQgMy45NzEyMkMxNy4xMDY3IDMuODA4NzUgMTcuNjMzNSAzLjAxODUyIDE3LjQ3MTEgMi4yMDYxOEMxNy4zMDg2IDEuMzkzODQgMTYuNTE4NCAwLjg2NzAxMyAxNS4wNjYgMS4wMjk0OEMxMi4yNTMyIDEuNjIwMDUgOS44NjQwNiAzLjc2Mzc5IDcuMzAxNTQgNi4zOTA0N0M3LjE4MTUxIDYuNTEzNCA3LjA2MTgxIDYuNjM3ODkgNi45NDI0OSA2Ljc2Mzc1QzUuNDIwMDEgNC44MDQzMyA0LjM3MDU4IDIuODc2MzIgMy40MjU5MSAwLjg2MzE2NEMzLjA3Mzk5IDAuMTEzMjAyIDIuMTgwNzMgLTAuMjA5NDc1IDEuNDMwNzcgMC4xNDI0NDVDMC42ODA4MDkgMC40OTQzNjUgMC4zNTgxMzIgMS4zODc2MiAwLjcxMDA1MSAyLjEzNzU4QzEuODIwODggNC41MDQ4MSAzLjA3ODk5IDYuNzY1MTEgNC45MjkzMiA5LjA1MzA2QzMuMjIyMDYgMTEuMTM0MSAxLjYyNjY5IDEzLjQzMjggMC4yMjI3MjMgMTUuNzE0MkMtMC4yMTE0NTMgMTYuNDE5NyAwLjAwODUyNzUyIDE3LjM0MzcgMC43MTQwNjQgMTcuNzc3OEMxLjQxOTYgMTguMjEyIDIuMzQzNTIgMTcuOTkyIDIuNzc3NyAxNy4yODY1QzQuMDQ4MTkgMTUuMjIyIDUuNDY0MDUgMTMuMTcyNiA2Ljk1NTU5IDExLjMxNjhDOC45ODUgMTMuMzc2NSAxMS41OTU5IDE1LjQ5MjggMTUuMDk5MyAxNy43NTk3WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K"
                  alt="删除"
                  draggable={false}
                  width={18}
                  height={18}
                />
              </button>
            )}
          </div>
        </li>
      );
    }
  )
);
TodoItem.displayName = "TodoItem";

interface TodoListProps {
  todos: Todo[];
  goals: Goal[];
  lists: List[]; // 添加lists参数
  currentView: string;
  onToggleComplete: (todo: Todo) => void;
  onDelete: (todoId: string) => void;
  onRestore: (todoId: string) => void;
  onSelectTodo: (todo: Todo) => void;
  onViewGoal: (goalId: string) => void;
  onUpdateGoal: (goal: Goal) => void; // 添加更新目标的函数
  onCreateTodo: (todo: Omit<Todo, 'id' | 'created_time'>) => void; // 添加创建待办的函数
  onAssociateTasks: (taskIds: string[], goalId: string) => void; // 添加关联任务的函数
  onEditGoal: (goal: Goal) => void; // 添加编辑目标的函数
}

const TodoListComponent: React.FC<TodoListProps> = ({
  todos,
  goals,
  lists,
  currentView,
  onToggleComplete,
  onDelete,
  onRestore,
  onSelectTodo,
  onViewGoal,
  onUpdateGoal,
  onCreateTodo,
  onAssociateTasks,
  onEditGoal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(400);
  
  // INP优化
  const { scheduleInteraction, batchDOMUpdates } = useINPOptimization();
  const { startInteraction, endInteraction } = useINPMonitoring('TodoList');

  // 优化ref管理 - 只为当前todos创建ref
  const nodeRefs = useRef<
    Record<string, React.RefObject<HTMLLIElement | null>>
  >({});

  // 清理不再需要的refs
  const currentTodoIds = useMemo(
    () => new Set(todos.map((t) => t.id)),
    [todos]
  );

  useEffect(() => {
    // 清理不存在的todo的refs
    Object.keys(nodeRefs.current).forEach((id) => {
      if (!currentTodoIds.has(id)) {
        delete nodeRefs.current[id];
      }
    });

    // 为新的todos创建refs
    todos.forEach((todo) => {
      if (!nodeRefs.current[todo.id]) {
        nodeRefs.current[todo.id] = React.createRef<HTMLLIElement>();
      }
    });
  }, [todos, currentTodoIds]);

  const [animationTrigger, setAnimationTrigger] = useState(0);

  // 优化动画触发 - 减少不必要的重新渲染
  useEffect(() => {
    setAnimationTrigger((t) => t + 1);
  }, [currentView]);

  // 防抖处理todos长度变化
  const todosLengthRef = useRef(todos.length);
  useEffect(() => {
    if (Math.abs(todos.length - todosLengthRef.current) > 5) {
      setAnimationTrigger((t) => t + 1);
      todosLengthRef.current = todos.length;
    }
  }, [todos.length]);

  useEffect(() => {
    const updateHeight = () => {
      const container = document.querySelector(".todo-list-box");
      if (container) {
        const rect = container.getBoundingClientRect();
        const availableHeight = window.innerHeight - rect.top - 100;
        setContainerHeight(Math.max(300, Math.min(600, availableHeight)));
      }
    };

    updateHeight();
    window.addEventListener("resize", updateHeight);
    return () => window.removeEventListener("resize", updateHeight);
  }, []);

  // 按目标分组待办事项
  const groupedTodos = useMemo(() => {
    if (currentView !== "today") {
      return { ungrouped: todos, grouped: [] };
    }

    const goalMap = new Map(goals.map(goal => [goal.id, goal]));
    const grouped = new Map<string, { goal: Goal; todos: Todo[] }>();
    const ungrouped: Todo[] = [];

    todos.forEach(todo => {
      if (todo.goal_id && goalMap.has(todo.goal_id)) {
        const goalId = todo.goal_id;
        if (!grouped.has(goalId)) {
          grouped.set(goalId, {
            goal: goalMap.get(goalId)!,
            todos: []
          });
        }
        grouped.get(goalId)?.todos.push(todo);
      } else {
        ungrouped.push(todo);
      }
    });

    return {
      ungrouped,
      grouped: Array.from(grouped.values())
    };
  }, [todos, goals, currentView]);

  if (todos.length === 0) {
    const emptyMessage = () => {
      if (currentView === "recycle") return <div>回收站是空的！🗑️</div>;
      if (currentView === "today") return <div>今日无待办事项！🎉</div>;
      if (currentView === "inbox") return <div>收件箱是空的！👍</div>;
      return <div>此清单中没有待办事项！📝</div>;
    };
    return (
      <div className="todo-list">
        <div className="empty-tips">{emptyMessage()}</div>
      </div>
    );
  }

  // 移除内部的状态管理，通过onViewGoal回调通知父组件

  return (
    <div
      ref={containerRef}
      className="todo-list-container"
      style={{
        height: `${containerHeight}px`,
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <TransitionGroup component="ul" className="todo-list">
        {/* 渲染未分组的待办事项 */}
        {groupedTodos.ungrouped.map((todo, idx) => {
          // 确保每个todo都有nodeRef
          if (!nodeRefs.current[todo.id]) {
            nodeRefs.current[todo.id] = React.createRef<HTMLLIElement>();
          }

          return (
            <CSSTransition
              key={todo.id}
              timeout={400}
              classNames="todo-fade"
              appear
              nodeRef={nodeRefs.current[todo.id]}
            >
              <TodoItem
                ref={nodeRefs.current[todo.id]}
                todo={todo}
                currentView={currentView}
                onToggleComplete={onToggleComplete}
                onDelete={onDelete}
                onRestore={onRestore}
                onSelectTodo={onSelectTodo}
                delay={idx * 150}
                animationTrigger={animationTrigger}
              />
            </CSSTransition>
          );
        })}

        {/* 渲染目标分组 */}
        {groupedTodos.grouped.map((group) => (
          <GoalGroup
            key={group.goal.id}
            goal={group.goal}
            todos={group.todos}
            currentView={currentView}
            onToggleComplete={onToggleComplete}
            onDelete={onDelete}
            onRestore={onRestore}
            onSelectTodo={onSelectTodo}
            onViewAllClick={onViewGoal}
          />
        ))}
      </TransitionGroup>
    </div>
  );
};

export const TodoList = memo(TodoListComponent);
export { TodoItem };
