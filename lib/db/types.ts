// lib/db/types.ts
// Dexie-compatible TypeScript interfaces
// Mirror lib/types.ts but with added deleted_at and updated_at fields

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
  user_id: string;

  // 重复任务相关字段
  repeat: string | null;
  reminder: string | null;
  is_recurring: boolean;
  recurring_parent_id: string | null;
  instance_number: number | null;
  next_due_date: string | null;

  // 目标关联字段
  goal_id: string | null;
  sort_order_in_goal: number | null;

  // LWW conflict resolution
  updated_at: string;
  deleted_at: string | null;
}

export interface List {
  id: string;
  name: string;
  sort_order: number;
  is_hidden: boolean;
  user_id: string;

  // LWW conflict resolution
  updated_at: string;
  deleted_at: string | null;
}

export interface Goal {
  id: string;
  name: string;
  description: string | null;
  list_id: string | null;
  start_date: string | null;
  due_date: string | null;
  priority: number;
  created_time: string;
  is_archived: boolean;
  user_id: string;

  // LWW conflict resolution
  updated_at: string;
  deleted_at: string | null;
}

export interface GoalProgress {
  id: string;
  goal_id: string;
  todo_id: string;
  created_time: string;

  // LWW conflict resolution
  updated_at: string;
  deleted_at: string | null;
}

// Pending operation for offline sync queue
export interface PendingOperation {
  id: string
  table: 'todos' | 'lists' | 'goals'
  operation: 'insert' | 'update' | 'delete'
  record: Record<string, unknown>
  timestamp: string
  retryCount: number
}

export interface Meta {
  key: string;
  value: string;
  deleted_at: string | null;
  updated_at: string;
}
