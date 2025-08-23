"use client";

import { useState, useEffect, useRef } from "react";
import type { Todo, Goal } from "../lib/types";
import { useDebounce } from "../lib/hooks/useDebounce";
import { searchTodos, type SearchResult } from "../lib/search/searchService";
import { searchGoals, type GoalSearchResult } from "../lib/goals/GoalSearchService";
import {
  SearchHistoryManager,
  SearchHighlighter,
} from "../lib/search/searchUtils";
import { RecurringTaskGenerator } from "../lib/recurring/RecurringTaskGenerator";
import Image from "next/image";
import React from "react";

type SearchType = 'todos' | 'goals' | 'all';

interface UnifiedSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTodo?: (todo: Todo) => void;
  onSelectGoal?: (goal: Goal) => void;
  onToggleComplete?: (todo: Todo) => void;
  onDelete?: (todoId: string) => void;
  currentView?: string;
  refreshTrigger?: number;
  defaultSearchType?: SearchType;
}

interface UnifiedSearchModalState {
  searchQuery: string;
  searchType: SearchType;
  todoResults: Todo[];
  goalResults: Goal[];
  isLoading: boolean;
  isVisible: boolean;
  searchError: string | null;
  lastSearchTime: number;
}

// Helper function for date formatting
const utcToLocalDateString = (utcDate: string | null | undefined): string => {
  if (!utcDate) return "";
  try {
    const date = new Date(utcDate);
    if (isNaN(date.getTime())) {
      const dateOnlyMatch = utcDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (dateOnlyMatch) return utcDate;
      return "";
    }
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return formatter.format(date);
  } catch (e) {
    console.error("Error formatting date:", utcDate, e);
    return "";
  }
};

// SearchTodoItem component for displaying individual todo search results
interface SearchTodoItemProps {
  todo: Todo;
  onToggleComplete?: (todo: Todo) => void;
  onDelete?: (todoId: string) => void;
  onSelectTodo?: (todo: Todo) => void;
  searchQuery: string;
  index: number;
}

