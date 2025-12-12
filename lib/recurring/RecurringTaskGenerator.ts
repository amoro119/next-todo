// lib/recurring/RecurringTaskGenerator.ts
import { Todo } from '../types';
import { RRuleEngine } from './RRuleEngine';

/**
 * 重复任务生成器
 * 负责从原始重复任务创建新的任务实例
 */
export class RecurringTaskGenerator {
  /**
   * 从重复任务生成新的重复任务（具有相同重复规则）
   * @param originalTask 原重复任务
   * @param dueDate 新任务的到期日期
   * @returns 新的重复任务
   */
  static generateNextRecurringTask(
    originalTask: Todo,
    dueDate: Date
  ): Omit<Todo, 'id'> {
    if (!originalTask.repeat || !originalTask.is_recurring) {
      throw new Error('Task is not a recurring task');
    }

    // 计算开始日期（如果原任务有开始日期）
    let startDate: string | null = null;
    if (originalTask.start_date && originalTask.due_date) {
      const originalStart = new Date(originalTask.start_date);
      const originalDue = new Date(originalTask.due_date);
      const duration = originalDue.getTime() - originalStart.getTime();
      
      const newStartDate = new Date(dueDate.getTime() - duration);
      startDate = newStartDate.toISOString();
    }

    // 计算下次到期日期 - 基于新任务的到期日期计算再下一次的到期日期
    let nextDueDate: string | null = null;
    try {
      const nextDate = RRuleEngine.calculateNextDueDate(originalTask.repeat, dueDate);
      if (nextDate) {
        nextDueDate = nextDate.toISOString();
      }
    } catch (error) {
      console.error('Error calculating next due date:', error);
    }

    // 创建新的重复任务（不是实例，是独立的重复任务）
    const newRecurringTask: Omit<Todo, 'id'> = {
      title: originalTask.title,
      completed: false,
      deleted: false,
      sort_order: originalTask.sort_order,
      due_date: dueDate.toISOString(),
      content: originalTask.content,
      tags: originalTask.tags,
      priority: originalTask.priority,
      created_time: new Date().toISOString(),
      completed_time: null,
      start_date: startDate,
      list_id: originalTask.list_id,
      
      // 重复任务相关字段 - 继承相同的重复规则
      repeat: originalTask.repeat, // 继承重复规则
      reminder: originalTask.reminder,
      is_recurring: true, // 新任务也是重复任务
      recurring_parent_id: null, // 不需要父任务关系
      instance_number: null, // 不需要实例编号
      next_due_date: nextDueDate // 计算下次到期日期
    };

    return newRecurringTask;
  }

  /**
   * 检查重复任务是否需要生成新实例
   * @param task 重复任务
   * @param currentDate 当前日期
   * @returns 如果需要生成新实例，返回应该生成的日期数组
   */
  static checkTaskNeedsNewInstances(
    task: Todo,
    currentDate: Date = new Date()
  ): Date[] {
    if (!task.repeat || !task.is_recurring) {
      return [];
    }

    try {
      // 检查重复是否已结束
      const instanceCount = task.instance_number || 0;
      if (RRuleEngine.isRecurrenceEnded(task.repeat, currentDate, instanceCount)) {
        return [];
      }

      const nextDueDate = task.next_due_date ? new Date(task.next_due_date) : null;
      
      // 如果没有下次到期日期，或者已经过期，需要计算新的实例
      if (!nextDueDate || nextDueDate <= currentDate) {
        const baseDate = nextDueDate || new Date(task.due_date || task.created_time || currentDate);
        const newDueDate = RRuleEngine.calculateNextDueDate(task.repeat, baseDate);
        
        if (newDueDate) {
          return [newDueDate];
        }
      }

      return [];
    } catch (error) {
      console.error('Error checking task for new instances:', error);
      return [];
    }
  }

