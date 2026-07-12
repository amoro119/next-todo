// lib/recurring/RecurringTaskIntegration.ts
import { Todo } from '../types';
import { RecurringTaskGenerator } from './RecurringTaskGenerator';
import { taskCompletionHandler } from './TaskCompletionHandler';
import { performanceMonitor, measureAsync } from '../performance/performanceMonitor';

interface RecurringDatabaseAPI {
  insert(table: string, record: unknown): Promise<unknown>;
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  transaction(queries: Array<{ sql: string; params?: unknown[] }>): Promise<void>;
}

/**
 * 重复任务集成模块
 * 提供与现有系统集成的接口，包含防重复处理机制和性能监控
 */
export class RecurringTaskIntegration {
  private static isInitialized = false;
  
  // 防重复处理机制：跟踪正在处理的任务
  private static processingTasks = new Set<string>();
  
  // 性能统计
  private static performanceStats = {
    totalProcessed: 0,
    successCount: 0,
    errorCount: 0,
    duplicateSkipped: 0,
    averageProcessingTime: 0,
  };

  /**
   * 初始化重复任务系统
   * @param databaseAPI 数据库API实例
   */
  static initialize(databaseAPI: RecurringDatabaseAPI): void {
    if (this.isInitialized) {
      return;
    }

    // 注册任务完成处理回调
    taskCompletionHandler.onTaskCompletion(async (result) => {
      if (result.shouldGenerateNext && result.newInstance) {
        try {
          // 生成新的重复任务
          const newTaskId = this.generateUUID();
          const newTask = { ...result.newInstance, id: newTaskId };
          
          await databaseAPI.insert('todos', newTask);
          console.log('Generated new recurring task:', newTask.title);
        } catch (error) {
          console.error('Error generating recurring task:', error);
        }
      }
    });

    this.isInitialized = true;
    console.log('Recurring task system initialized');
  }

  /**
   * 处理任务更新，检查是否有任务完成
   * 包含防重复处理机制和详细的日志记录
   * @param taskId 任务ID
   * @param updates 更新数据
   * @param databaseAPI 数据库API实例
   */
  static async handleTaskUpdate(
    taskId: string,
    updates: Partial<Todo>,
    databaseAPI: RecurringDatabaseAPI
  ): Promise<void> {
    // 防重复处理检测
    if (this.processingTasks.has(taskId)) {
      this.performanceStats.duplicateSkipped++;
      this.logInfo(`Task ${taskId} is already being processed, skipping duplicate call`, {
        taskId,
        currentProcessingCount: this.processingTasks.size,
      });
      return;
    }

    // 只处理完成操作
    if (updates.completed !== true) {
      return;
    }

    // 添加到处理集合
    this.processingTasks.add(taskId);
    this.performanceStats.totalProcessed++;

    try {
      await measureAsync(
        'RecurringTaskIntegration.handleTaskUpdate',
        async () => {
          this.logInfo(`Starting recurring task processing for task ${taskId}`, {
            taskId,
            updates,
            processingQueueSize: this.processingTasks.size,
          });

          // 获取完成的任务
          const taskResult = await databaseAPI.query(
            'SELECT * FROM todos WHERE id = $1',
            [taskId]
          );
          
          if (taskResult.rows.length === 0) {
            this.logWarning(`Task ${taskId} not found in database`, { taskId });
            return;
          }

          const completedTask = { ...(taskResult.rows[0] as Record<string, unknown>), ...updates } as Todo;

          // 检查是否为重复任务
          if (!RecurringTaskGenerator.isRecurringTask(completedTask)) {
            this.logInfo(`Task ${taskId} is not a recurring task, skipping`, {
              taskId,
              title: completedTask.title,
              isRecurring: completedTask.is_recurring,
              repeat: completedTask.repeat,
            });
            return;
          }

          this.logInfo(`Processing recurring task completion: ${completedTask.title}`, {
            taskId,
            title: completedTask.title,
            dueDate: completedTask.due_date,
            repeat: completedTask.repeat,
            instanceNumber: completedTask.instance_number,
          });
          
          // 使用原任务的到期日期作为基准，而不是当前时间
          const originalDueDate = new Date(completedTask.due_date || completedTask.created_time);
          
          const result = RecurringTaskGenerator.handleRecurringTaskCompletion(
            completedTask,
            originalDueDate  // 传入原到期日期作为基准
          );

          if (result.shouldGenerateNext && result.newRecurringTask) {
            // 生成新的重复任务
            const newTaskId = this.generateUUID();
            const newTask = { ...result.newRecurringTask, id: newTaskId };
            
            await databaseAPI.insert('todos', newTask);
            
            this.performanceStats.successCount++;
            this.logInfo(`Successfully generated new recurring task`, {
              originalTaskId: taskId,
              originalTitle: completedTask.title,
              newTaskId,
              newTitle: newTask.title,
              newDueDate: newTask.due_date,
              instanceNumber: newTask.instance_number,
            });
          } else {
            this.logInfo(`No new recurring task generated`, {
              taskId,
              title: completedTask.title,
              reason: result.shouldGenerateNext ? 'No new task created' : 'Recurrence ended',
              repeat: completedTask.repeat,
            });
          }
        },
        { taskId }
      );
    } catch (error) {
      this.performanceStats.errorCount++;
      this.logError('Error handling recurring task completion', error as Error, {
        taskId,
        updates,
        processingQueueSize: this.processingTasks.size,
      });
      
      // 不抛出错误，避免影响原任务完成
    } finally {
      // 清理处理状态
      this.processingTasks.delete(taskId);
      
      this.logInfo(`Finished processing task ${taskId}`, {
        taskId,
        remainingProcessingCount: this.processingTasks.size,
        totalProcessed: this.performanceStats.totalProcessed,
        successRate: (this.performanceStats.successCount / this.performanceStats.totalProcessed * 100).toFixed(2) + '%',
      });
    }
  }

