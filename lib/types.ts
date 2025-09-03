// lib/types.ts
export interface Todo {
  id: string;
  title: string;
  completed: boolean;
  deleted: boolean;
  sort_order: number;
  due_date: string | null;
  content: string | null;
  tags: string | null;
  priority: number;
  created_time: string | null;
  completed_time: string | null;
  start_date: string | null;
  list_id: string | null;
  list_name?: string | null; // This will come from a JOIN locally
  modified?: string | null; // 修改时间字段，用于哈希校验和同步
  
  // 重复任务相关字段
  repeat?: string | null; // RFC 5545 RRULE格式字符串
  reminder?: string | null; // ISO 8601 Duration格式，如 "PT0S", "P0DT9H0M0S"
  is_recurring?: boolean; // 是否为重复任务
  recurring_parent_id?: string | null; // 指向原始重复任务的ID
  instance_number?: number | null; // 实例序号
  next_due_date?: string | null; // 下次到期日期（仅原始任务使用）
  
  // 目标关联字段
  goal_id?: string | null; // 关联的目标ID
  sort_order_in_goal?: number | null; // 在目标中的排序
  goal_name?: string | null; // 目标名称（通过JOIN获取）
}

export interface List {
  id: string;
  name: string;
  sort_order: number;
  is_hidden: boolean;
  modified?: string; // Service-side field
}

// 目标优先级枚举
export enum GoalPriority {
  LOW = 0,
  MEDIUM = 1,
  HIGH = 2,
  URGENT = 3
}

// 目标状态枚举
export enum GoalStatus {
  ACTIVE = 'active',
  ARCHIVED = 'archived',
  COMPLETED = 'completed'
}

// 目标相关类型定义
export interface Goal {
  id: string;
  name: string;
  description?: string | null;
  list_id?: string | null;
  start_date?: string | null;
  due_date?: string | null;
  priority: number;
  created_time: string;
  is_archived: boolean;
  modified?: string | null; // 修改时间字段，用于哈希校验和同步
  
  // 计算字段（不存储在数据库中）
  progress?: number;
  total_tasks?: number;
  completed_tasks?: number;
  list_name?: string | null;
}

// 带进度信息的目标
export interface GoalWithProgress extends Goal {
  progress: number;
  total_tasks: number;
  completed_tasks: number;
}

// 带目标信息的待办事项
export interface TodoWithGoal extends Todo {
  goal_name?: string | null;
}

// 目标分组信息
export interface GoalGroup {
  goal: Goal;
  todos: Todo[];
  progress: number;
  total_tasks: number;
  completed_tasks: number;
}

// 分组的待办事项（用于列表显示）
export interface GroupedTodoItem {
  type: 'todo' | 'goal-group';
  data: Todo | GoalGroup;
}

// 目标表单数据
export interface GoalFormData {
  name: string;
  description?: string;
  list_id?: string;
  start_date?: string;
  due_date?: string;
  priority: number;
  associated_todos?: {
    existing: string[]; // 现有待办事项ID
    new: string[]; // 新创建的待办事项标题
  };
}

// 重复任务相关类型定义

// RRULE解析结果接口
export interface ParsedRRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY';
  interval?: number;
  bymonthday?: number[];
  bymonth?: number[];
  byweekday?: number[];
  count?: number;
  until?: Date;
}

// 重复任务配置接口
export interface RecurrenceConfig {
  rrule: string; // 原始RRULE字符串
  parsed: ParsedRRule; // 解析后的规则
  description: string; // 人类可读描述
  nextDueDate?: Date; // 计算出的下次到期日期
}

// 滴答清单CSV导入格式（扩展现有格式）
export interface TickTickCsvRow {
  'Folder Name': string;
  'List Name': string;
  'Title': string;
  'Kind': string;
  'Tags': string;
  'Content': string;
  'Is Check list': string;
  'Start Date': string;
  'Due Date': string;
  'Reminder': string;
  'Repeat': string; // RRULE格式
  'Priority': string;
  'Status': string;
  'Created Time': string;
  'Completed Time': string;
  'Order': string;
  'Timezone': string;
  'Is All Day': string;
  'Is Floating': string;
  'Column Name': string;
  'Column Order': string;
  'View Mode': string;
  'taskId': string;
  'parentId': string;
}