  /**
   * 批量检查多个重复任务是否需要生成新实例
   * @param tasks 重复任务数组
   * @param currentDate 当前日期
   * @returns 需要生成实例的任务及其对应的日期
   */
  static batchCheckTasksNeedNewInstances(
    tasks: Todo[],
    currentDate: Date = new Date()
  ): Array<{ task: Todo; dueDates: Date[] }> {
    const results: Array<{ task: Todo; dueDates: Date[] }> = [];

    for (const task of tasks) {
      const dueDates = this.checkTaskNeedsNewInstances(task, currentDate);
      if (dueDates.length > 0) {
        results.push({ task, dueDates });
      }
    }

    return results;
  }

  /**
   * 更新原始重复任务的下次到期日期
   * @param task 原始重复任务
   * @param nextDueDate 下次到期日期
   * @returns 更新后的任务数据
   */
  static updateNextDueDate(
    task: Todo,
    nextDueDate: Date | null
  ): Partial<Todo> {
    return {
      next_due_date: nextDueDate ? nextDueDate.toISOString() : null,
      instance_number: (task.instance_number || 0) + 1
    };
  }

  /**
   * 停止重复任务（清除repeat字段）
   * @param task 要停止的重复任务
   * @returns 更新后的任务数据
   */
  static stopRecurrence(task: Todo): Partial<Todo> {
    return {
      repeat: null,
      is_recurring: false,
      next_due_date: null
    };
  }