  /**
   * 批量处理任务更新
   * 包含防重复处理机制和性能监控
   * @param taskUpdates 任务更新数组
   * @param databaseAPI 数据库API实例
   */
  static async batchHandleTaskUpdates(
    taskUpdates: Array<{ id: string; updates: Partial<Todo> }>,
    databaseAPI: RecurringDatabaseAPI
  ): Promise<void> {
    const completionUpdates = taskUpdates.filter(update => update.updates.completed === true);
    
    if (completionUpdates.length === 0) {
      this.logInfo('No completion updates in batch, skipping');
      return;
    }

    // 过滤掉正在处理的任务
    const filteredUpdates = completionUpdates.filter(update => {
      if (this.processingTasks.has(update.id)) {
        this.performanceStats.duplicateSkipped++;
        this.logInfo(`Skipping task ${update.id} in batch - already processing`);
        return false;
      }
      return true;
    });

    if (filteredUpdates.length === 0) {
      this.logInfo('All tasks in batch are already being processed, skipping');
      return;
    }

    this.logInfo(`Starting batch processing of ${filteredUpdates.length} tasks`, {
      totalUpdates: taskUpdates.length,
      completionUpdates: completionUpdates.length,
      filteredUpdates: filteredUpdates.length,
    });

    // 将所有任务添加到处理集合
    filteredUpdates.forEach(update => {
      this.processingTasks.add(update.id);
      this.performanceStats.totalProcessed++;
    });

    try {
      await measureAsync(
        'RecurringTaskIntegration.batchHandleTaskUpdates',
        async () => {
          // 获取所有完成的任务
          const taskIds = filteredUpdates.map(update => update.id);
          const tasksResult = await databaseAPI.query(
            `SELECT * FROM todos WHERE id = ANY($1)`,
            [taskIds]
          );

          const completedTasks = tasksResult.rows.map((row) => {
            const task = row as Todo;
            const update = filteredUpdates.find(u => u.id === task.id);
            return { ...task, ...update?.updates } as Todo;
          });

          // 过滤出重复任务
          const recurringTasks = completedTasks.filter(task => 
            RecurringTaskGenerator.isRecurringTask(task)
          );

          this.logInfo(`Found ${recurringTasks.length} recurring tasks in batch`, {
            totalTasks: completedTasks.length,
            recurringTasks: recurringTasks.length,
          });

          if (recurringTasks.length === 0) {
            return;
          }

          // 批量处理重复任务
          const newTasks: Todo[] = [];
          let batchSuccessCount = 0;
          let batchErrorCount = 0;

          for (const task of recurringTasks) {
            try {
              const originalDueDate = new Date(task.due_date || task.created_time);
              const result = RecurringTaskGenerator.handleRecurringTaskCompletion(
                task,
                originalDueDate
              );

              if (result.shouldGenerateNext && result.newRecurringTask) {
                const newTaskId = this.generateUUID();
                const newTask = { ...result.newRecurringTask, id: newTaskId };
                newTasks.push(newTask);
                batchSuccessCount++;

                this.logInfo(`Prepared new recurring task in batch`, {
                  originalTaskId: task.id,
                  originalTitle: task.title,
                  newTaskId,
                  newDueDate: newTask.due_date,
                });
              }
            } catch (error) {
              batchErrorCount++;
              this.logError(`Error processing recurring task in batch: ${task.title}`, error as Error, {
                taskId: task.id,
              });
            }
          }

          // 批量插入新任务
          if (newTasks.length > 0) {
            try {
              // 使用事务批量插入
              await databaseAPI.transaction(
                newTasks.map(task => ({
                  sql: 'INSERT INTO todos (id, title, notes, completed, due_date, created_time, list_name, repeat, is_recurring, instance_number, next_due_date) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
                  params: [
                    task.id,
                    task.title,
                    task.notes,
                    task.completed,
                    task.due_date,
                    task.created_time,
                    task.list_name,
                    task.repeat,
                    task.is_recurring,
                    task.instance_number,
                    task.next_due_date,
                  ],
                }))
              );

              this.performanceStats.successCount += batchSuccessCount;
              this.logInfo(`Successfully created ${newTasks.length} new recurring tasks in batch`);
            } catch (error) {
              this.performanceStats.errorCount += newTasks.length;
              this.logError('Error batch inserting new recurring tasks', error as Error, {
                taskCount: newTasks.length,
              });
            }
          }

          this.performanceStats.errorCount += batchErrorCount;
        },
        { batchSize: filteredUpdates.length }
      );
    } catch (error) {
      this.performanceStats.errorCount += filteredUpdates.length;
      this.logError('Error in batch handling task completions', error as Error, {
        batchSize: filteredUpdates.length,
      });
    } finally {
      // 清理处理状态
      filteredUpdates.forEach(update => {
        this.processingTasks.delete(update.id);
      });

      this.logInfo(`Finished batch processing`, {
        processedCount: filteredUpdates.length,
        remainingProcessingCount: this.processingTasks.size,
        totalProcessed: this.performanceStats.totalProcessed,
      });
    }
  }