const SearchTodoItem = React.memo(function SearchTodoItem({
  todo,
  onToggleComplete,
  onDelete,
  onSelectTodo,
  searchQuery,
  index,
}: SearchTodoItemProps) {
  const handleToggleComplete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onToggleComplete) {
      onToggleComplete(todo);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(todo.id);
    }
  };

  const handleSelectTodo = () => {
    if (onSelectTodo) {
      onSelectTodo(todo);
    }
  };

  // Highlight search terms in text
  const highlightText = (text: string) => {
    if (!searchQuery.trim()) return text;
    return SearchHighlighter.highlight(text, searchQuery, "search-highlight");
  };

  return (
    <div
      className={`search-todo-item ${todo.completed ? "completed" : ""} ${
        todo.deleted ? "deleted" : ""
      }`}
      onClick={handleSelectTodo}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className={`search-todo-content ${todo.completed ? "completed" : ""}`}
      >
        {/* Toggle Complete Button */}
        {!todo.deleted && (
          <button
            className={`search-todo-btn ${
              todo.completed ? "btn-unfinish" : "btn-finish"
            }`}
            onClick={handleToggleComplete}
            title={todo.completed ? "标为未完成" : "标为完成"}
          >
            {todo.completed && (
              <Image
                src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAyNCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIuMzYzMTcgOS42NzUwNkMxLjU1OTM5IDkuNDc0NDkgMC43NDUyMDQgOS45NjM0OCAwLjU0NDYyOSAxMC43NjczQzAuMzQ0MDU0IDExLjU3MSAwLjgzMzA0NyAxMi4zODUyIDEuNjM2ODMgMTIuNTg1OEwyLjM2MzE3IDkuNjc1MDZaTTguMTU4NzMgMTZMNi43ODA0MSAxNi41OTE4QzcuMDMwOTggMTcuMTc1NCA3LjYyMTk1IDE3LjU1NzkgOC4yNTU3NSAxNy40OTY5QzguODg5NTQgMTcuNDU1OCA5LjQyODc3IDE3LjAyIDkuNjAxOTEgMTYuNDA4OUw4LjE1ODczIDE2Wk0yMi4zMjYxIDMuNDY0MTNDMjMuMTM0NyAzLjI4NDA2IDIzLjY0NDIgMi40ODI1NyAyMy40NjQxIDEuNjczOTVDMjMuMjg0MSAwLjg2NTMyOCAyMi40ODI2IDAuMzU1NzkxIDIxLjY3MzkgMC41MzU4NjZMMjIuMzI2MSAzLjQ2NDEzWk0xLjYzNjgzIDEyLjU4NThDMi4wMjc2NCAxMi42ODMzIDMuMTIyOTkgMTMuMTUxIDQuMjc3OCAxMy45NDI2QzUuNDM5ODggMTQuNzM5MyA2LjM4OTA2IDE1LjY4MDMgNi43ODA0MSAxNi41OTE4TDkuNTM3MDUgMTUuNDA4MkM4LjgxMDk0IDEzLjcxNzEgNy4zMDE1NyAxMi4zNzgzIDUuOTc0MDYgMTEuNDY4MkM0LjYzOTI3IDEwLjU1MzIgMy4yMTM5OSA5Ljg4NzM4IDIuMzYzMTcgOS42NzUwNkwxLjYzNjgzIDEyLjU4NThaTTkuNjAxOTEgMTYuNDA4OUMxMC4xMzU5IDE0LjUyNDQgMTEuNDk0OCAxMS42NTg1IDEzLjY3MjcgOS4wNjM5NUMxNS44NDQ1IDYuNDc2NzUgMTguNzQxNyA0LjI2MjM1IDIyLjMyNjEgMy40NjQxM0wyMS42NzM5IDAuNTM1ODY2QzE3LjI1ODMgMS41MTkyIDEzLjgyNzUgNC4yMTM0MiAxMS4zNzQ5IDcuMTM1MTRDOC45Mjg1MiAxMC4wNDk1IDcuMzY2NzQgMTMuMjkyOSA2LjcxNTU1IDE1LjU5MTFMOS42MDE5MSAxNi40MDg5WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K"
                alt="标为未完成"
                className="icon-finish"
                width={24}
                height={18}
                draggable={false}
              />
            )}
          </button>
        )}

        {/* List name badge */}
        {todo.list_name && (
          <span className="search-todo-list-name">[{todo.list_name}] </span>
        )}

        {/* Recurring task badge */}
        {RecurringTaskGenerator.isRecurringTask(todo) && (
          <span
            className="recurring-badge"
            title={RecurringTaskGenerator.getTaskRecurrenceDescription(todo)}
          >
            🔄
          </span>
        )}

        {/* Todo title with highlighting */}
        <span
          className={`search-todo-title ${todo.completed ? "completed" : ""}`}
          dangerouslySetInnerHTML={{ __html: highlightText(todo.title) }}
        />

        {/* Due date */}
        {todo.due_date && !todo.deleted && (
          <span className="search-todo-due-date">
            {utcToLocalDateString(todo.due_date)}
          </span>
        )}

        {/* Delete button */}
        {!todo.deleted && (
          <button
            className="search-todo-btn btn-delete"
            onClick={handleDelete}
            title="删除"
          >
            <Image
              src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTgiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAxOCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZmlsbC1ydWxlPSJldmVub2RkIiBjbGlwLXJ1bGU9ImV2ZW5vZGQiIGQ9Ik0xNS4wOTkzIDE3Ljc1OTdDMTUuNzk0OSAxOC4yMDk4IDE2LjcyMzUgMTguMDEwOCAxNy4xNzM2IDE3LjMxNTJDMTcuNjIzNiAxNi42MTk3IDE3LjQyNDYgMTUuNjkxMSAxNi43MjkxIDE1LjI0MUMxMy4zMDc5IDEzLjAyNzMgMTAuODIwOSAxMC45OTU5IDguOTIyNTEgOS4wMzczOUM5LjA5NzQyIDguODQ5ODIgOS4yNzI5MSA4LjY2NTcxIDkuNDQ4ODggOC40ODUzNEMxMS44ODY0IDUuOTg2OTIgMTQuMjQ3MiA0LjM4MDY2IDE2LjI5NDQgMy45NzEyMkMxNy4xMDY3IDMuODA4NzUgMTcuNjMzNSAzLjAxODUyIDE3LjQ3MTEgMi4yMDYxOEMxNy4zMDg2IDEuMzkzODQgMTYuNTE4NCAwLjg2NzAxMyAxNS4wNjYgMS4wMjk0OEMxMi4yNTMyIDEuNjIwMDUgOS44NjQwNiAzLjc2Mzc5IDcuMzAxNTQgNi4zOTA0N0M3LjE4MTUxIDYuNTEzNCA3LjA2MTgxIDYuNjM3ODkgNi45NDI0OSA2Ljc2Mzc1QzUuNDIwMDEgNC44MDQzMyA0LjM3MDU4IDIuODc2MzIgMy40MjU5MSAwLjg2MzE2NEMzLjA3Mzk5IDAuMTEzMjAyIDIuMTgwNzMgLTAuMjA5NDc1IDEuNDMwNzcgMC4xNDI0NDVDMC42ODA4MDkgMC40OTQzNjUgMC4zNTgxMzIgMS4zODc2MiAwLjcxMDA1MSAyLjEzNzU4QzEuODIwODggNC41MDQ4MSAzLjA3ODk5IDYuNzY1MTEgNC45MjkzMiA5LjA1MzA2QzMuMjIyMDYgMTEuMTM0MSAxLjYyNjY5IDEzLjQzMjggMC4yMjI3MjMgMTUuNzE0MkMtMC4yMTE0NTMgMTYuNDE5NyAwLjAwODUyNzUyIDE3LjM0MzcgMC43MTQwNjQgMTcuNzc3OEMxLjQxOTYgMTguMjEyIDIuMzQzNTIgMTcuOTkyIDIuNzc3NyAxNy4yODY1QzQuMDQ4MTkgMTUuMjIyIDUuNDY0MDUgMTMuMTcyNiA2Ljk1NTU5IDExLjMxNjhDOC45ODUgMTMuMzc2NSAxMS41OTU5IDE1LjQ5MjggMTUuMDk5MyAxNy43NTk3WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K"
              alt="删除"
              width={18}
              height={18}
              draggable={false}
            />
          </button>
        )}
      </div>
    </div>
  );
});

