// components/goals/AssociateTaskModal.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import type { Todo } from "../../lib/types";
import { useDebounce } from "../../lib/hooks/useDebounce";
import { searchTodos, type SearchResult } from "../../lib/search/searchService";
import {
  SearchHistoryManager,
  SearchHighlighter,
} from "../../lib/search/searchUtils";
import { RecurringTaskGenerator } from "../../lib/recurring/RecurringTaskGenerator";
import { dbUTCToDisplayDate } from "../../lib/utils/dateUtils";
import Image from "next/image";
import React from "react";

interface AssociateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAssociateTasks: (taskIds: string[], goalId: string) => void;
  goalId: string;
  existingTaskIds: string[]; // 用于从搜索中排除已关联的任务
  refreshTrigger?: number; // 用于触发搜索结果刷新
}

interface AssociateTaskModalState {
  searchQuery: string;
  searchResults: Todo[];
  selectedTaskIds: string[]; // 用于跟踪选定的任务
  isLoading: boolean;
  isVisible: boolean;
  searchError: string | null;
  lastSearchTime: number;
}

// SearchTodoItem component for displaying individual search results with multi-select
interface SearchTodoItemProps {
  todo: Todo;
  isSelected: boolean; // 新增属性，表示是否被选中
  onToggleSelect: (todoId: string) => void; // 新增属性，处理选择切换
  searchQuery: string;
  index: number;
}

const SearchTodoItem = React.memo(function SearchTodoItem({
  todo,
  isSelected,
  onToggleSelect,
  searchQuery,
  index,
}: SearchTodoItemProps) {
  // 处理选择切换
  const handleToggleSelect = () => {
    onToggleSelect(todo.id);
  };

  // Highlight search terms in text
  const highlightText = (text: string) => {
    if (!searchQuery.trim()) return text;
    return SearchHighlighter.highlight(text, searchQuery, "bg-yellow-200 text-foreground");
  };

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg border border-border bg-background hover:bg-muted/50 transition-colors duration-150 cursor-pointer ${
        todo.completed ? "opacity-75" : ""
      } ${todo.deleted ? "opacity-50" : ""} ${isSelected ? "border-foreground bg-muted/30" : ""}`}
      onClick={handleToggleSelect}
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div
        className={`flex items-start gap-2 flex-1 ${todo.completed ? "opacity-75" : ""}`}
      >
        {/* 复选框 */}
        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 ${
          isSelected ? "bg-foreground border-foreground" : "border-border"
        }`}>
          {isSelected && (
            <span className="text-background text-xs font-bold">✓</span>
          )}
        </div>

        {/* List name badge */}
        {todo.list_name && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground">[{todo.list_name}] </span>
        )}

        {/* Recurring task badge - unified for both original and instances */}
        {RecurringTaskGenerator.isRecurringTask(todo) && (
          <span
            className="inline-flex items-center text-xs"
            title={RecurringTaskGenerator.getTaskRecurrenceDescription(todo)}
          >
            🔄
          </span>
        )}

        {/* Todo title with highlighting */}
        <span
          className={`flex-1 text-sm ${todo.completed ? "opacity-75 line-through" : "text-foreground"}`}
          dangerouslySetInnerHTML={{ __html: highlightText(todo.title) }}
        />

        {/* Next due date for recurring tasks */}
        {RecurringTaskGenerator.isRecurringTask(todo) &&
          todo.next_due_date &&
          !todo.deleted && (
            <span className="text-xs text-muted-foreground" title="下次到期时间">
              下次: {dbUTCToDisplayDate(todo.next_due_date)}
            </span>
          )}

        {/* Due date */}
        {todo.due_date && !todo.deleted && (
          <span className="text-xs text-muted-foreground">
            {dbUTCToDisplayDate(todo.due_date)}
          </span>
        )}
      </div>
    </div>
  );
});

// Memoized search results list for better performance
interface SearchResultsListProps {
  searchResults: Todo[];
  selectedTaskIds: string[];
  onToggleSelect: (todoId: string) => void;
  searchQuery: string;
}

const SearchResultsList = React.memo(function SearchResultsList({
  searchResults,
  selectedTaskIds,
  onToggleSelect,
  searchQuery,
}: SearchResultsListProps) {
  return (
    <>
      {searchResults.map((todo, index) => (
        <SearchTodoItem
          key={todo.id}
          todo={todo}
          isSelected={selectedTaskIds.includes(todo.id)}
          onToggleSelect={onToggleSelect}
          searchQuery={searchQuery}
          index={index}
        />
      ))}
    </>
  );
});