  /**
   * 获取所有原始重复任务
   * @param databaseAPI 数据库API实例
   * @returns 原始重复任务映射
   */
  private static async getOriginalRecurringTasks(databaseAPI: RecurringDatabaseAPI): Promise<Map<string, Todo>> {
    try {
      const result = await databaseAPI.query(
        'SELECT * FROM todos WHERE is_recurring = true AND recurring_parent_id IS NULL'
      );

      const originalTasks = new Map<string, Todo>();
      result.rows.forEach((row) => {
        const task = row as Todo;
        originalTasks.set(task.id, task);
      });

      return originalTasks;
    } catch (error) {
      console.error('Error fetching original recurring tasks:', error);
      return new Map();
    }
  }

  /**
   * 生成UUID（简化版本，实际应用中应使用更robust的实现）
   */
  private static generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 记录信息日志
   */
  private static logInfo(message: string, context?: unknown): void {
    const timestamp = new Date().toISOString();
    console.log(`[RecurringTask] ${timestamp} INFO: ${message}`, context || '');
  }

  /**
   * 记录警告日志
   */
  private static logWarning(message: string, context?: unknown): void {
    const timestamp = new Date().toISOString();
    console.warn(`[RecurringTask] ${timestamp} WARN: ${message}`, context || '');
  }

  /**
   * 记录错误日志
   */
  private static logError(message: string, error: Error, context?: unknown): void {
    const timestamp = new Date().toISOString();
    console.error(`[RecurringTask] ${timestamp} ERROR: ${message}`, {
      error: error.message,
      stack: error.stack,
      context: context || {},
    });
  }

