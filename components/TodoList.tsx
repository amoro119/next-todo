// components/TodoList.tsx
import React, {
  memo,
  useRef,
  useEffect,
  useState,
  forwardRef,
  useMemo,
} from "react";
import Image from "next/image";
import { TransitionGroup, CSSTransition } from "react-transition-group";
import type { Todo, Goal } from "../lib/types";
import { RecurringTaskGenerator } from "../lib/recurring/RecurringTaskGenerator";
import { inboxCache } from "./InboxPerformanceOptimizer";
import { useOptimizedClick } from "./INPOptimizer";
import { GoalGroup } from "./GoalGroup";
import { Button } from "@/components/ui/button";
import { TODO_ITEM_STYLES } from "@/components/todos/todoItemStyles";

// 优化的日期转换函数 - 使用缓存
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  return inboxCache.getDateString(utcDate);
};

interface TodoItemProps {
  todo: Todo;
  currentView: string;
  onToggleComplete: (todo: Todo) => void;
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

      return (
        <li
          ref={ref}
          className={`${TODO_ITEM_STYLES.row} mb-2${
            todo.deleted ? " opacity-50 bg-muted" : ""
          }`}
          data-delay={delay}
          onClick={handleSelectTodo}
          style={{ opacity: show ? 1 : 0 }}
        >
          <div className={`${TODO_ITEM_STYLES.content}${
            todo.completed ? ` ${TODO_ITEM_STYLES.completedContent}` : ""
          }`}>
            {todo.deleted ? (
              <button className="flex items-center justify-center cursor-pointer border border-border rounded-full transition-all duration-200 shrink-0 bg-background hover:bg-accent w-[30px] h-[30px] px-3 py-1.5 text-[13px]" onClick={handleRestore}>
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
                className={`${TODO_ITEM_STYLES.checkbox} ${
                  todo.completed
                    ? TODO_ITEM_STYLES.checkboxCompleted
                    : TODO_ITEM_STYLES.checkboxPending
                }`}
                onClick={handleToggleComplete}
                title={todo.completed ? "标为未完成" : "标为完成"}
                aria-label={todo.completed ? "标为未完成" : "标为完成"}
                aria-checked={todo.completed}
                role="checkbox"
              >
                {todo.completed && (
                  <svg viewBox="0 0 12 10" fill="none" className="w-3 h-auto" aria-hidden="true">
                    <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary-foreground" />
                  </svg>
                )}
              </button>
            )}

            {(currentView === "inbox" || currentView === "today") &&
              todo.list_name && (
                <span className="text-accent-foreground font-bold mr-1.5 text-sm">[{todo.list_name}] </span>
              )}

            <div className={TODO_ITEM_STYLES.title}>{todo.title}</div>

            {/* 显示重复规则（仅原始重复任务） */}
            {isRecurringTask && recurringDescription && !todo.deleted && (
              <span className="text-xs text-muted-foreground ml-2" title="重复规则">
                {recurringDescription}
              </span>
            )}

            {formattedDueDate && currentView !== "list" && !todo.deleted && (
              <span className={TODO_ITEM_STYLES.meta}>{formattedDueDate}</span>
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
  currentView: string;
  onToggleComplete: (todo: Todo) => void;
  onRestore: (todoId: string) => void;
  onSelectTodo: (todo: Todo) => void;
  onViewGoal: (goalId: string) => void;
  onOpenCreateTodo?: () => void;
}

const TodoListComponent: React.FC<TodoListProps> = ({
  todos,
  goals,
  currentView,
  onToggleComplete,
  onRestore,
  onSelectTodo,
  onViewGoal,
  onOpenCreateTodo,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
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
      <div className="space-y-2">
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-sm text-[oklch(var(--muted-foreground))]">
          {emptyMessage()}
          {currentView !== "recycle" && onOpenCreateTodo && (
            <Button type="button" size="sm" onClick={onOpenCreateTodo}>
              创建第一个任务
            </Button>
          )}
        </div>
      </div>
    );
  }

  // 移除内部的状态管理，通过onViewGoal回调通知父组件

  return (
    <div
      ref={containerRef}
      className="relative h-full"
      style={{
        overflowY: "auto",
        overflowX: "hidden",
      }}
    >
      <TransitionGroup component="ul" className="space-y-2">
        {[
          ...groupedTodos.ungrouped.map((todo, idx) => {
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
                  onRestore={onRestore}
                  onSelectTodo={onSelectTodo}
                  delay={idx * 150}
                  animationTrigger={animationTrigger}
                />
              </CSSTransition>
            );
          }),
          ...groupedTodos.grouped.map((group) => (
            <GoalGroup
              key={group.goal.id}
              goal={group.goal}
              todos={group.todos}
              currentView={currentView}
              onToggleComplete={onToggleComplete}
              onRestore={onRestore}
              onSelectTodo={onSelectTodo}
              onViewAllClick={onViewGoal}
            />
          )),
        ]}
      </TransitionGroup>
    </div>
  );
};

export const TodoList = memo(TodoListComponent);
export { TodoItem };
