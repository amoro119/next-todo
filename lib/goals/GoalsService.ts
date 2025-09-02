import { PGlite } from '@electric-sql/pglite';
import { v4 as uuidv4 } from 'uuid';
import {
  Goal,
  Todo,
  GoalWithProgress,
  GoalFormData,
  GoalPriority,
  GoalStatus,
  validateGoalData,
  sanitizeGoalData,
  validateGoalFormData,
  createDefaultGoal,
  calculateGoalProgress,
  getGoalStatus,
  isGoalOverdue
} from '@/lib/types';
import { DatabaseWrapper } from '@/lib/sync/ChangeInterceptor';

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

  // 获取原始数据库实例用于只读操作
  private get db(): PGlite {
    return this.dbWrapper.raw;
  }

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
    const query = `
      SELECT g.*, l.name as list_name
      FROM goals g
      LEFT JOIN lists l ON g.list_id = l.id
      WHERE g.id = $1
    `;

    const result = await this.db.query(query, [id]);
    return result.rows.length > 0 ? (result.rows[0] as Goal) : null;
  }

  /**
   * 获取带进度信息的目标
   */
  async getGoalWithProgress(id: string): Promise<GoalWithProgress | null> {
    const query = `
      SELECT 
        g.*,
        l.name as list_name,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.completed = true THEN 1 END) as completed_tasks
      FROM goals g
      LEFT JOIN lists l ON g.list_id = l.id
      LEFT JOIN todos t ON t.goal_id = g.id AND t.deleted = false
      WHERE g.id = $1
      GROUP BY g.id, l.name
    `;

    const result = await this.db.query(query, [id]);
    
    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as any;
    const totalTasks = parseInt(row.total_tasks) || 0;
    const completedTasks = parseInt(row.completed_tasks) || 0;
    const progress = calculateGoalProgress(totalTasks, completedTasks);

    return {
      ...row,
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
    const updateData: Record<string, any> = {};
    
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
      status,
      sortBy = 'created_time',
      sortOrder = 'desc',
      limit,
      offset = 0
    } = options;

    let query = `
      SELECT g.*, l.name as list_name
      FROM goals g
      LEFT JOIN lists l ON g.list_id = l.id
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // 添加过滤条件
    if (!includeArchived) {
      query += ` AND g.is_archived = false`;
    }

    if (listId) {
      query += ` AND g.list_id = $${paramIndex}`;
      params.push(listId);
      paramIndex++;
    }

    if (priority !== undefined) {
      query += ` AND g.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    // 添加排序
    const validSortFields = ['created_time', 'due_date', 'priority', 'name'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_time';
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY g.${sortField} ${sortDirection}`;

    // 添加分页
    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(limit);
      paramIndex++;
    }

    if (offset > 0) {
      query += ` OFFSET $${paramIndex}`;
      params.push(offset);
      paramIndex++;
    }

    const result = await this.db.query(query, params);
    return result.rows as Goal[];
  }

  /**
   * 获取带进度信息的目标列表
   */
  async getGoalsWithProgress(options: GoalQueryOptions = {}): Promise<GoalWithProgress[]> {
    const {
      includeArchived = false,
      listId,
      priority,
      sortBy = 'created_time',
      sortOrder = 'desc',
      limit,
      offset = 0
    } = options;

    let query = `
      SELECT 
        g.*,
        l.name as list_name,
        COUNT(t.id) as total_tasks,
        COUNT(CASE WHEN t.completed = true THEN 1 END) as completed_tasks
      FROM goals g
      LEFT JOIN lists l ON g.list_id = l.id
      LEFT JOIN todos t ON t.goal_id = g.id AND t.deleted = false
      WHERE 1=1
    `;

    const params: any[] = [];
    let paramIndex = 1;

    // 添加过滤条件
    if (!includeArchived) {
      query += ` AND g.is_archived = false`;
    }

    if (listId) {
      query += ` AND g.list_id = $${paramIndex}`;
      params.push(listId);
      paramIndex++;
    }

    if (priority !== undefined) {
      query += ` AND g.priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    query += ` GROUP BY g.id, l.name`;

    // 添加排序
    const validSortFields = ['created_time', 'due_date', 'priority', 'name'];
    const sortField = validSortFields.includes(sortBy) ? sortBy : 'created_time';
    const sortDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    
    query += ` ORDER BY g.${sortField} ${sortDirection}`;

    // 添加分页
    if (limit) {
      query += ` LIMIT $${paramIndex}`;
      params.push(limit);
      paramIndex++;
    }

    if (offset > 0) {
      query += ` OFFSET $${paramIndex}`;
      params.push(offset);
      paramIndex++;
    }

    const result = await this.db.query(query, params);
    
    return result.rows.map((row: any) => {
      const totalTasks = parseInt(row.total_tasks) || 0;
      const completedTasks = parseInt(row.completed_tasks) || 0;
      const progress = calculateGoalProgress(totalTasks, completedTasks);

      return {
        ...row,
        total_tasks: totalTasks,
        completed_tasks: completedTasks,
        progress
      } as GoalWithProgress;
    });
  }

  /**
   * 获取目标关联的待办事项
   */
  async getGoalTodos(goalId: string, includeCompleted = true): Promise<Todo[]> {
    let query = `
      SELECT t.*, l.name as list_name, g.name as goal_name
      FROM todos t
      LEFT JOIN lists l ON t.list_id = l.id
      LEFT JOIN goals g ON t.goal_id = g.id
      WHERE t.goal_id = $1 AND t.deleted = false
    `;

    const params = [goalId];

    if (!includeCompleted) {
      query += ` AND t.completed = false`;
    }

    query += ` ORDER BY t.sort_order_in_goal ASC, t.created_time ASC`;

    const result = await this.db.query(query, params);
    return result.rows as Todo[];
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
        const maxOrderResult = await this.db.query(
          'SELECT COALESCE(MAX(sort_order_in_goal), 0) + 1 as next_order FROM todos WHERE goal_id = $1',
          [goalId]
        );
        sortOrder = maxOrderResult.rows[0]?.next_order || 1;
      }

      // 检查待办事项是否存在
      const todoExists = await this.db.query('SELECT id FROM todos WHERE id = $1', [todoId]);
      if (todoExists.rows.length === 0) {
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
    const maxOrderResult = await this.db.query(
      'SELECT COALESCE(MAX(sort_order_in_goal), 0) as max_order FROM todos WHERE goal_id = $1',
      [goalId]
    );
    
    let nextOrder = (maxOrderResult.rows[0]?.max_order || 0) + 1;

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

    // 开始事务
    await this.db.query('BEGIN');

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

      // 提交事务
      await this.db.query('COMMIT');
      
      return goal;
    } catch (error) {
      // 回滚事务
      await this.db.query('ROLLBACK');
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

    const searchQuery = `
      SELECT g.*, l.name as list_name
      FROM goals g
      LEFT JOIN lists l ON g.list_id = l.id
      WHERE (
        g.name ILIKE $1 OR 
        g.description ILIKE $1
      )
      ${options.includeArchived ? '' : 'AND g.is_archived = false'}
      ORDER BY 
        CASE WHEN g.name ILIKE $1 THEN 1 ELSE 2 END,
        g.created_time DESC
      LIMIT ${options.limit || 50}
    `;

    const searchTerm = `%${query.trim()}%`;
    const result = await this.db.query(searchQuery, [searchTerm]);
    
    return result.rows as Goal[];
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
    const query = `
      SELECT 
        COUNT(*) as total,
        COUNT(CASE WHEN is_archived = false THEN 1 END) as active,
        COUNT(CASE WHEN is_archived = true THEN 1 END) as archived,
        COUNT(CASE WHEN due_date < NOW() AND is_archived = false THEN 1 END) as overdue
      FROM goals
    `;

    const result = await this.db.query(query);
    const stats = result.rows[0] as any;

    // 计算已完成的目标（需要通过进度计算）
    const goalsWithProgress = await this.getGoalsWithProgress({ includeArchived: true });
    const completed = goalsWithProgress.filter(goal => goal.progress === 100).length;

    return {
      total: parseInt(stats.total) || 0,
      active: parseInt(stats.active) || 0,
      archived: parseInt(stats.archived) || 0,
      completed,
      overdue: parseInt(stats.overdue) || 0
    };
  }
}

/**
 * 创建目标服务实例
 */
export function createGoalsService(dbWrapper: DatabaseWrapper): GoalsService {
  return new GoalsService(dbWrapper);
}