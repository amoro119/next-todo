// components/GoalGroup.tsx
import React, { memo } from "react";
import { Goal, Todo } from "../lib/types";
import { TodoItem } from "./TodoList";

interface GoalGroupProps {
  goal: Goal;
  todos: Todo[];
  currentView: string;
  onToggleComplete: (todo: Todo) => void;
  onDelete: (todoId: string) => void;
  onRestore: (todoId: string) => void;
  onSelectTodo: (todo: Todo) => void;
  onViewAllClick: (goalId: string) => void;
}

const GoalGroupComponent: React.FC<GoalGroupProps> = ({
  goal,
  todos,
  currentView,
  onToggleComplete,
  onDelete,
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
    <li className="goal-group" data-goal-id={goal.id}>
      <div className="goal-group-header">
        <h3 
          className="goal-group-title text-lg font-semibold text-gray-900 mb-3 cursor-pointer transition-colors"
          onClick={handleTitleClick}
        >
          {goal.name}
        </h3>
      </div>
      <ul className="goal-group-todos">
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
              onDelete={onDelete}
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