// SearchGoalItem component for displaying individual goal search results
interface SearchGoalItemProps {
  goal: Goal;
  onSelectGoal?: (goal: Goal) => void;
  searchQuery: string;
  index: number;
}

const SearchGoalItem = React.memo(function SearchGoalItem({
  goal,
  onSelectGoal,
  searchQuery,
  index,
}: SearchGoalItemProps) {
  const handleSelectGoal = () => {
    if (onSelectGoal) {
      onSelectGoal(goal);
    }
  };

  // Highlight search terms in text
  const highlightText = (text: string) => {
    if (!searchQuery.trim()) return text;
    return SearchHighlighter.highlight(text, searchQuery, "search-highlight");
  };

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 3: return '#ef4444'; // 高优先级 - 红色
      case 2: return '#f59e0b'; // 中优先级 - 橙色
      case 1: return '#10b981'; // 低优先级 - 绿色
      default: return '#6b7280'; // 无优先级 - 灰色
    }
  };

  const getPriorityText = (priority: number) => {
    switch (priority) {
      case 3: return '高';
      case 2: return '中';
      case 1: return '低';
      default: return '无';
    }
  };

  return (
    <div
      className={`search-goal-item ${goal.is_archived ? "archived" : ""}`}
      onClick={handleSelectGoal}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="search-goal-content">
        {/* Goal icon */}
        <span className="search-goal-icon">🎯</span>

        {/* List name badge */}
        {goal.list_name && (
          <span className="search-goal-list-name">[{goal.list_name}] </span>
        )}

        {/* Goal name with highlighting */}
        <span
          className="search-goal-title"
          dangerouslySetInnerHTML={{ __html: highlightText(goal.name) }}
        />

        {/* Priority badge */}
        <span 
          className="search-goal-priority"
          style={{ 
            backgroundColor: getPriorityColor(goal.priority),
            color: 'white',
            padding: '2px 6px',
            borderRadius: '4px',
            fontSize: '12px',
            marginLeft: '8px'
          }}
        >
          {getPriorityText(goal.priority)}
        </span>

        {/* Due date */}
        {goal.due_date && (
          <span className="search-goal-due-date">
            到期: {utcToLocalDateString(goal.due_date)}
          </span>
        )}

        {/* Archived badge */}
        {goal.is_archived && (
          <span className="search-goal-archived">已存档</span>
        )}
      </div>

      {/* Goal description with highlighting */}
      {goal.description && (
        <div 
          className="search-goal-description"
          dangerouslySetInnerHTML={{ __html: highlightText(goal.description) }}
        />
      )}
    </div>
  );
});

