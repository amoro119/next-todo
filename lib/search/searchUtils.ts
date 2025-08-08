// lib/search/searchUtils.ts
import type { Todo } from '../types';

/**
 * 搜索查询构建器
 */
export class SearchQueryBuilder {
  private query: string = '';
  private filters: string[] = [];

  constructor(initialQuery?: string) {
    if (initialQuery) {
      this.query = initialQuery.trim();
    }
  }

  /**
   * 设置基础查询字符串
   * @param query 查询字符串
   * @returns SearchQueryBuilder实例
   */
  setQuery(query: string): SearchQueryBuilder {
    this.query = query.trim();
    return this;
  }

  /**
   * 添加标签过滤器
   * @param tag 标签名
   * @returns SearchQueryBuilder实例
   */
  addTagFilter(tag: string): SearchQueryBuilder {
    if (tag.trim()) {
      this.filters.push(`tag:${tag.trim()}`);
    }
    return this;
  }

  /**
   * 添加列表过滤器
   * @param listName 列表名
   * @returns SearchQueryBuilder实例
   */
  addListFilter(listName: string): SearchQueryBuilder {
    if (listName.trim()) {
      this.filters.push(`list:${listName.trim()}`);
    }
    return this;
  }

  /**
   * 添加优先级过滤器
   * @param priority 优先级
   * @returns SearchQueryBuilder实例
   */
  addPriorityFilter(priority: number): SearchQueryBuilder {
    this.filters.push(`priority:${priority}`);
    return this;
  }

  /**
   * 添加完成状态过滤器
   * @param completed 是否完成
   * @returns SearchQueryBuilder实例
   */
  addCompletedFilter(completed: boolean): SearchQueryBuilder {
    this.filters.push(`completed:${completed}`);
    return this;
  }

  /**
   * 构建最终查询字符串
   * @returns 构建的查询字符串
   */
  build(): string {
    const parts = [this.query, ...this.filters].filter(Boolean);
    return parts.join(' ');
  }

  /**
   * 清空所有过滤器
   * @returns SearchQueryBuilder实例
   */
  clearFilters(): SearchQueryBuilder {
    this.filters = [];
    return this;
  }

  /**
   * 重置查询构建器
   * @returns SearchQueryBuilder实例
   */
  reset(): SearchQueryBuilder {
    this.query = '';
    this.filters = [];
    return this;
  }
}

/**
 * 搜索结果过滤器
 */
export class SearchResultFilter {
  /**
   * 按优先级过滤
   * @param todos 任务列表
   * @param minPriority 最小优先级
   * @param maxPriority 最大优先级
   * @returns 过滤后的任务列表
   */
  static filterByPriority(todos: Todo[], minPriority?: number, maxPriority?: number): Todo[] {
    return todos.filter(todo => {
      if (minPriority !== undefined && todo.priority < minPriority) return false;
      if (maxPriority !== undefined && todo.priority > maxPriority) return false;
      return true;
    });
  }

  /**
   * 按标签过滤
   * @param todos 任务列表
   * @param tags 标签列表
   * @param matchAll 是否需要匹配所有标签
   * @returns 过滤后的任务列表
   */
  static filterByTags(todos: Todo[], tags: string[], matchAll: boolean = false): Todo[] {
    if (tags.length === 0) return todos;

    return todos.filter(todo => {
      if (!todo.tags) return false;
      
      const todoTags = todo.tags.split(',').map(tag => tag.trim().toLowerCase());
      const searchTags = tags.map(tag => tag.trim().toLowerCase());

      if (matchAll) {
        return searchTags.every(tag => todoTags.includes(tag));
      } else {
        return searchTags.some(tag => todoTags.includes(tag));
      }
    });
  }

  /**
   * 按列表过滤
   * @param todos 任务列表
   * @param listNames 列表名称列表
   * @returns 过滤后的任务列表
   */
  static filterByLists(todos: Todo[], listNames: string[]): Todo[] {
    if (listNames.length === 0) return todos;

    const normalizedListNames = listNames.map(name => name.toLowerCase());
    return todos.filter(todo => {
      if (!todo.list_name) return false;
      return normalizedListNames.includes(todo.list_name.toLowerCase());
    });
  }

  /**
   * 按日期范围过滤
   * @param todos 任务列表
   * @param startDate 开始日期
   * @param endDate 结束日期
   * @param dateField 日期字段名
   * @returns 过滤后的任务列表
   */
  static filterByDateRange(
    todos: Todo[], 
    startDate?: string, 
    endDate?: string, 
    dateField: 'due_date' | 'start_date' | 'created_time' | 'completed_time' = 'due_date'
  ): Todo[] {
    return todos.filter(todo => {
      const dateValue = todo[dateField];
      if (!dateValue) return false;

      const todoDate = new Date(dateValue);
      if (isNaN(todoDate.getTime())) return false;

      if (startDate) {
        const start = new Date(startDate);
        if (todoDate < start) return false;
      }

      if (endDate) {
        const end = new Date(endDate);
        if (todoDate > end) return false;
      }

      return true;
    });
  }

  /**
   * 按完成状态过滤
   * @param todos 任务列表
   * @param completed 完成状态
   * @returns 过滤后的任务列表
   */
  static filterByCompleted(todos: Todo[], completed: boolean): Todo[] {
    return todos.filter(todo => todo.completed === completed);
  }

  /**
   * 按删除状态过滤
   * @param todos 任务列表
   * @param deleted 删除状态
   * @returns 过滤后的任务列表
   */
  static filterByDeleted(todos: Todo[], deleted: boolean): Todo[] {
    return todos.filter(todo => todo.deleted === deleted);
  }
}