export default function AssociateTaskModal({
  isOpen,
  onClose,
  onAssociateTasks,
  goalId,
  existingTaskIds,
  refreshTrigger,
}: AssociateTaskModalProps) {
  const [state, setState] = useState<AssociateTaskModalState>({
    searchQuery: "",
    searchResults: [],
    selectedTaskIds: [], // 初始化为空数组
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
        selectedTaskIds: [], // 重置选择
        isLoading: false,
        searchError: null,
        lastSearchTime: 0,
      }));

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
          searchError: null,
        }));
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
          limit: 50,
        });

        // 检查请求是否被取消
        if (currentController.signal.aborted) {
          return;
        }

        // 添加到搜索历史
        SearchHistoryManager.addToHistory(query);

        // 过滤掉已关联的任务
        const filteredTodos = searchResult.todos.filter(
          (todo) => !existingTaskIds.includes(todo.id)
        );

        // 更新搜索结果
        setState((prev) => ({
          ...prev,
          searchResults: filteredTodos,
          isLoading: false,
          searchError: null,
          lastSearchTime: Date.now() - startTime,
        }));
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
  }, [debouncedSearchQuery, isOpen]); // 移除 existingTaskIds 依赖以避免不必要的重新搜索

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
          limit: 50,
          forceRefresh: true, // 强制刷新
        });

        // 检查请求是否被取消
        if (currentController.signal.aborted) {
          return;
        }

        // 过滤掉已关联的任务
        const filteredTodos = searchResult.todos.filter(
          (todo) => !existingTaskIds.includes(todo.id)
        );

        // 更新搜索结果
        setState((prev) => ({
          ...prev,
          searchResults: filteredTodos,
          isLoading: false,
          searchError: null,
          lastSearchTime: Date.now() - startTime,
        }));
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
  }, [refreshTrigger, isOpen, state.searchQuery]); // 移除 existingTaskIds 依赖以避免不必要的重新搜索

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

  // 处理任务选择切换
  const handleToggleSelect = (todoId: string) => {
    setState((prev) => {
      const isSelected = prev.selectedTaskIds.includes(todoId);
      let newSelectedTaskIds;
      
      if (isSelected) {
        // 如果已选中，则从数组中移除
        newSelectedTaskIds = prev.selectedTaskIds.filter(id => id !== todoId);
      } else {
        // 如果未选中，则添加到数组中
        newSelectedTaskIds = [...prev.selectedTaskIds, todoId];
      }
      
      return {
        ...prev,
        selectedTaskIds: newSelectedTaskIds
      };
    });
  };

  // 处理确认按钮点击
  const handleConfirmClick = () => {
    if (state.selectedTaskIds.length > 0) {
      onAssociateTasks(state.selectedTaskIds, goalId);
      onClose();
    }
  };

  // Don't render anything if modal is not open
  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="search-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-background border border-border rounded-lg shadow-sm w-full max-w-md mx-4 max-h-[80vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 id="search-modal-title" className="text-lg font-semibold text-foreground">
            关联任务
          </h2>
          <button
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            onClick={handleCloseClick}
            aria-label="关闭搜索"
          >
            ×
          </button>
        </div>

        {/* Search Input */}
        <div className="p-4 border-b border-border">
          <input
            ref={searchInputRef}
            type="text"
            className="w-full px-3 py-2 border border-border rounded-md text-sm bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="搜索任务标题、内容、标签..."
            value={state.searchQuery}
            onChange={handleSearchChange}
            autoComplete="off"
          />
        </div>

        {/* Search Results Container */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* 加载状态 */}
          {state.isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
              <div className="w-5 h-5 border-2 border-border border-t-foreground rounded-full animate-spin"></div>
              <span>搜索中...</span>
            </div>
          )}

          {/* 搜索错误状态 */}
          {!state.isLoading && state.searchError && (
            <div className="text-center py-8">
              <p className="text-destructive text-sm mb-2">{state.searchError}</p>
              <button
                className="px-3 py-1.5 text-sm rounded-md border border-border hover:bg-muted transition-colors"
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
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-1">暂无匹配任务</p>
                <p className="text-xs text-muted-foreground">
                  尝试使用不同的关键词或检查拼写
                </p>
              </div>
            )}

          {/* 空状态 */}
          {!state.isLoading && !state.searchError && !state.searchQuery && (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-1">开始输入以搜索任务</p>
              <p className="text-xs text-muted-foreground">可以搜索任务标题、内容、标签</p>
            </div>
          )}

          {/* 搜索结果 */}
          {!state.isLoading &&
            !state.searchError &&
            state.searchResults.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    找到 {state.searchResults.length} 个匹配任务
                  </span>
                  {state.lastSearchTime > 0 && (
                    <span className="text-xs">
                      ({state.lastSearchTime}ms)
                    </span>
                  )}
                </div>

                <div>
                  <div className="space-y-2">
                    <SearchResultsList
                      searchResults={state.searchResults}
                      selectedTaskIds={state.selectedTaskIds}
                      onToggleSelect={handleToggleSelect}
                      searchQuery={state.searchQuery}
                    />
                  </div>
                </div>
              </div>
            )}
        </div>

        {/* Modal Footer with Confirm Button */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            className="px-4 py-2 rounded-md text-sm font-medium transition-colors bg-foreground text-background hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={handleConfirmClick}
            disabled={state.selectedTaskIds.length === 0}
          >
            确认关联 ({state.selectedTaskIds.length})
          </button>
        </div>
      </div>
    </div>
  );
}