  /**
   * 计算重复任务的预览实例（用于UI显示）
   * @param task 重复任务
   * @param count 预览实例数量
   * @returns 预览实例的日期数组
   */
  static generatePreviewInstances(
    task: Todo,
    count: number = 5
  ): Date[] {
    if (!task.repeat || !task.is_recurring) {
      return [];
    }

    try {
      const startDate = new Date(task.due_date || task.created_time || new Date());
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 2); // 预览未来2年

      return RRuleEngine.calculateDueDatesInRange(
        task.repeat,
        startDate,
        endDate,
        count
      );
    } catch (error) {
      console.error('Error generating preview instances:', error);
      return [];
    }
  }

  /**
   * 验证重复任务配置是否有效
   * @param task 要验证的任务
   * @returns 验证结果和错误信息
   */
  static validateRecurringTask(task: Partial<Todo>): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 检查必需字段
    if (!task.title) {
      errors.push('任务标题不能为空');
    }

    if (task.is_recurring) {
      if (!task.repeat) {
        errors.push('重复任务必须设置重复规则');
      } else if (!RRuleEngine.validateRRule(task.repeat)) {
        errors.push('重复规则格式无效');
      }

      if (!task.due_date && !task.created_time) {
        errors.push('重复任务必须设置到期日期或创建时间');
      }
    }

    // 检查实例任务
    if (task.recurring_parent_id && task.is_recurring) {
      errors.push('任务实例不能同时是重复任务');
    }

    if (task.recurring_parent_id && task.repeat) {
      errors.push('任务实例不应该包含重复规则');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取重复任务的人类可读描述
   * @param task 重复任务
   * @returns 描述字符串
   */
  static getTaskRecurrenceDescription(task: Todo): string {
    if (!task.repeat || !task.is_recurring) {
      return '';
    }

    try {
      return RRuleEngine.generateHumanReadableDescription(task.repeat);
    } catch (error) {
      console.error('Error generating task recurrence description:', error);
      return '重复任务';
    }
  }

  /**
   * 检查任务是否为重复任务
   * @param task 要检查的任务
   * @returns 是否为重复任务
   */
  static isRecurringTask(task: Todo): boolean {
    return !!(task.repeat && task.is_recurring);
  }

  /**
   * 检查任务是否为重复任务实例（向后兼容，实际上不再需要区分）
   * @param task 要检查的任务
   * @returns 是否为实例
   * @deprecated 不再区分实例和原始任务
   */
  static isTaskInstance(task: Todo): boolean {
    return !!(task.recurring_parent_id && !task.is_recurring);
  }

  /**
   * 检查任务是否为原始重复任务（向后兼容，实际上不再需要区分）
   * @param task 要检查的任务
   * @returns 是否为原始重复任务
   * @deprecated 不再区分实例和原始任务
   */
  static isOriginalRecurringTask(task: Todo): boolean {
    return !!(task.repeat && task.is_recurring && !task.recurring_parent_id);
  }

  /**
   * 处理任务完成事件，为"完成后生成"模式的任务生成下一个实例
   * @param completedTask 已完成的任务
   * @param currentDate 当前日期
   * @returns 如果需要生成新实例，返回新实例数据和原任务更新数据
   */
  static handleTaskCompletion(
    completedTask: Todo,
    currentDate: Date = new Date()
  ): {
    shouldGenerateNext: boolean;
    newInstance?: Omit<Todo, 'id'>;
    parentTaskUpdates?: Partial<Todo>;
  } {
    // 检查是否为重复任务实例
    if (!this.isTaskInstance(completedTask)) {
      return { shouldGenerateNext: false };
    }

    // 获取原始重复任务（需要从数据库查询，这里假设已经传入）
    // 在实际使用中，调用方需要先查询原始任务
    return { shouldGenerateNext: false };
  }

  /**
   * 处理重复任务完成事件
   * @param completedTask 已完成的重复任务
   * @param baseDate 用于计算下次到期日期的基准日期（通常是原任务的到期日期）
   * @returns 生成结果
   */
  static handleRecurringTaskCompletion(
    completedTask: Todo,
    baseDate: Date = new Date()
  ): {
    shouldGenerateNext: boolean;
    newRecurringTask?: Omit<Todo, 'id'>;
  } {
    if (!completedTask.repeat || !completedTask.is_recurring) {
      return { shouldGenerateNext: false };
    }

    try {
      // 检查重复是否已结束
      if (RRuleEngine.isRecurrenceEnded(completedTask.repeat, baseDate, 0)) {
        return { shouldGenerateNext: false };
      }

      // 计算下一个到期日期 - 使用传入的基准日期
      const nextDueDate = RRuleEngine.calculateNextDueDate(completedTask.repeat, baseDate);

      if (!nextDueDate) {
        return { shouldGenerateNext: false };
      }

      // 生成新的重复任务
      const newRecurringTask = this.generateNextRecurringTask(
        completedTask,
        nextDueDate
      );

      return {
        shouldGenerateNext: true,
        newRecurringTask
      };
    } catch (error) {
      console.error('Error handling recurring task completion:', error);
      return { shouldGenerateNext: false };
    }
  }

  /**
   * 处理重复任务实例完成事件
   * @param instanceTask 重复任务实例
   * @param originalTask 原始重复任务
   * @param currentDate 当前日期
   * @returns 生成结果
   */
  static handleInstanceTaskCompletion(
    instanceTask: Todo,
    originalTask: Todo,
    currentDate: Date = new Date()
  ): {
    shouldGenerateNext: boolean;
    newInstance?: Omit<Todo, 'id'>;
    parentTaskUpdates?: Partial<Todo>;
  } {
    if (!this.isTaskInstance(instanceTask) || !this.isOriginalRecurringTask(originalTask)) {
      return { shouldGenerateNext: false };
    }

    try {
      // 检查重复是否已结束
      const instanceCount = originalTask.instance_number || 0;
      if (RRuleEngine.isRecurrenceEnded(originalTask.repeat!, currentDate, instanceCount)) {
        return { shouldGenerateNext: false };
      }

      // 基于实例的到期日期计算下一个到期日期
      const baseDate = new Date(instanceTask.due_date || instanceTask.created_time || currentDate);
      const nextDueDate = RRuleEngine.calculateNextDueDate(originalTask.repeat!, baseDate);

      if (!nextDueDate) {
        return { shouldGenerateNext: false };
      }

      // 生成新实例
      const newInstance = this.generateTaskInstance(
        originalTask,
        nextDueDate,
        instanceCount + 1
      );

      // 更新原始任务
      const parentTaskUpdates = this.updateNextDueDate(originalTask, nextDueDate);

      return {
        shouldGenerateNext: true,
        newInstance,
        parentTaskUpdates
      };
    } catch (error) {
      console.error('Error handling instance task completion:', error);
      return { shouldGenerateNext: false };
    }
  }

  /**
   * 批量处理多个任务完成事件
   * @param completedTasks 已完成的任务数组
   * @param originalTasks 原始重复任务映射（key为任务ID）
   * @param currentDate 当前日期
   * @returns 批量生成结果
   */
  static batchHandleTaskCompletions(
    completedTasks: Todo[],
    originalTasks: Map<string, Todo>,
    currentDate: Date = new Date()
  ): Array<{
    completedTask: Todo;
    shouldGenerateNext: boolean;
    newInstance?: Omit<Todo, 'id'>;
    parentTaskUpdates?: Partial<Todo>;
  }> {
    const results: Array<{
      completedTask: Todo;
      shouldGenerateNext: boolean;
      newInstance?: Omit<Todo, 'id'>;
      parentTaskUpdates?: Partial<Todo>;
    }> = [];

    for (const completedTask of completedTasks) {
      let result: {
        shouldGenerateNext: boolean;
        newInstance?: Omit<Todo, 'id'>;
        parentTaskUpdates?: Partial<Todo>;
      };

      if (this.isOriginalRecurringTask(completedTask)) {
        // 处理原始重复任务完成
        result = this.handleOriginalTaskCompletion(completedTask, currentDate);
      } else if (this.isTaskInstance(completedTask) && completedTask.recurring_parent_id) {
        // 处理重复任务实例完成
        const originalTask = originalTasks.get(completedTask.recurring_parent_id);
        if (originalTask) {
          result = this.handleInstanceTaskCompletion(completedTask, originalTask, currentDate);
        } else {
          result = { shouldGenerateNext: false };
        }
      } else {
        result = { shouldGenerateNext: false };
      }

      results.push({
        completedTask,
        ...result
      });
    }

    return results;
  }

  /**
   * 检查任务是否支持"完成后生成"模式
   * @param task 要检查的任务
   * @returns 是否支持完成后生成
   */
  static supportsCompletionGeneration(task: Todo): boolean {
    return this.isOriginalRecurringTask(task) || this.isTaskInstance(task);
  }

  /**
   * 生成任务实例（向后兼容方法）
   * @param originalTask 原始重复任务
   * @param dueDate 到期日期
   * @param instanceNumber 实例编号
   * @returns 新的任务实例
   * @deprecated 不再区分实例和原始任务，使用generateNextRecurringTask代替
   */
  static generateTaskInstance(
    originalTask: Todo,
    dueDate: Date,
    instanceNumber: number
  ): Omit<Todo, 'id'> {
    return this.generateNextRecurringTask(originalTask, dueDate);
  }

  /**
   * 处理原始重复任务完成事件（向后兼容方法）
   * @param originalTask 原始重复任务
   * @param currentDate 当前日期
   * @returns 生成结果
   * @deprecated 使用handleRecurringTaskCompletion代替
   */
  static handleOriginalTaskCompletion(
    originalTask: Todo,
    currentDate: Date = new Date()
  ): {
    shouldGenerateNext: boolean;
    newInstance?: Omit<Todo, 'id'>;
    parentTaskUpdates?: Partial<Todo>;
  } {
    const result = this.handleRecurringTaskCompletion(originalTask, currentDate);
    return {
      shouldGenerateNext: result.shouldGenerateNext,
      newInstance: result.newRecurringTask,
      parentTaskUpdates: result.shouldGenerateNext ? this.updateNextDueDate(originalTask, new Date()) : undefined
    };
  }
}