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
}

export interface List {
  id: string;
  name: string;
  sort_order: number;
  is_hidden: boolean;
  modified?: string; // Service-side field
}