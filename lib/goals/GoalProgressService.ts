import { PGlite } from '@electric-sql/pglite';
import { Goal, Todo } from '@/lib/types';

/**
 * 目标进度信息
 */
export interface GoalProgress {
  goalId: string;
  totalTasks: number;
  completedTasks: number;
  progress: number;
  lastUpdated: Date;
}

/**
 * 批量进度查询结果
 */
export interface BatchProgressResult {
  [goalId: string]: GoalProgress;
}

/**
 * 进度变更事件
 */
export interface ProgressChangeEvent {
  goalId: string;
  oldProgress: GoalProgress | null;
  newProgress: GoalProgress;
  changeType: 'task_added' | 'task_removed' | 'task_completed' | 'task_uncompleted' | 'task_updated';
}

/**
 * 目标进度计算和缓存服务
 */
export class GoalProgressService {
  private progressCache = new Map<string, GoalProgress>();
  private cacheExpiry = new Map<string, number>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存
  private progressChangeListeners: ((event: ProgressChangeEvent) => void)[] = [];

  constructor(private db: PGlite) {}

  /**
   * 计算单个目标的进度
   */
  async calculateGoalProgress(goalId: string, useCache = true): Promise<GoalProgress> {
    // 检查缓存
    if (useCache && this.isCacheValid(goalId)) {
      return this.progressCache.get(goalId)!;
    }

    // 从数据库查询
    const result = await this.db.query(`
      SELECT 
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.completed = true THEN 1 END) as completed_tasks
      FROM todos t
      WHERE t.goal_id = $1 AND t.deleted = false
    `, [goalId]);

    const row = result.rows[0] as any;
    const totalTasks = parseInt(row.total_tasks) || 0;
    const completedTasks = parseInt(row.completed_tasks) || 0;
    const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    const progressInfo: GoalProgress = {
      goalId,
      totalTasks,
      completedTasks,
      progress,
      lastUpdated: new Date()
    };

    // 更新缓存
    this.updateCache(goalId, progressInfo);

    return progressInfo;
  }

  /**
   * 批量计算多个目标的进度
   */
  async batchCalculateProgress(goalIds: string[], useCache = true): Promise<BatchProgressResult> {
    const result: BatchProgressResult = {};
    const uncachedGoalIds: string[] = [];

    // 检查缓存
    if (useCache) {
      for (const goalId of goalIds) {
        if (this.isCacheValid(goalId)) {
          result[goalId] = this.progressCache.get(goalId)!;
        } else {
          uncachedGoalIds.push(goalId);
        }
      }
    } else {
      uncachedGoalIds.push(...goalIds);
    }

    // 批量查询未缓存的目标
    if (uncachedGoalIds.length > 0) {
      const placeholders = uncachedGoalIds.map((_, index) => `$${index + 1}`).join(',');
      const batchResult = await this.db.query(`
        SELECT 
          t.goal_id,
          COUNT(t.id) as total_tasks,
          COUNT(CASE WHEN t.completed = true THEN 1 END) as completed_tasks
        FROM todos t
        WHERE t.goal_id IN (${placeholders}) AND t.deleted = false
        GROUP BY t.goal_id
      `, uncachedGoalIds);

      // 处理查询结果
      const progressMap = new Map<string, { totalTasks: number; completedTasks: number }>();
      batchResult.rows.forEach((row: any) => {
        progressMap.set(row.goal_id, {
          totalTasks: parseInt(row.total_tasks) || 0,
          completedTasks: parseInt(row.completed_tasks) || 0
        });
      });

      // 为每个目标创建进度信息
      for (const goalId of uncachedGoalIds) {
        const data = progressMap.get(goalId) || { totalTasks: 0, completedTasks: 0 };
        const progress = data.totalTasks > 0 ? Math.round((data.completedTasks / data.totalTasks) * 100) : 0;

        const progressInfo: GoalProgress = {
          goalId,
          totalTasks: data.totalTasks,
          completedTasks: data.completedTasks,
          progress,
          lastUpdated: new Date()
        };

        result[goalId] = progressInfo;
        this.updateCache(goalId, progressInfo);
      }
    }

    return result;
  }

  /**
   * 获取所有目标的进度（用于批量更新）
   */
  async getAllGoalsProgress(): Promise<BatchProgressResult> {
    const goalsResult = await this.db.query(`
      SELECT id FROM goals WHERE is_archived = false
    `);

    const goalIds = goalsResult.rows.map((row: any) => row.id);
    return this.batchCalculateProgress(goalIds, false); // 不使用缓存，确保数据最新
  }

