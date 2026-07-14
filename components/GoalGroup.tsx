// components/GoalGroup.tsx
import React, { memo } from "react";
import { Goal, Todo } from "../lib/types";
import { TodoItem } from "./TodoList";

interface GoalGroupProps {
  goal: Goal;
  todos: Todo[];
  currentView: string;
  onToggleComplete: (todo: Todo) => void;
  onRestore: (todoId: string) => void;
  onSelectTodo: (todo: Todo) => void;
  onViewAllClick: (goalId: string) => void;
}

const GoalGroupComponent: React.FC<GoalGroupProps> = ({
  goal,
  todos,
  currentView,
  onToggleComplete,
  onRestore,
  onSelectTodo,
  onViewAllClick,
}) => {
  // 为TodoItem组件创建refs
  const todoItemRefs = React.useRef<Record<string, React.RefObject<HTMLLIElement | null>>>({});

  React.useEffect(() => {
    // 清理不存在的todo的refs
    const currentTodoIds = new Set(todos.map(t => t.id));
    Object.keys(todoItemRefs.current).forEach(id => {
      if (!currentTodoIds.has(id)) {
        delete todoItemRefs.current[id];
      }
    });

    // 为新的todos创建refs
    todos.forEach(todo => {
      if (!todoItemRefs.current[todo.id]) {
        todoItemRefs.current[todo.id] = React.createRef<HTMLLIElement | null>();
      }
    });
  }, [todos]);

  const handleTitleClick = () => {
    onViewAllClick(goal.id);
  };

  return (
    <li className="mb-4" data-goal-id={goal.id}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="mb-3 cursor-pointer text-left text-lg font-semibold text-foreground transition-colors hover:text-foreground/80 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={handleTitleClick}
        >
          {goal.name}
        </button>
      </div>
      <ul className="space-y-1">
        {todos.map((todo, idx) => {
          // 确保每个todo都有ref
          if (!todoItemRefs.current[todo.id]) {
            todoItemRefs.current[todo.id] = React.createRef<HTMLLIElement | null>();
          }

          return (
            <TodoItem
              key={todo.id}
              ref={todoItemRefs.current[todo.id]}
              todo={todo}
              currentView={currentView}
              onToggleComplete={onToggleComplete}
              onRestore={onRestore}
              onSelectTodo={onSelectTodo}
              delay={idx * 150}
              animationTrigger={0}
            />
          );
        })}
      </ul>
    </li>
  );
};

export const GoalGroup = memo(GoalGroupComponent);
