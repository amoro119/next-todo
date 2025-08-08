// lib/recurring/TaskCompletionHandler.ts
import { Todo } from '../types';
import { RecurringTaskGenerator } from './RecurringTaskGenerator';

/**
 * 任务完成处理器
 * 监听任务完成事件并触发重复任务生成
 */
export class TaskCompletionHandler {
  private static instance: TaskCompletionHandler;
  private completionCallbacks: Array<(result: TaskCompletionResult) => void> = [];

  private constructor() {}

  static getInstance(): TaskCompletionHandler {
    if (!TaskCompletionHandler.instance) {
      TaskCompletionHandler.instance = new TaskCompletionHandler();
    }
    return TaskCompletionHandler.instance;
  }

  /**
   * 注册任务完成回调
   * @param callback 回调函数
   */
  onTaskCompletion(callback: (result: TaskCompletionResult) => void): void {
    this.completionCallbacks.push(callback);
  }

  /**
   * 移除任务完成回调
   * @param callback 要移除的回调函数
   */
  removeTaskCompletionCallback(callback: (result: TaskCompletionResult) => void): void {
    const index = this.completionCallbacks.indexOf(callback);
    if (index > -1) {
      this.completionCallbacks.splice(index, 1);
    }
  }

  /**
   * 处理任务完成事件
   * @param task 完成的任务
   * @param originalTasks 原始重复任务映射（用于查找父任务）
   * @param currentDate 当前日期
   */
  async handleTaskCompletion(
    task: Todo,
    originalTasks: Map<string, Todo>,
    currentDate: Date = new Date()
  ): Promise<TaskCompletionResult> {
    let result: TaskCompletionResult;

    if (RecurringTaskGenerator.isRecurringTask(task)) {
      // 处理重复任务完成（不再区分原始任务和实例）
      const generationResult = RecurringTaskGenerator.handleRecurringTaskCompletion(task, currentDate);
      result = {
        completedTask: task,
        isRecurringTask: true,
        shouldGenerateNext: generationResult.shouldGenerateNext,
        newInstance: generationResult.newRecurringTask
      };
    } else {
      // 普通任务完成，无需处理
      result = {
        completedTask: task,
        isRecurringTask: false,
        shouldGenerateNext: false
      };
    }

    // 通知所有回调
    this.completionCallbacks.forEach(callback => {
      try {
        callback(result);
      } catch (error) {
        console.error('Error in task completion callback:', error);
      }
    });

    return result;
  }

  /**
   * 批量处理任务完成事件
   * @param tasks 完成的任务数组
   * @param originalTasks 原始重复任务映射
   * @param currentDate 当前日期
   */
  async batchHandleTaskCompletions(
    tasks: Todo[],
    originalTasks: Map<string, Todo>,
    currentDate: Date = new Date()
  ): Promise<TaskCompletionResult[]> {
    const results: TaskCompletionResult[] = [];

    for (const task of tasks) {
      const result = await this.handleTaskCompletion(task, originalTasks, currentDate);
      results.push(result);
    }

    return results;
  }

  /**
   * 检查任务更新是否为完成操作
   * @param oldTask 更新前的任务
   * @param newTask 更新后的任务
   * @returns 是否为完成操作
   */
  static isTaskCompletionUpdate(oldTask: Todo, newTask: Partial<Todo>): boolean {
    // 检查是否从未完成变为完成
    return !oldTask.completed && newTask.completed === true;
  }

  /**
   * 从任务更新中提取完成的任务
   * @param taskUpdates 任务更新数组
   * @returns 完成的任务数组
   */
  static extractCompletedTasks(
    taskUpdates: Array<{ oldTask: Todo; newTask: Partial<Todo> }>
  ): Todo[] {
    return taskUpdates
      .filter(update => this.isTaskCompletionUpdate(update.oldTask, update.newTask))
      .map(update => ({ ...update.oldTask, ...update.newTask } as Todo));
  }
}

/**
 * 任务完成处理结果
 */
export interface TaskCompletionResult {
  completedTask: Todo;
  isRecurringTask: boolean;
  originalTask?: Todo;
  shouldGenerateNext: boolean;
  newInstance?: Omit<Todo, 'id'>;
  parentTaskUpdates?: Partial<Todo>;
}

// 导出单例实例
export const taskCompletionHandler = TaskCompletionHandler.getInstance();