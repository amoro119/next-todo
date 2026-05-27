// components/TaskSearchModal.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import type { Todo } from "../lib/types";
import { useDebounce } from "../lib/hooks/useDebounce";
import { searchTodos, type SearchResult } from "../lib/search/searchService";
import {
  SearchHistoryManager,
  SearchHighlighter,
} from "../lib/search/searchUtils";
import { RecurringTaskGenerator } from "../lib/recurring/RecurringTaskGenerator";
import { dbUTCToDisplayDate } from "../lib/utils/dateUtils";
import Image from "next/image";
import React from "react";

interface TaskSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTodo?: (todo: Todo) => void;
  onToggleComplete?: (todo: Todo) => void;
  onDelete?: (todoId: string) => void;
  currentView?: string;
  refreshTrigger?: number; // 用于触发搜索结果刷新
}

interface TaskSearchModalState {
  searchQuery: string;
  searchResults: Todo[];
  isLoading: boolean;
  isloadingMore: boolean; // 添加加载更多状态
  isVisible: boolean;
  searchError: string | null;
  lastSearchTime: number;
  hasMoreResults: boolean; // 添加是否有更多结果的标志
}

// SearchTodoItem component for displaying individual search results
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
    return SearchHighlighter.highlight(text, searchQuery, "font-semibold text-foreground bg-amber-50 text-amber-800");
  };

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 hover:bg-muted cursor-pointer transition-colors duration-150 ${todo.completed ? "opacity-60" : ""} ${todo.deleted ? "line-through opacity-40" : ""}`}
      onClick={handleSelectTodo}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className={`flex items-center gap-3 flex-1 min-w-0 ${todo.completed ? "opacity-75" : ""}`}
      >
        {/* Toggle Complete Button */}
        {!todo.deleted && (
          <button
            className={`flex items-center justify-center w-[30px] h-[30px] rounded-full border border-border shrink-0 bg-background hover:bg-muted transition-colors duration-150 ${todo.completed ? "bg-muted" : ""}`}
            onClick={handleToggleComplete}
            title={todo.completed ? "标为未完成" : "标为完成"}
          >
            {todo.completed && (
              <Image
                src="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMTgiIHZpZXdCb3g9IjAgMCAyNCAxOCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTIuMzYzMTcgOS42NzUwNkMxLjU1OTM5IDkuNDc0NDkgMC43NDUyMDQgOS45NjM0OCAwLjU0NDYyOSAxMC43NjczQzAuMzQ0MDU0IDExLjU3MSAwLjgzMzA0NyAxMi4zODUyIDEuNjM2ODMgMTIuNTg1OEwyLjM2MzE3IDkuNjc1MDZaTTguMTU4NzMgMTZMNi43ODA0MSAxNi41OTE4QzcuMDMwOTggMTcuMTc1NCA3LjYyMTk1IDE3LjU1NzkgOC4yNTU3NSAxNy40OTY5QzguODg5NTQgMTcuNDU1OCA5LjQyODc3IDE3LjAyIDkuNjAxOTEgMTYuNDA4OUw4LjE1ODczIDE2Wk0yMi4zMjYxIDMuNDY0MTNDMjMuMTM0NyAzLjI4NDA2IDIzLjY0NDIgMi40ODI1NyAyMy40NjQxIDEuNjczOTVDMjMuMjg0MSAwLjg2NTMyOCAyMi40ODI2IDAuMzU1NzkxIDIxLjY3MzkgMC41MzU4NjZMMjIuMzI2MSAzLjQ2NDEzWk0xLjYzNjgzIDEyLjU4NThDMi4wMjc2NCAxMi42ODMzIDMuMTIyOTkgMTMuMTUxIDQuMjc3OCAxMy45NDI2QzUuNDM5ODggMTQuNzM5MyA2LjM4OTA2IDE1LjY4MDMgNi43ODA0MSAxNi41OTE4TDkuNTM3MDUgMTUuNDA4MkM4LjgxMDk0IDEzLjcxNzEgNy4zMDE1NyAxMi4zNzgzIDUuOTc0MDYgMTEuNDY4MkM0LjYzOTI3IDEwLjU1MzIgMy4yMTM5OSA5Ljg4NzM4IDIuMzYzMTcgOS42NzUwNkwxLjYzNjgzIDEyLjU4NThaTTkuNjAxOTEgMTYuNDA4OUMxMC4xMzU5IDE0LjUyNDQgMTEuNDk0OCAxMS42NTg1IDEzLjY3MjcgOS4wNjM5NUMxNS44NDQ1IDYuNDc2NzUgMTguNzQxNyA0LjI2MjM1IDIyLjMyNjEgMy40NjQxM0wyMS42NzM5IDAuNTM1ODY2QzE3LjI1ODMgMS41MTkyIDEzLjgyNzUgNC4yMTM0MiAxMS4zNzQ5IDcuMTM1MTRDOC45Mjg1MiAxMC4wNDk1IDcuMzY2NzQgMTMuMjkyOSA2LjcxNTU1IDE1LjU5MTFMOS42MDE5MSAxNi40MDg5WiIgZmlsbD0iIzMzMzIyRSIvPgo8L3N2Zz4K"
                alt="标为未完成"
                className="relative left-1 top-0.5"
                width={24}
                height={18}
                draggable={false}
              />
            )}
          </button>
        )}

        {/* List name badge */}
        {todo.list_name && (
          <span className="text-accent-foreground font-bold mr-1 text-sm">[{todo.list_name}] </span>
        )}

        {/* Recurring task badge - unified for both original and instances */}
        {RecurringTaskGenerator.isRecurringTask(todo) && (
          <span
            className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded ml-1"
            title={RecurringTaskGenerator.getTaskRecurrenceDescription(todo)}
          >
            🔄
          </span>
        )}

        {/* Todo title with highlighting */}
        <span
          className={`flex-1 text-sm text-foreground truncate ${todo.completed ? "line-through text-muted-foreground" : ""}`}
          dangerouslySetInnerHTML={{ __html: highlightText(todo.title) }}
        />

        {/* Next due date for recurring tasks */}
        {RecurringTaskGenerator.isRecurringTask(todo) &&
          todo.next_due_date &&
          !todo.deleted && (
            <span className="text-xs text-muted-foreground ml-2" title="下次到期时间">
              下次: {dbUTCToDisplayDate(todo.next_due_date)}
            </span>
          )}

        {/* Due date */}
        {todo.due_date && !todo.deleted && (
          <span className="text-xs text-muted-foreground ml-1">
            {dbUTCToDisplayDate(todo.due_date)}
          </span>
        )}

        {/* Delete button */}
        {!todo.deleted && (
          <button
            className="p-1.5 rounded-md hover:bg-muted transition-colors duration-150 text-muted-foreground shrink-0"
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

      {/* Todo content with highlighting */}
      {/* {todo.content && (
        <div 
          className="text-muted-foreground text-[13px] leading-relaxed mt-2 max-h-10 overflow-hidden text-ellipsis line-clamp-2"
          dangerouslySetInnerHTML={{ __html: highlightText(todo.content) }}
        />
      )} */}

      {/* Tags */}
      {/* {todo.tags && (
        <div className="flex flex-wrap gap-1 mt-2">
          {todo.tags.split(',').map((tag, idx) => (
            <span 
              key={idx} 
              className="bg-muted text-foreground px-1.5 py-0.5 rounded text-[11px] font-medium"
              dangerouslySetInnerHTML={{ __html: highlightText(tag.trim()) }}
            />
          ))}
        </div>
      )} */}
    </div>
  );
});

// Memoized search results list for better performance
interface SearchResultsListProps {
  searchResults: Todo[];
  searchQuery: string;
  onToggleComplete?: (todo: Todo) => void;
  onDelete?: (todoId: string) => void;
  onSelectTodo?: (todo: Todo) => void;
}

const SearchResultsList = React.memo(function SearchResultsList({
  searchResults,
  searchQuery,
  onToggleComplete,
  onDelete,
  onSelectTodo,
}: SearchResultsListProps) {
  return (
    <>
      {searchResults.map((todo, index) => (
        <SearchTodoItem
          key={todo.id}
          todo={todo}
          onToggleComplete={onToggleComplete}
          onDelete={onDelete}
          onSelectTodo={onSelectTodo}
          searchQuery={searchQuery}
          index={index}
        />
      ))}
    </>
  );
});

export default function TaskSearchModal({
  isOpen,
  onClose,
  onSelectTodo,
  onToggleComplete,
  onDelete,
  currentView,
  refreshTrigger,
}: TaskSearchModalProps) {
  const [state, setState] = useState<TaskSearchModalState>({
    searchQuery: "",
    searchResults: [],
    isLoading: false,
    isloadingMore: false, // 初始化加载更多状态
    isVisible: false,
    searchError: null,
    lastSearchTime: 0,
    hasMoreResults: true, // 初始化更多结果标志
  });

  // 添加状态来存储总匹配数
  const [totalMatches, setTotalMatches] = useState<number>(0);

  const modalRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const searchAbortController = useRef<AbortController | null>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);

  // 使用防抖处理搜索查询
  const debouncedSearchQuery = useDebounce(state.searchQuery, 300);

  // Handle modal visibility and focus management
  useEffect(() => {
    if (isOpen) {
      // Store the previously focused element
      previousActiveElement.current = document.activeElement as HTMLElement;

      // Set modal as visible
      setState((prev) => ({ ...prev, isVisible: true }));

      // Focus the search input after a brief delay to ensure modal is rendered
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);

      // Prevent background scrolling
      document.body.style.overflow = "hidden";
    } else {
      // Reset state when closing
      setState((prev) => ({
        ...prev,
        isVisible: false,
        searchQuery: "",
        searchResults: [],
        isLoading: false,
        searchError: null,
        lastSearchTime: 0,
      }));
      setTotalMatches(0);

      // 取消正在进行的搜索
      if (searchAbortController.current) {
        searchAbortController.current.abort();
        searchAbortController.current = null;
      }

      // Restore background scrolling
      document.body.style.overflow = "";

      // Restore focus to previously focused element
      if (previousActiveElement.current) {
        previousActiveElement.current.focus();
      }
    }

    // Cleanup on unmount
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

      // Handle Ctrl/Cmd+K to close modal when already open
      if ((event.ctrlKey || event.metaKey) && event.key === "k") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Focus trap implementation
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;

    const modal = modalRef.current;
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[
      focusableElements.length - 1
    ] as HTMLElement;

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement?.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement?.focus();
          e.preventDefault();
        }
      }
    };

    modal.addEventListener("keydown", handleTabKey);
    return () => modal.removeEventListener("keydown", handleTabKey);
  }, [isOpen]);

  // Handle scroll for infinite loading
  useEffect(() => {
    if (!isOpen || !resultsListRef.current) return;

    const resultsList = resultsListRef.current;
    
    const handleScroll = async () => {
      // Check if we're near the bottom of the scrollable area
      const { scrollTop, scrollHeight, clientHeight } = resultsList;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100; // 100px from bottom
      
      // Load more results when near bottom and there are more results to load
      if (isNearBottom && state.hasMoreResults && !state.isloadingMore && state.searchResults.length > 0) {
        setState(prev => ({ ...prev, isloadingMore: true }));
        
        try {
          const searchResult = await searchTodos(state.searchQuery, {
            fields: ["title", "content", "tags"],
            includeCompleted: true,
            includeDeleted: false,
            limit: 100,
            offset: state.searchResults.length,
          });
          
          setState(prev => ({
            ...prev,
            searchResults: [...prev.searchResults, ...searchResult.todos],
            isloadingMore: false,
            hasMoreResults: searchResult.todos.length === 100, // If we got less than 100 results, there are no more
          }));
        } catch (error) {
          console.error("Failed to load more search results:", error);
          setState(prev => ({ ...prev, isloadingMore: false }));
        }
      }
    };

    resultsList.addEventListener("scroll", handleScroll);
    return () => resultsList.removeEventListener("scroll", handleScroll);
  }, [isOpen, state.searchResults.length, state.hasMoreResults, state.isloadingMore, state.searchQuery]);

  // 执行搜索的效果
  useEffect(() => {
    if (!isOpen) return;

    const performSearch = async () => {
      const query = debouncedSearchQuery.trim();

      // 如果查询为空，清空结果
      if (!query) {
        setState((prev) => ({
          ...prev,
          searchResults: [],
          isLoading: false,
          isloadingMore: false,
          searchError: null,
          hasMoreResults: true,
        }));
        setTotalMatches(0);
        return;
      }

      // 取消之前的搜索请求
      if (searchAbortController.current) {
        searchAbortController.current.abort();
      }

      // 创建新的 AbortController
      searchAbortController.current = new AbortController();
      const currentController = searchAbortController.current;

      try {
        // 设置加载状态
        setState((prev) => ({
          ...prev,
          isLoading: true,
          searchError: null,
        }));

        const startTime = Date.now();

        // 执行搜索
        const searchResult: SearchResult = await searchTodos(query, {
          fields: ["title", "content", "tags"],
          includeCompleted: true,
          includeDeleted: false,
          limit: 100,
        });

        // 检查请求是否被取消
        if (currentController.signal.aborted) {
          return;
        }

        // 添加到搜索历史
        SearchHistoryManager.addToHistory(query);

        // 更新搜索结果
        setState((prev) => ({
          ...prev,
          searchResults: searchResult.todos,
          isLoading: false,
          isloadingMore: false,
          searchError: null,
          lastSearchTime: Date.now() - startTime,
          hasMoreResults: searchResult.todos.length === 100,
        }));
        setTotalMatches(searchResult.totalMatches);
      } catch (error) {
        // 检查是否是取消错误
        if (currentController.signal.aborted) {
          return;
        }

        console.error("Search failed:", error);

        setState((prev) => ({
          ...prev,
          searchResults: [],
          isLoading: false,
          searchError: "搜索失败，请重试",
          lastSearchTime: 0,
        }));
        setTotalMatches(0);
      }
    };

    performSearch();

    // 清理函数
    return () => {
      if (searchAbortController.current) {
        searchAbortController.current.abort();
        searchAbortController.current = null;
      }
    };
  }, [debouncedSearchQuery, isOpen]);

  // 监听refreshTrigger变化，重新执行搜索
  useEffect(() => {
    if (!isOpen || (refreshTrigger ?? 0) <= 0 || !state.searchQuery.trim()) return;

    const performRefreshSearch = async () => {
      const query = state.searchQuery.trim();

      // 取消之前的搜索请求
      if (searchAbortController.current) {
        searchAbortController.current.abort();
      }

      // 创建新的 AbortController
      searchAbortController.current = new AbortController();
      const currentController = searchAbortController.current;

      try {
        // 设置加载状态
        setState((prev) => ({
          ...prev,
          isLoading: true,
          searchError: null,
        }));

        const startTime = Date.now();

        // 执行搜索（强制刷新，跳过缓存）
        const searchResult: SearchResult = await searchTodos(query, {
          fields: ["title", "content", "tags"],
          includeCompleted: true,
          includeDeleted: false,
          limit: 100,
          forceRefresh: true, // 强制刷新
        });

        // 检查请求是否被取消
        if (currentController.signal.aborted) {
          return;
        }

        // 更新搜索结果
        setState((prev) => ({
          ...prev,
          searchResults: searchResult.todos,
          isLoading: false,
          isloadingMore: false,
          searchError: null,
          lastSearchTime: Date.now() - startTime,
          hasMoreResults: searchResult.todos.length === 100,
        }));
        setTotalMatches(searchResult.totalMatches);
      } catch (error) {
        // 检查是否是取消错误
        if (currentController.signal.aborted) {
          return;
        }

        console.error("Refresh search failed:", error);

        setState((prev) => ({
          ...prev,
          isLoading: false,
          searchError: "刷新搜索失败，请重试",
        }));
      }
    };

    performRefreshSearch();
  }, [refreshTrigger, isOpen, state.searchQuery]);

  // Handle search input changes
  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const query = event.target.value;
    setState((prev) => ({
      ...prev,
      searchQuery: query,
      searchError: null, // 清除之前的错误
    }));
  };

  
  // Handle overlay click to close modal
  const handleOverlayClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) {
      onClose();
    }
  };

  
  // Handle close button click
  const handleCloseClick = () => {
    onClose();
  };

  // Don't render anything if modal is not open
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-16"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-background border border-border rounded-lg w-full max-w-xl shadow-sm overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 id="search-modal-title" className="text-sm font-semibold text-foreground">
            搜索任务
          </h2>
          <button
            className="p-1.5 rounded-md hover:bg-muted transition-colors duration-150 text-muted-foreground text-lg leading-none"
            onClick={handleCloseClick}
            aria-label="关闭搜索"
          >
            ×
          </button>
        </div>

        {/* Search Input */}
        <div className="px-4 py-2 border-b border-border">
          <input
            ref={searchInputRef}
            type="text"
            className="w-full py-2 text-sm text-foreground bg-background placeholder:text-muted-foreground focus:outline-none"
            placeholder="搜索任务标题、内容、标签..."
            value={state.searchQuery}
            onChange={handleSearchChange}
            autoComplete="off"
          />
        </div>

        {/* Search Results Container */}
        <div className="max-h-[60vh] overflow-y-auto">
          {/* 加载状态 */}
          {state.isLoading && (
            <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-sm">
              <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
              <span>搜索中...</span>
            </div>
          )}

          {/* 搜索错误状态 */}
          {!state.isLoading && state.searchError && (
              <div className="px-4 py-6 text-center text-muted-foreground text-sm">
              <p>{state.searchError}</p>
              <button
                className="mt-2 px-3 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors duration-150"
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
            state.searchResults.length === 0 && (
              <div className="px-4 py-8 text-center text-muted-foreground text-sm">
                <p>暂无匹配任务</p>
                <p className="text-xs mt-1 text-muted-foreground/70">
                  尝试使用不同的关键词或检查拼写
                </p>
              </div>
            )}

          {/* 空状态 */}
          {!state.isLoading && !state.searchError && !state.searchQuery && (
            <div className="px-4 py-8 text-center text-muted-foreground text-sm">
              <p>开始输入以搜索任务</p>
              <p className="text-xs mt-1 text-muted-foreground/70">可以搜索任务标题、内容、标签</p>
            </div>
          )}

          {/* 搜索结果 */}
          {!state.isLoading &&
            !state.searchError &&
            state.searchResults.length > 0 && (
              <div className="w-full">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <span className="text-xs text-muted-foreground">
                    找到 {totalMatches} 个匹配任务
                  </span>
                  {state.lastSearchTime > 0 && (
                     <span className="text-xs text-muted-foreground/60">
                      ({state.lastSearchTime}ms)
                    </span>
                  )}
                </div>

                <div className="overflow-y-auto" ref={resultsListRef}>
                  <div className="divide-y divide-border">
                    <SearchResultsList
                      searchResults={state.searchResults}
                      searchQuery={state.searchQuery}
                      onToggleComplete={onToggleComplete}
                      onDelete={onDelete}
                      onSelectTodo={onSelectTodo}
                    />
                    {state.isloadingMore && (
                      <div className="flex items-center gap-2 px-4 py-3 text-muted-foreground text-sm">
                        <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
                        <span>加载更多...</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
}