export default function UnifiedSearchModal({
  isOpen,
  onClose,
  onSelectTodo,
  onSelectGoal,
  onToggleComplete,
  onDelete,
  currentView,
  refreshTrigger,
  defaultSearchType = 'all',
}: UnifiedSearchModalProps) {
  const [state, setState] = useState<UnifiedSearchModalState>({
    searchQuery: "",
    searchType: defaultSearchType,
    todoResults: [],
    goalResults: [],
    isLoading: false,
    isVisible: false,
    searchError: null,
    lastSearchTime: 0,
  });

  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const searchAbortController = useRef<AbortController | null>(null);

  // 使用防抖处理搜索查询
  const debouncedSearchQuery = useDebounce(state.searchQuery, 300);

  // Handle modal visibility and focus management
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      setState((prev) => ({ ...prev, isVisible: true }));
      
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);

      document.body.style.overflow = "hidden";
    } else {
      setState((prev) => ({
        ...prev,
        isVisible: false,
        searchQuery: "",
        todoResults: [],
        goalResults: [],
        isLoading: false,
        searchError: null,
        lastSearchTime: 0,
      }));

      if (searchAbortController.current) {
        searchAbortController.current.abort();
        searchAbortController.current = null;
      }

      document.body.style.overflow = "";

      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }

    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle keyboard events for modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }

      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // 执行搜索的效果
  useEffect(() => {
    if (!isOpen) return;

    const performSearch = async () => {
      const query = debouncedSearchQuery.trim();

      if (!query) {
        setState((prev) => ({
          ...prev,
          todoResults: [],
          goalResults: [],
          isLoading: false,
          searchError: null,
        }));
        return;
      }

      if (searchAbortController.current) {
        searchAbortController.current.abort();
      }

      searchAbortController.current = new AbortController();
      const currentController = searchAbortController.current;

      try {
        setState((prev) => ({
          ...prev,
          isLoading: true,
          searchError: null,
        }));

        const startTime = Date.now();
        const promises: Promise<any>[] = [];

        // 根据搜索类型决定要执行的搜索
        if (state.searchType === 'todos' || state.searchType === 'all') {
          promises.push(
            searchTodos(query, {
              fields: ["title", "content", "tags"],
              includeCompleted: true,
              includeDeleted: false,
              limit: 25,
            })
          );
        } else {
          promises.push(Promise.resolve({ todos: [] }));
        }

        if (state.searchType === 'goals' || state.searchType === 'all') {
          promises.push(
            searchGoals(query, {
              fields: ["name", "description"],
              includeArchived: false,
              limit: 25,
            })
          );
        } else {
          promises.push(Promise.resolve({ goals: [] }));
        }

        const [todoResult, goalResult] = await Promise.all(promises);

        if (currentController.signal.aborted) {
          return;
        }

        SearchHistoryManager.addToHistory(query);

        setState((prev) => ({
          ...prev,
          todoResults: todoResult.todos || [],
          goalResults: goalResult.goals || [],
          isLoading: false,
          searchError: null,
          lastSearchTime: Date.now() - startTime,
        }));
      } catch (error) {
        if (currentController.signal.aborted) {
          return;
        }

        console.error("Search failed:", error);

        setState((prev) => ({
          ...prev,
          todoResults: [],
          goalResults: [],
          isLoading: false,
          searchError: "搜索失败，请重试",
          lastSearchTime: 0,
        }));
      }
    };

    performSearch();

    return () => {
      if (searchAbortController.current) {
        searchAbortController.current.abort();
        searchAbortController.current = null;
      }
    };
  }, [debouncedSearchQuery, isOpen, state.searchType]);

  // Handle search input changes
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setState((prev) => ({
      ...prev,
      searchQuery: query,
      searchError: null,
    }));
  };

  // Handle search type change
  const handleSearchTypeChange = (newType: SearchType) => {
    setState((prev) => ({
      ...prev,
      searchType: newType,
      searchError: null,
    }));
  };

  // Handle overlay click to close modal
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  // Calculate total results
  const totalResults = state.todoResults.length + state.goalResults.length;

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="search-modal-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-modal-title"
    >
      <div
        ref={modalRef}
        className="search-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="search-modal-header">
          <h2 id="search-modal-title" className="search-modal-title">
            统一搜索
          </h2>
          <button
            className="search-modal-close"
            onClick={onClose}
            aria-label="关闭搜索"
          >
            ×
          </button>
        </div>

        {/* Search Type Tabs */}
        <div className="search-type-tabs">
          <button
            className={`search-type-tab ${state.searchType === 'all' ? 'active' : ''}`}
            onClick={() => handleSearchTypeChange('all')}
          >
            全部
          </button>
          <button
            className={`search-type-tab ${state.searchType === 'todos' ? 'active' : ''}`}
            onClick={() => handleSearchTypeChange('todos')}
          >
            任务
          </button>
          <button
            className={`search-type-tab ${state.searchType === 'goals' ? 'active' : ''}`}
            onClick={() => handleSearchTypeChange('goals')}
          >
            目标
          </button>
        </div>

        {/* Search Input */}
        <div className="search-input-container">
          <input
            ref={searchInputRef}
            type="text"
            className="search-input"
            placeholder={
              state.searchType === 'todos' ? "搜索任务标题、内容、标签..." :
              state.searchType === 'goals' ? "搜索目标名称、描述..." :
              "搜索任务和目标..."
            }
            value={state.searchQuery}
            onChange={handleSearchChange}
            autoComplete="off"
          />
        </div>

        {/* Search Results Container */}
        <div className="search-results-container">
          {/* 加载状态 */}
          {state.isLoading && (
            <div className="search-loading">
              <div className="loading-spinner"></div>
              <span>搜索中...</span>
            </div>
          )}

          {/* 搜索错误状态 */}
          {!state.isLoading && state.searchError && (
            <div className="search-error">
              <p>{state.searchError}</p>
              <button
                className="search-retry-btn"
                onClick={() =>
                  setState((prev) => ({ ...prev, searchError: null }))
                }
              >
                重试
              </button>
            </div>
          )}

          {/* 无结果状态 */}
          {!state.isLoading &&
            !state.searchError &&
            state.searchQuery &&
            totalResults === 0 && (
              <div className="search-no-results">
                <p>暂无匹配结果</p>
                <p className="search-no-results-hint">
                  尝试使用不同的关键词或检查拼写
                </p>
              </div>
            )}

          {/* 空状态 */}
          {!state.isLoading && !state.searchError && !state.searchQuery && (
            <div className="search-empty-state">
              <p>开始输入以搜索</p>
              <p className="search-empty-hint">
                {state.searchType === 'todos' ? "可以搜索任务标题、内容、标签" :
                 state.searchType === 'goals' ? "可以搜索目标名称、描述" :
                 "可以搜索任务和目标"}
              </p>
            </div>
          )}

          {/* 搜索结果 */}
          {!state.isLoading &&
            !state.searchError &&
            totalResults > 0 && (
              <div className="search-results">
                <div className="search-results-header">
                  <span className="search-results-count">
                    找到 {totalResults} 个匹配结果
                    {state.todoResults.length > 0 && ` (${state.todoResults.length} 个任务`}
                    {state.goalResults.length > 0 && state.todoResults.length > 0 && ', '}
                    {state.goalResults.length > 0 && `${state.goalResults.length} 个目标`}
                    {(state.todoResults.length > 0 || state.goalResults.length > 0) && ')'}
                  </span>
                  {state.lastSearchTime > 0 && (
                    <span className="search-results-time">
                      ({state.lastSearchTime}ms)
                    </span>
                  )}
                </div>

                <div className="search-results-list">
                  {/* 目标结果 */}
                  {state.goalResults.length > 0 && (
                    <div className="search-section">
                      <h3 className="search-section-title">目标 ({state.goalResults.length})</h3>
                      <div className="search-goal-list">
                        {state.goalResults.map((goal, index) => (
                          <SearchGoalItem
                            key={goal.id}
                            goal={goal}
                            onSelectGoal={onSelectGoal}
                            searchQuery={state.searchQuery}
                            index={index}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 任务结果 */}
                  {state.todoResults.length > 0 && (
                    <div className="search-section">
                      <h3 className="search-section-title">任务 ({state.todoResults.length})</h3>
                      <div className="search-todo-list">
                        {state.todoResults.map((todo, index) => (
                          <SearchTodoItem
                            key={todo.id}
                            todo={todo}
                            onToggleComplete={onToggleComplete}
                            onDelete={onDelete}
                            onSelectTodo={onSelectTodo}
                            searchQuery={state.searchQuery}
                            index={index + state.goalResults.length}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}