  /**
   * 获取性能统计信息
   */
  static getPerformanceStats(): typeof RecurringTaskIntegration.performanceStats & {
    currentProcessingCount: number;
    performanceReport: string;
  } {
    const stats = { ...this.performanceStats };
    
    // 计算平均处理时间
    const recurringTaskStats = performanceMonitor.getStats('RecurringTaskIntegration.handleTaskUpdate');
    stats.averageProcessingTime = recurringTaskStats.averageTime;

    return {
      ...stats,
      currentProcessingCount: this.processingTasks.size,
      performanceReport: this.generatePerformanceReport(),
    };
  }

  /**
   * 生成性能报告
   */
  private static generatePerformanceReport(): string {
    const stats = this.performanceStats;
    const processingStats = performanceMonitor.getStats('RecurringTaskIntegration.handleTaskUpdate');
    
    return [
      '📊 周期任务处理性能报告',
      '='.repeat(40),
      `总处理次数: ${stats.totalProcessed}`,
      `成功次数: ${stats.successCount}`,
      `错误次数: ${stats.errorCount}`,
      `重复跳过: ${stats.duplicateSkipped}`,
      `成功率: ${stats.totalProcessed > 0 ? (stats.successCount / stats.totalProcessed * 100).toFixed(2) : 0}%`,
      `当前处理中: ${this.processingTasks.size}`,
      `平均处理时间: ${processingStats.averageTime.toFixed(2)}ms`,
      `最长处理时间: ${processingStats.maxTime.toFixed(2)}ms`,
      `最短处理时间: ${processingStats.minTime.toFixed(2)}ms`,
      '',
    ].join('\n');
  }

  /**
   * 重置性能统计
   */
  static resetPerformanceStats(): void {
    this.performanceStats = {
      totalProcessed: 0,
      successCount: 0,
      errorCount: 0,
      duplicateSkipped: 0,
      averageProcessingTime: 0,
    };
    
    // 清空处理队列
    this.processingTasks.clear();
    
    // 重置初始化状态（用于测试）
    if (process.env.NODE_ENV === 'test') {
      this.isInitialized = false;
    }
    
    this.logInfo('Performance statistics reset');
  }

  /**
   * 检查系统健康状态
   */
  static getHealthStatus(): {
    isHealthy: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];
    
    // 检查处理队列是否过长
    if (this.processingTasks.size > 10) {
      issues.push(`处理队列过长: ${this.processingTasks.size} 个任务正在处理`);
      recommendations.push('检查是否存在死锁或处理时间过长的任务');
    }
    
    // 检查错误率
    const errorRate = this.performanceStats.totalProcessed > 0 
      ? this.performanceStats.errorCount / this.performanceStats.totalProcessed 
      : 0;
    
    if (errorRate > 0.1) { // 错误率超过10%
      issues.push(`错误率过高: ${(errorRate * 100).toFixed(2)}%`);
      recommendations.push('检查数据库连接和任务数据完整性');
    }
    
    // 检查性能
    const avgTime = performanceMonitor.getStats('RecurringTaskIntegration.handleTaskUpdate').averageTime;
    if (avgTime > 1000) { // 平均处理时间超过1秒
      issues.push(`处理时间过长: 平均 ${avgTime.toFixed(2)}ms`);
      recommendations.push('优化数据库查询和任务处理逻辑');
    }
    
    return {
      isHealthy: issues.length === 0,
      issues,
      recommendations,
    };
  }

  /**
   * 获取任务的重复描述
   * @param task 任务
   * @returns 重复描述
   */
  static getTaskRecurrenceDescription(task: Todo): string {
    return RecurringTaskGenerator.getTaskRecurrenceDescription(task);
  }

  /**
   * 验证重复任务配置
   * @param task 任务
   * @returns 验证结果
   */
  static validateRecurringTask(task: Partial<Todo>): {
    isValid: boolean;
    errors: string[];
  } {
    return RecurringTaskGenerator.validateRecurringTask(task);
  }

  /**
   * 生成重复任务预览
   * @param task 任务
   * @param count 预览数量
   * @returns 预览日期数组
   */
  static generatePreviewInstances(task: Todo, count: number = 5): Date[] {
    return RecurringTaskGenerator.generatePreviewInstances(task, count);
  }

  /**
   * 停止重复任务
   * @param task 要停止的任务
   * @returns 更新数据
   */
  static stopRecurrence(task: Todo): Partial<Todo> {
    return RecurringTaskGenerator.stopRecurrence(task);
  }
}
