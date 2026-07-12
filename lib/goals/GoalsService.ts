import { v4 as uuidv4 } from 'uuid';
import {
  Goal,
  Todo,
  GoalWithProgress,
  GoalFormData,
  GoalStatus,
  validateGoalData,
  sanitizeGoalData,
  validateGoalFormData,
  createDefaultGoal,
  calculateGoalProgress,
} from '@/lib/types';
import { DatabaseWrapper } from '@/lib/sync/ChangeInterceptor';
import { db } from '@/lib/db/dexie';

/**
 * 目标查询选项
 */
export interface GoalQueryOptions {
  includeArchived?: boolean;
  listId?: string;
  priority?: number;
  status?: GoalStatus;
  sortBy?: 'created_time' | 'due_date' | 'priority' | 'name';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/**
 * 目标服务类 - 处理所有目标相关的数据库操作
 */
export class GoalsService {
  constructor(private dbWrapper: DatabaseWrapper) {}

  /**
   * 创建新目标
   */
  async createGoal(goalData: Partial<Goal>): Promise<Goal> {
    // 清理数据
    const sanitizedData = sanitizeGoalData(goalData);
    
    // 验证清理后的数据
    const validation = validateGoalData(sanitizedData);
    if (!validation.isValid) {
      throw new Error(`目标数据验证失败: ${validation.errors.join(', ')}`);
    }
    
    // 创建完整的目标对象
    const goal: Goal = {
      ...createDefaultGoal(),
      ...sanitizedData,
      id: uuidv4(),
      created_time: new Date().toISOString()
    };

    // 插入数据库（使用包装器确保同步）
    await this.dbWrapper.insert('goals', {
      id: goal.id,
      name: goal.name,
      description: goal.description,
      list_id: goal.list_id,
      start_date: goal.start_date,
      due_date: goal.due_date,
      priority: goal.priority,
      created_time: goal.created_time,
      is_archived: goal.is_archived
    });

    return goal;
  }

  /**
   * 根据ID获取目标
   */
  async getGoalById(id: string): Promise<Goal | null> {
    const goal = await db.goals.get(id);
    return goal ?? null;
  }

  /**
   * 获取带进度信息的目标
   */
  async getGoalWithProgress(id: string): Promise<GoalWithProgress | null> {
    const goal = await db.goals.get(id);
    if (!goal) return null;

    const todos = await db.todos
      .where('goal_id').equals(id)
      .and(t => !t.deleted)
      .toArray();

    const totalTasks = todos.length;
    const completedTasks = todos.filter(t => t.completed).length;
    const progress = calculateGoalProgress(totalTasks, completedTasks);

    return {
      ...goal,
      total_tasks: totalTasks,
      completed_tasks: completedTasks,
      progress
    } as GoalWithProgress;
  }

  /**
   * 更新目标
   */
  async updateGoal(id: string, updates: Partial<Goal>): Promise<Goal> {
    // 清理数据（不进行完整验证，因为这是部分更新）
    const sanitizedData = sanitizeGoalData(updates);
    
    // 过滤掉计算字段和只读字段，这些字段不应该被更新
    const computedFields = ['progress', 'total_tasks', 'completed_tasks', 'list_name'];
    const updateData: Record<string, unknown> = {};
    
    Object.entries(sanitizedData).forEach(([key, value]) => {
      // 排除ID和计算字段
      if (key !== 'id' && value !== undefined && !computedFields.includes(key)) {
        updateData[key] = value;
      }
    });

    if (Object.keys(updateData).length === 0) {
      throw new Error('没有要更新的字段');
    }

    // 使用包装器更新（确保同步）
    await this.dbWrapper.update('goals', id, updateData);
    
    // 获取更新后的目标
    const updatedGoal = await this.getGoalById(id);
    if (!updatedGoal) {
      throw new Error('目标不存在');
    }

    return updatedGoal;
  }

  /**
   * 删除目标（软删除 - 存档）
   */
  async archiveGoal(id: string): Promise<Goal> {
    return this.updateGoal(id, { is_archived: true });
  }

  /**
   * 恢复已存档的目标
   */
  async unarchiveGoal(id: string): Promise<Goal> {
    return this.updateGoal(id, { is_archived: false });
  }

  /**
   * 永久删除目标
   */
  async deleteGoal(id: string): Promise<void> {
    // 首先检查目标是否存在
    const existingGoal = await this.getGoalById(id);
    if (!existingGoal) {
      throw new Error('目标不存在');
    }

    // 取消关联的待办事项（使用包装器确保同步）
    const associatedTodos = await this.getGoalTodos(id);
    for (const todo of associatedTodos) {
      await this.dbWrapper.update('todos', todo.id, {
        goal_id: null,
        sort_order_in_goal: null
      });
    }

    // 删除目标（使用包装器确保同步）
    await this.dbWrapper.delete('goals', id);
  }

