// lib/search/searchService.ts
import type { Todo } from '../types';
import { db } from '../db/dexie';

export interface SearchOptions {
  fields: ('title' | 'content' | 'tags')[];
  includeCompleted: boolean;
  includeDeleted: boolean;
  limit?: number;
  offset?: number;
  forceRefresh?: boolean;
}

export interface SearchResult {
  todos: Todo[];
  query: string;
  executionTime: number;
  totalMatches: number;
}

export function searchTodos(query: string, options?: Partial<SearchOptions>): Promise<SearchResult> {
  return TaskSearchService.getInstance().searchTodos(query, options);
}

export class TaskSearchService {
  private static instance: TaskSearchService;
  private searchCache = new Map<string, { result: SearchResult; timestamp: number }>();
  private readonly CACHE_DURATION = 5 * 60 * 1000;
  private readonly DEFAULT_LIMIT = 100;
  private readonly MAX_CACHE_SIZE = 100;
  private searchAbortController: AbortController | null = null;

  private constructor() {}

  static getInstance(): TaskSearchService {
    if (!TaskSearchService.instance) {
      TaskSearchService.instance = new TaskSearchService();
    }
    return TaskSearchService.instance;
  }

  async searchTodos(query: string, options?: Partial<SearchOptions>): Promise<SearchResult> {
    const startTime = Date.now();

    if (!query.trim()) {
      return {
        todos: [],
        query: query.trim(),
        executionTime: Date.now() - startTime,
        totalMatches: 0,
      };
    }

    if (this.searchAbortController) {
      this.searchAbortController.abort();
    }
    this.searchAbortController = new AbortController();

    const cacheKey = this.generateCacheKey(query, options);
    const cachedEntry = this.searchCache.get(cacheKey);
    if (!options?.forceRefresh && cachedEntry && Date.now() - cachedEntry.timestamp < this.CACHE_DURATION) {
      return {
        ...cachedEntry.result,
        executionTime: Date.now() - startTime,
      };
    }

    try {
      const searchOptions = this.normalizeSearchOptions(options);
      const searchTerm = query.trim().toLowerCase();

      if (this.searchAbortController?.signal.aborted) {
        throw new Error('Search cancelled');
      }

      // Fetch all todos and lists from Dexie
      const [allTodos, allLists] = await Promise.all([
        db.todos.toArray(),
        db.lists.toArray(),
      ]);

      // Filter in JavaScript (Dexie doesn't have full-text ILIKE across fields)
      let filtered = allTodos.filter((todo) => {
        if (!searchOptions.includeCompleted && todo.completed) return false;
        if (!searchOptions.includeDeleted && todo.deleted) return false;

        const matchTitle = searchOptions.fields.includes('title') && todo.title?.toLowerCase().includes(searchTerm);
        const matchContent = searchOptions.fields.includes('content') && todo.content?.toLowerCase().includes(searchTerm);
        const matchTags = searchOptions.fields.includes('tags') && todo.tags?.toLowerCase().includes(searchTerm);

        return matchTitle || matchContent || matchTags;
      });

      // Sort by relevance then by due_date, completed, priority
      const listMap = new Map(allLists.map((l) => [l.id, l.name]));

      filtered.sort((a, b) => {
        // Relevance: title match > content match > tags match
        const aTitle = a.title?.toLowerCase().includes(searchTerm) ? 1 : 0;
        const bTitle = b.title?.toLowerCase().includes(searchTerm) ? 1 : 0;
        if (aTitle !== bTitle) return aTitle - bTitle;

        const aContent = a.content?.toLowerCase().includes(searchTerm) ? 1 : 0;
        const bContent = b.content?.toLowerCase().includes(searchTerm) ? 1 : 0;
        if (aContent !== bContent) return aContent - bContent;

        // Due date (nulls last)
        if (a.due_date && b.due_date) {
          if (a.due_date !== b.due_date) return a.due_date > b.due_date ? -1 : 1;
        } else if (a.due_date) {
          return -1;
        } else if (b.due_date) {
          return 1;
        }

        // Completed (false first)
        if (a.completed !== b.completed) return a.completed ? 1 : -1;

        // Priority (high first)
        if (a.priority !== b.priority) return b.priority - a.priority;

        // Created time (newest first)
        if (a.created_time && b.created_time) {
          return a.created_time > b.created_time ? -1 : 1;
        }

        return 0;
      });

      const totalMatches = filtered.length;
      const offset = searchOptions.offset || 0;
      const limit = searchOptions.limit || this.DEFAULT_LIMIT;
      const paginated = filtered.slice(offset, offset + limit);

      // Normalize todos with list_name
      const todos = paginated.map((todo) => ({
        ...todo,
        list_name: listMap.get(todo.list_id || '') ?? null,
      }));

      const searchResult: SearchResult = {
        todos,
        query: query.trim(),
        executionTime: Date.now() - startTime,
        totalMatches,
      };

      this.searchCache.set(cacheKey, {
        result: searchResult,
        timestamp: Date.now(),
      });
      this.cleanupCache();

      return searchResult;
    } catch (error) {
      console.error('Search failed:', error);
      return {
        todos: [],
        query: query.trim(),
        executionTime: Date.now() - startTime,
        totalMatches: 0,
      };
    }
  }

  private normalizeSearchOptions(options?: Partial<SearchOptions>): SearchOptions {
    return {
      fields: options?.fields || ['title', 'content'],
      includeCompleted: options?.includeCompleted ?? true,
      includeDeleted: options?.includeDeleted ?? false,
      limit: options?.limit || this.DEFAULT_LIMIT,
      offset: options?.offset || 0,
      forceRefresh: options?.forceRefresh || false,
    };
  }

  private generateCacheKey(query: string, options?: Partial<SearchOptions>): string {
    return `${query.trim()}:${JSON.stringify(options)}`;
  }

  private cleanupCache(): void {
    if (this.searchCache.size > this.MAX_CACHE_SIZE) {
      const oldestKey = this.searchCache.keys().next().value;
      if (oldestKey) {
        this.searchCache.delete(oldestKey);
      }
    }
  }
}
