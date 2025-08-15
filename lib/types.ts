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
  
  // 重复任务相关字段
  repeat?: string | null; // RFC 5545 RRULE格式字符串
  reminder?: string | null; // ISO 8601 Duration格式，如 "PT0S", "P0DT9H0M0S"
  is_recurring?: boolean; // 是否为重复任务
  recurring_parent_id?: string | null; // 指向原始重复任务的ID
  instance_number?: number | null; // 实例序号
  next_due_date?: string | null; // 下次到期日期（仅原始任务使用）
}

export interface List {
  id: string;
  name: string;
  sort_order: number;
  is_hidden: boolean;
  modified?: string; // Service-side field
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