// 数据验证和清理函数

/**
 * 验证目标数据的有效性
 */
export function validateGoalData(data: Partial<Goal>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 验证必填字段
  if (!data.name || typeof data.name !== 'string' || data.name.trim().length === 0) {
    errors.push('目标名称不能为空');
  }

  if (data.name && data.name.length > 200) {
    errors.push('目标名称不能超过200个字符');
  }

  // 验证描述长度
  if (data.description && data.description.length > 1000) {
    errors.push('目标描述不能超过1000个字符');
  }

  // 验证优先级
  if (data.priority !== undefined) {
    if (typeof data.priority !== 'number' || data.priority < 0 || data.priority > 3) {
      errors.push('优先级必须是0-3之间的数字');
    }
  }

  // 验证日期格式
  if (data.start_date && !isValidISODate(data.start_date)) {
    errors.push('开始日期格式不正确');
  }

  if (data.due_date && !isValidISODate(data.due_date)) {
    errors.push('截止日期格式不正确');
  }

  // 验证日期逻辑
  if (data.start_date && data.due_date) {
    const startDate = new Date(data.start_date);
    const dueDate = new Date(data.due_date);
    if (startDate > dueDate) {
      errors.push('开始日期不能晚于截止日期');
    }
  }

  // 验证UUID格式
  if (data.id && !isValidUUID(data.id)) {
    errors.push('目标ID格式不正确');
  }

  if (data.list_id && !isValidUUID(data.list_id)) {
    errors.push('列表ID格式不正确');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 清理目标数据，移除无效字段并标准化格式
 */
export function sanitizeGoalData(data: Partial<Goal>): Partial<Goal> {
  const sanitized: Partial<Goal> = {};

  // 清理字符串字段
  if (data.name !== undefined) {
    sanitized.name = typeof data.name === 'string' ? data.name.trim() : '';
  }

  if (data.description !== undefined) {
    sanitized.description = data.description && typeof data.description === 'string' 
      ? data.description.trim() || null 
      : null;
  }

  // 清理数字字段
  if (data.priority !== undefined) {
    const priority = Number(data.priority);
    sanitized.priority = isNaN(priority) ? 0 : Math.max(0, Math.min(3, Math.floor(priority)));
  }

  // 清理布尔字段
  if (data.is_archived !== undefined) {
    sanitized.is_archived = Boolean(data.is_archived);
  }

  // 清理日期字段
  if (data.start_date !== undefined) {
    sanitized.start_date = data.start_date && isValidISODate(data.start_date) 
      ? data.start_date 
      : null;
  }

  if (data.due_date !== undefined) {
    sanitized.due_date = data.due_date && isValidISODate(data.due_date) 
      ? data.due_date 
      : null;
  }

  // 清理UUID字段
  if (data.id !== undefined) {
    sanitized.id = data.id && isValidUUID(data.id) ? data.id : '';
  }

  if (data.list_id !== undefined) {
    sanitized.list_id = data.list_id && isValidUUID(data.list_id) 
      ? data.list_id 
      : null;
  }

  if (data.created_time !== undefined) {
    sanitized.created_time = data.created_time && isValidISODate(data.created_time) 
      ? data.created_time 
      : new Date().toISOString();
  }

  return sanitized;
}

/**
 * 验证待办事项的目标关联数据
 */
export function validateTodoGoalAssociation(data: Partial<Todo>): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 验证目标ID格式
  if (data.goal_id && !isValidUUID(data.goal_id)) {
    errors.push('目标ID格式不正确');
  }

  // 验证排序字段
  if (data.sort_order_in_goal !== undefined && data.sort_order_in_goal !== null) {
    if (typeof data.sort_order_in_goal !== 'number' || data.sort_order_in_goal < 0) {
      errors.push('目标内排序必须是非负数');
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 清理待办事项的目标关联数据
 */
export function sanitizeTodoGoalData(data: Partial<Todo>): Partial<Todo> {
  const sanitized: Partial<Todo> = { ...data };

  // 清理目标ID
  if (data.goal_id !== undefined) {
    sanitized.goal_id = data.goal_id && isValidUUID(data.goal_id) 
      ? data.goal_id 
      : null;
  }

  // 清理排序字段
  if (data.sort_order_in_goal !== undefined) {
    const sortOrder = Number(data.sort_order_in_goal);
    sanitized.sort_order_in_goal = !isNaN(sortOrder) && sortOrder >= 0 
      ? Math.floor(sortOrder) 
      : null;
  }

  return sanitized;
}

/**
 * 验证目标表单数据
 */
export function validateGoalFormData(data: GoalFormData): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 验证基本目标数据
  const goalValidation = validateGoalData({
    name: data.name,
    description: data.description,
    list_id: data.list_id,
    start_date: data.start_date,
    due_date: data.due_date,
    priority: data.priority
  });

  errors.push(...goalValidation.errors);

  // 验证关联任务数据
  if (data.associated_todos) {
    if (!Array.isArray(data.associated_todos.existing)) {
      errors.push('现有任务ID列表格式不正确');
    } else {
      for (const todoId of data.associated_todos.existing) {
        if (!isValidUUID(todoId)) {
          errors.push(`无效的任务ID: ${todoId}`);
        }
      }
    }

    if (!Array.isArray(data.associated_todos.new)) {
      errors.push('新任务列表格式不正确');
    } else {
      for (const todoTitle of data.associated_todos.new) {
        if (!todoTitle || typeof todoTitle !== 'string' || todoTitle.trim().length === 0) {
          errors.push('新任务标题不能为空');
        }
        if (todoTitle && todoTitle.length > 200) {
          errors.push('任务标题不能超过200个字符');
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * 创建默认的目标对象
 */
export function createDefaultGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: '',
    name: '',
    description: null,
    list_id: null,
    start_date: null,
    due_date: null,
    priority: GoalPriority.MEDIUM,
    created_time: new Date().toISOString(),
    is_archived: false,
    ...overrides
  };
}

/**
 * 创建默认的目标表单数据
 */
export function createDefaultGoalFormData(overrides: Partial<GoalFormData> = {}): GoalFormData {
  return {
    name: '',
    description: '',
    list_id: '',
    start_date: '',
    due_date: '',
    priority: GoalPriority.MEDIUM,
    associated_todos: {
      existing: [],
      new: []
    },
    ...overrides
  };
}

// 辅助函数

/**
 * 验证ISO日期字符串格式
 */
function isValidISODate(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }
  
  const date = new Date(dateString);
  return !isNaN(date.getTime()) && dateString.includes('T');
}

/**
 * 验证UUID格式
 */
function isValidUUID(uuid: string): boolean {
  if (!uuid || typeof uuid !== 'string') {
    return false;
  }
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * 计算目标进度百分比
 */
export function calculateGoalProgress(totalTasks: number, completedTasks: number): number {
  if (totalTasks === 0) {
    return 0;
  }
  return Math.round((completedTasks / totalTasks) * 100);
}

/**
 * 获取目标状态
 */
export function getGoalStatus(goal: Goal): GoalStatus {
  if (goal.is_archived) {
    return GoalStatus.ARCHIVED;
  }
  
  if (goal.progress === 100) {
    return GoalStatus.COMPLETED;
  }
  
  return GoalStatus.ACTIVE;
}

/**
 * 检查目标是否逾期
 */
export function isGoalOverdue(goal: Goal): boolean {
  if (!goal.due_date) {
    return false;
  }
  
  const dueDate = new Date(goal.due_date);
  const now = new Date();
  
  return dueDate < now && !goal.is_archived && (goal.progress || 0) < 100;
}

/**
 * 获取目标的优先级标签
 */
export function getGoalPriorityLabel(priority: number): string {
  switch (priority) {
    case GoalPriority.LOW:
      return '低';
    case GoalPriority.MEDIUM:
      return '中';
    case GoalPriority.HIGH:
      return '高';
    case GoalPriority.URGENT:
      return '紧急';
    default:
      return '中';
  }
}