  /**
   * 当任务状态发生变化时更新进度
   */
  async onTaskStatusChange(
    goalId: string | null, 
    changeType: ProgressChangeEvent['changeType'],
    oldCompleted?: boolean,
    newCompleted?: boolean
  ): Promise<void> {
    if (!goalId) return;

    const oldProgress = this.progressCache.get(goalId) || null;
    const newProgress = await this.calculateGoalProgress(goalId, false); // 强制重新计算

    // 触发进度变更事件
    const event: ProgressChangeEvent = {
      goalId,
      oldProgress,
      newProgress,
      changeType
    };

    this.notifyProgressChange(event);
  }

  /**
   * 当任务被添加到目标时
   */
  async onTaskAddedToGoal(goalId: string): Promise<void> {
    await this.onTaskStatusChange(goalId, 'task_added');
  }

  /**
   * 当任务从目标中移除时
   */
  async onTaskRemovedFromGoal(goalId: string): Promise<void> {
    await this.onTaskStatusChange(goalId, 'task_removed');
  }

  /**
   * 当任务完成状态改变时
   */
  async onTaskCompletionChange(goalId: string | null, oldCompleted: boolean, newCompleted: boolean): Promise<void> {
    if (!goalId) return;

    const changeType = newCompleted ? 'task_completed' : 'task_uncompleted';
    await this.onTaskStatusChange(goalId, changeType, oldCompleted, newCompleted);
  }

  /**
   * 批量更新目标表中的进度字段
   * @deprecated 进度字段应该动态计算，不需要存储到数据库
   */
  async syncProgressToDatabase(goalIds?: string[]): Promise<void> {
    // 移除数据库写操作，进度字段应该动态计算
    console.warn('syncProgressToDatabase 已废弃：进度字段应该动态计算，不需要存储到数据库');
  }

  /**
   * 清除指定目标的缓存
   */
  clearCache(goalId?: string): void {
    if (goalId) {
      this.progressCache.delete(goalId);
      this.cacheExpiry.delete(goalId);
    } else {
      this.progressCache.clear();
      this.cacheExpiry.clear();
    }
  }

  /**
   * 清理过期缓存
   */
  cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [goalId, expiry] of this.cacheExpiry.entries()) {
      if (now > expiry) {
        this.progressCache.delete(goalId);
        this.cacheExpiry.delete(goalId);
      }
    }
  }

  /**
   * 获取缓存统计信息
   */
  getCacheStats(): {
    totalCached: number;
    validCached: number;
    expiredCached: number;
  } {
    const now = Date.now();
    let validCached = 0;
    let expiredCached = 0;

    for (const [goalId, expiry] of this.cacheExpiry.entries()) {
      if (now <= expiry) {
        validCached++;
      } else {
        expiredCached++;
      }
    }

    return {
      totalCached: this.progressCache.size,
      validCached,
      expiredCached
    };
  }

  /**
   * 添加进度变更监听器
   */
  addProgressChangeListener(listener: (event: ProgressChangeEvent) => void): void {
    this.progressChangeListeners.push(listener);
  }

  /**
   * 移除进度变更监听器
   */
  removeProgressChangeListener(listener: (event: ProgressChangeEvent) => void): void {
    const index = this.progressChangeListeners.indexOf(listener);
    if (index > -1) {
      this.progressChangeListeners.splice(index, 1);
    }
  }

  /**
   * 预热缓存 - 预加载常用目标的进度
   */
  async warmupCache(goalIds: string[]): Promise<void> {
    await this.batchCalculateProgress(goalIds, false);
  }

  /**
   * 检查缓存是否有效
   */
  private isCacheValid(goalId: string): boolean {
    const expiry = this.cacheExpiry.get(goalId);
    if (!expiry) return false;
    
    const isValid = Date.now() <= expiry;
    if (!isValid) {
      // 清理过期缓存
      this.progressCache.delete(goalId);
      this.cacheExpiry.delete(goalId);
    }
    
    return isValid;
  }

  /**
   * 更新缓存
   */
  private updateCache(goalId: string, progress: GoalProgress): void {
    this.progressCache.set(goalId, progress);
    this.cacheExpiry.set(goalId, Date.now() + this.CACHE_TTL);
  }

  /**
   * 通知进度变更
   */
  private notifyProgressChange(event: ProgressChangeEvent): void {
    this.progressChangeListeners.forEach(listener => {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in progress change listener:', error);
      }
    });
  }
}

/**
 * 创建目标进度服务实例
 */
export function createGoalProgressService(db: PGlite): GoalProgressService {
  return new GoalProgressService(db);
}