  /**
   * 查询目标列表
   */
  async getGoals(options: GoalQueryOptions = {}): Promise<Goal[]> {
    const {
      includeArchived = false,
      listId,
      priority,
      sortBy = 'created_time',
      sortOrder = 'desc',
      limit,
      offset = 0
    } = options;

    let goals = await db.goals.toArray();

    // 过滤软删除
    goals = goals.filter(g => g.deleted_at === null || g.deleted_at === undefined);

    // 过滤存档
    if (!includeArchived) {
      goals = goals.filter(g => !g.is_archived);
    }

    if (listId) {
      goals = goals.filter(g => g.list_id === listId);
    }

    if (priority !== undefined) {
      goals = goals.filter(g => g.priority === priority);
    }

    // 排序
    goals.sort((a, b) => {
      const aVal = a[sortBy as keyof Goal] ?? '';
      const bVal = b[sortBy as keyof Goal] ?? '';
      if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    // 分页
    const sliced = goals.slice(offset, limit ? offset + limit : undefined);
    return sliced;
  }

  /**
   * 获取带进度信息的目标列表
   */
  async getGoalsWithProgress(options: GoalQueryOptions = {}): Promise<GoalWithProgress[]> {
    const goals = await this.getGoals(options);

    const goalsWithProgress = await Promise.all(
      goals.map(async (goal) => {
        const todos = await db.todos
          .where('goal_id').equals(goal.id)
          .and(t => !t.deleted)
          .toArray();

        const totalTasks = todos.length;
        const completedTasks = todos.filter(t => t.completed).length;
        const progress = calculateGoalProgress(totalTasks, completedTasks);

        return {
          ...goal,
          total_tasks: totalTasks,
          completed_tasks: completedTasks,
          progress
        } as GoalWithProgress;
      })
    );

    return goalsWithProgress;
  }

  /**
   * 获取目标关联的待办事项
   */
  async getGoalTodos(goalId: string, includeCompleted = true): Promise<Todo[]> {
    let todos = await db.todos
      .where('goal_id').equals(goalId)
      .and(t => !t.deleted)
      .toArray();

    if (!includeCompleted) {
      todos = todos.filter(t => !t.completed);
    }

    todos.sort((a, b) => {
      const aOrder = a.sort_order_in_goal ?? Infinity;
      const bOrder = b.sort_order_in_goal ?? Infinity;
      if (aOrder !== bOrder) return aOrder - bOrder;
      const aTime = a.created_time ?? '';
      const bTime = b.created_time ?? '';
      return aTime < bTime ? -1 : aTime > bTime ? 1 : 0;
    });

    return todos as unknown as Todo[];
  }

  /**
   * 将待办事项关联到目标
   */
  async associateTodoWithGoal(
    todoId: string, 
    goalId: string | null, 
    sortOrder?: number
  ): Promise<void> {
    if (goalId === null) {
      // 取消关联（使用包装器确保同步）
      await this.dbWrapper.update('todos', todoId, {
        goal_id: null,
        sort_order_in_goal: null
      });
    } else {
      // 如果没有指定排序，自动分配到最后
      if (sortOrder === undefined) {
        const todosInGoal = await db.todos
          .where('goal_id').equals(goalId)
          .toArray();
        const maxOrder = todosInGoal.reduce(
          (max, t) => Math.max(max, t.sort_order_in_goal ?? 0),
          0
        );
        sortOrder = maxOrder + 1;
      }

      // 检查待办事项是否存在
      const todo = await db.todos.get(todoId);
      if (!todo) {
        throw new Error('待办事项不存在');
      }

      // 关联到目标（使用包装器确保同步）
      await this.dbWrapper.update('todos', todoId, {
        goal_id: goalId,
        sort_order_in_goal: sortOrder
      });
    }
  }

  /**
   * 批量关联待办事项到目标
   */
  async batchAssociateTodosWithGoal(todoIds: string[], goalId: string): Promise<void> {
    if (todoIds.length === 0) return;

    // 获取当前最大排序值
    const todosInGoal = await db.todos
      .where('goal_id').equals(goalId)
      .toArray();
    const maxOrder = todosInGoal.reduce(
      (max, t) => Math.max(max, t.sort_order_in_goal ?? 0),
      0
    );
    const nextOrder = maxOrder + 1;

    // 批量更新
    const updatePromises = todoIds.map((todoId, index) => 
      this.associateTodoWithGoal(todoId, goalId, nextOrder + index)
    );

    await Promise.all(updatePromises);
  }

  /**
   * 重新排序目标中的待办事项
   */
  async reorderGoalTodos(goalId: string, todoIds: string[]): Promise<void> {
    const updatePromises = todoIds.map((todoId, index) => 
      this.dbWrapper.update('todos', todoId, {
        sort_order_in_goal: index + 1
      })
    );

    await Promise.all(updatePromises);
  }

  /**
   * 从目标表单数据创建目标和关联任务
   */
  async createGoalFromFormData(formData: GoalFormData): Promise<Goal> {
    // 验证表单数据
    const validation = validateGoalFormData(formData);
    if (!validation.isValid) {
      throw new Error(`表单数据验证失败: ${validation.errors.join(', ')}`);
    }

    try {
      // 创建目标
      const goal = await this.createGoal({
        name: formData.name,
        description: formData.description,
        list_id: formData.list_id,
        start_date: formData.start_date,
        due_date: formData.due_date,
        priority: formData.priority
      });

      // 关联现有任务和创建新任务时要防御性编程：associated_todos 可能为 undefined
      const associated = formData.associated_todos ?? { existing: [], new: [] };
      const existingTodos = Array.isArray(associated.existing) ? associated.existing : [];
      const newTodos = Array.isArray(associated.new) ? associated.new : [];

      // 关联现有任务
      if (existingTodos.length > 0) {
        await this.batchAssociateTodosWithGoal(existingTodos, goal.id);
      }

      // 创建新任务
      if (newTodos.length > 0) {
        const newTodoPromises = newTodos.map(async (title, index) => {
          const todoId = uuidv4();
          const sortOrder = existingTodos.length + index + 1;

          await this.dbWrapper.insert('todos', {
            id: todoId,
            title: title.trim(),
            completed: false,
            deleted: false,
            sort_order: 0,
            list_id: goal.list_id,
            goal_id: goal.id,
            sort_order_in_goal: sortOrder,
            created_time: new Date().toISOString()
          });
        });

        await Promise.all(newTodoPromises);
      }

      return goal;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 搜索目标
   */
  async searchGoals(query: string, options: GoalQueryOptions = {}): Promise<Goal[]> {
    if (!query.trim()) {
      return this.getGoals(options);
    }

    const searchTerm = query.trim().toLowerCase();
    let goals = await this.getGoals({ ...options, limit: undefined, offset: 0 });

    goals = goals.filter(g =>
      g.name.toLowerCase().includes(searchTerm) ||
      (g.description ?? '').toLowerCase().includes(searchTerm)
    );

    // Sort: name matches first, then by created_time desc
    goals.sort((a, b) => {
      const aNameMatch = a.name.toLowerCase().includes(searchTerm) ? 0 : 1;
      const bNameMatch = b.name.toLowerCase().includes(searchTerm) ? 0 : 1;
      if (aNameMatch !== bNameMatch) return aNameMatch - bNameMatch;
      const aTime = a.created_time ?? '';
      const bTime = b.created_time ?? '';
      return bTime < aTime ? -1 : bTime > aTime ? 1 : 0;
    });

    const limit = options.limit ?? 50;
    return goals.slice(0, limit);
  }

  /**
   * 获取已存档的目标列表
   */
  async getArchivedGoals(): Promise<Goal[]> {
    return this.getGoals({ includeArchived: true }).then(goals => 
      goals.filter(goal => goal.is_archived)
    );
  }

  /**
   * 获取目标统计信息
   */
  async getGoalStats(): Promise<{
    total: number;
    active: number;
    archived: number;
    completed: number;
    overdue: number;
  }> {
    const allGoals = await db.goals
      .filter(g => g.deleted_at === null || g.deleted_at === undefined)
      .toArray();

    const now = new Date().toISOString();
    const total = allGoals.length;
    const active = allGoals.filter(g => !g.is_archived).length;
    const archived = allGoals.filter(g => g.is_archived).length;
    const overdue = allGoals.filter(g =>
      !g.is_archived && g.due_date !== null && g.due_date !== undefined && g.due_date < now
    ).length;

    // 计算已完成的目标（需要通过进度计算）
    const goalsWithProgress = await this.getGoalsWithProgress({ includeArchived: true });
    const completed = goalsWithProgress.filter(goal => goal.progress === 100).length;

    return { total, active, archived, completed, overdue };
  }
}

/**
 * 创建目标服务实例
 */
export function createGoalsService(dbWrapper: DatabaseWrapper): GoalsService {
  return new GoalsService(dbWrapper);
}
