// lib/recurring/RecurringTaskIntegration.ts
import { Todo } from '../types';
import { RecurringTaskGenerator } from './RecurringTaskGenerator';
import { TaskCompletionHandler, taskCompletionHandler } from './TaskCompletionHandler';


/**
 * 重复任务集成模块
 * 提供与现有系统集成的接口
 */
export class RecurringTaskIntegration {
  private static isInitialized = false;

  /**
   * 初始化重复任务系统
   * @param databaseAPI 数据库API实例
   */
  static initialize(databaseAPI: any): void {
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
   * @param taskId 任务ID
   * @param updates 更新数据
   * @param databaseAPI 数据库API实例
   */
  static async handleTaskUpdate(
    taskId: string,
    updates: Partial<Todo>,
    databaseAPI: any
  ): Promise<void> {
    // 检查是否为完成操作
    if (updates.completed === true) {
      try {
        // 获取完成的任务
        const taskResult = await databaseAPI.query(
          'SELECT * FROM todos WHERE id = $1',
          [taskId]
        );
        
        if (taskResult.rows.length === 0) {
          return;
        }

        const completedTask = { ...taskResult.rows[0], ...updates } as Todo;

        // 获取相关的原始重复任务
        const originalTasks = await this.getOriginalRecurringTasks(databaseAPI);

        // 处理任务完成
        await taskCompletionHandler.handleTaskCompletion(
          completedTask,
          originalTasks
        );
      } catch (error) {
        console.error('Error handling task completion:', error);
      }
    }
  }

  /**
   * 批量处理任务更新
   * @param taskUpdates 任务更新数组
   * @param databaseAPI 数据库API实例
   */
  static async batchHandleTaskUpdates(
    taskUpdates: Array<{ id: string; updates: Partial<Todo> }>,
    databaseAPI: any
  ): Promise<void> {
    const completionUpdates = taskUpdates.filter(update => update.updates.completed === true);
    
    if (completionUpdates.length === 0) {
      return;
    }

    try {
      // 获取所有完成的任务
      const taskIds = completionUpdates.map(update => update.id);
      const tasksResult = await databaseAPI.query(
        `SELECT * FROM todos WHERE id = ANY($1)`,
        [taskIds]
      );

      const completedTasks = tasksResult.rows.map((task: Todo) => {
        const update = completionUpdates.find(u => u.id === task.id);
        return { ...task, ...update?.updates } as Todo;
      });

      // 获取相关的原始重复任务
      const originalTasks = await this.getOriginalRecurringTasks(databaseAPI);

      // 批量处理任务完成
      await taskCompletionHandler.batchHandleTaskCompletions(
        completedTasks,
        originalTasks
      );
    } catch (error) {
      console.error('Error batch handling task completions:', error);
    }
  }

  /**
   * 获取所有原始重复任务
   * @param databaseAPI 数据库API实例
   * @returns 原始重复任务映射
   */
  private static async getOriginalRecurringTasks(databaseAPI: any): Promise<Map<string, Todo>> {
    try {
      const result = await databaseAPI.query(
        'SELECT * FROM todos WHERE is_recurring = true AND recurring_parent_id IS NULL'
      );

      const originalTasks = new Map<string, Todo>();
      result.rows.forEach((task: Todo) => {
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