/**
 * 搜索结果排序器
 */
export class SearchResultSorter {
  /**
   * 按相关性排序
   * @param todos 任务列表
   * @param query 搜索查询
   * @returns 排序后的任务列表
   */
  static sortByRelevance(todos: Todo[], query: string): Todo[] {
    if (!query.trim()) return todos;

    const searchTerm = query.toLowerCase();
    
    return [...todos].sort((a, b) => {
      const aScore = this.calculateRelevanceScore(a, searchTerm);
      const bScore = this.calculateRelevanceScore(b, searchTerm);
      
      // 相关性分数高的排在前面
      if (aScore !== bScore) {
        return bScore - aScore;
      }
      
      // 相关性相同时，按创建时间倒序
      const aTime = new Date(a.created_time || 0).getTime();
      const bTime = new Date(b.created_time || 0).getTime();
      return bTime - aTime;
    });
  }

  /**
   * 按优先级排序
   * @param todos 任务列表
   * @param ascending 是否升序
   * @returns 排序后的任务列表
   */
  static sortByPriority(todos: Todo[], ascending: boolean = false): Todo[] {
    return [...todos].sort((a, b) => {
      const diff = a.priority - b.priority;
      return ascending ? diff : -diff;
    });
  }

  /**
   * 按到期日期排序
   * @param todos 任务列表
   * @param ascending 是否升序
   * @returns 排序后的任务列表
   */
  static sortByDueDate(todos: Todo[], ascending: boolean = true): Todo[] {
    return [...todos].sort((a, b) => {
      const aDate = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const bDate = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      
      const diff = aDate - bDate;
      return ascending ? diff : -diff;
    });
  }

  /**
   * 按创建时间排序
   * @param todos 任务列表
   * @param ascending 是否升序
   * @returns 排序后的任务列表
   */
  static sortByCreatedTime(todos: Todo[], ascending: boolean = false): Todo[] {
    return [...todos].sort((a, b) => {
      const aTime = new Date(a.created_time || 0).getTime();
      const bTime = new Date(b.created_time || 0).getTime();
      
      const diff = aTime - bTime;
      return ascending ? diff : -diff;
    });
  }

  /**
   * 计算相关性分数
   * @param todo 任务对象
   * @param searchTerm 搜索词
   * @returns 相关性分数
   */
  private static calculateRelevanceScore(todo: Todo, searchTerm: string): number {
    let score = 0;
    
    // 标题匹配权重最高
    if (todo.title.toLowerCase().includes(searchTerm)) {
      score += 10;
      // 完全匹配额外加分
      if (todo.title.toLowerCase() === searchTerm) {
        score += 20;
      }
      // 开头匹配额外加分
      if (todo.title.toLowerCase().startsWith(searchTerm)) {
        score += 5;
      }
    }
    
    // 内容匹配
    if (todo.content && todo.content.toLowerCase().includes(searchTerm)) {
      score += 5;
    }
    
    // 标签匹配
    if (todo.tags && todo.tags.toLowerCase().includes(searchTerm)) {
      score += 3;
    }
    
    // ID匹配（精确匹配）
    if (todo.id.toLowerCase() === searchTerm) {
      score += 15;
    }
    
    return score;
  }
}

/**
 * 搜索高亮工具
 */
export class SearchHighlighter {
  /**
   * 高亮搜索词
   * @param text 原始文本
   * @param searchTerm 搜索词
   * @param className 高亮CSS类名
   * @returns 高亮后的HTML字符串
   */
  static highlight(text: string, searchTerm: string, className: string = 'search-highlight'): string {
    if (!searchTerm.trim() || !text) return text;
    
    // 转义特殊正则字符
    const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escapedTerm})`, 'gi');
    
    return text.replace(regex, `<span class="${className}">$1</span>`);
  }

  /**
   * 移除HTML标签，返回纯文本
   * @param html HTML字符串
   * @returns 纯文本
   */
  static stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  }
}

/**
 * 搜索历史管理器
 */
export class SearchHistoryManager {
  private static readonly STORAGE_KEY = 'task_search_history';
  private static readonly MAX_HISTORY_SIZE = 20;

  /**
   * 添加搜索历史
   * @param query 搜索查询
   */
  static addToHistory(query: string): void {
    if (!query.trim()) return;

    const history = this.getHistory();
    const normalizedQuery = query.trim();
    
    // 移除重复项
    const filteredHistory = history.filter(item => item !== normalizedQuery);
    
    // 添加到开头
    filteredHistory.unshift(normalizedQuery);
    
    // 限制历史记录数量
    const limitedHistory = filteredHistory.slice(0, this.MAX_HISTORY_SIZE);
    
    // 保存到本地存储
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(limitedHistory));
    } catch (error) {
      console.warn('Failed to save search history:', error);
    }
  }

  /**
   * 获取搜索历史
   * @returns 搜索历史列表
   */
  static getHistory(): string[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.warn('Failed to load search history:', error);
      return [];
    }
  }

  /**
   * 清空搜索历史
   */
  static clearHistory(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear search history:', error);
    }
  }

  /**
   * 从历史中移除指定项
   * @param query 要移除的查询
   */
  static removeFromHistory(query: string): void {
    const history = this.getHistory();
    const filteredHistory = history.filter(item => item !== query.trim());
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filteredHistory));
    } catch (error) {
      console.warn('Failed to update search history:', error);
    }
  }
}