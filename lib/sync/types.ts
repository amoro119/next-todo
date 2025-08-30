// lib/sync/types.ts
// 同步相关的类型定义

import { ShapeStream } from "@electric-sql/client";

/**
 * 简化同步管理器接口
 */
export interface SimpleSyncManagerInterface {
  /** ShapeStream 实例数组 */
  shapeStreams: ShapeStream[];
  
  /** 是否正在接收消息 */
  isReceivingMessages: boolean;
  
  /** 最后一次接收消息的时间戳 */
  lastMessageTime: number | null;
  
  /** 启动同步 */
  startSync(messageProcessor?: (shapeName: string, messages: any[]) => Promise<void>): Promise<void>;
  
  /** 停止同步 */
  stopSync(): void;
  
  /** 订阅状态变化 */
  subscribe(callback: (isRunning: boolean) => void): () => void;
  
  /** 设置消息处理器 */
  setMessageProcessor(processor: (shapeName: string, messages: any[]) => Promise<void>): void;
}

/**
 * 订阅控制器接口
 */
export interface SubscriptionController {
  /** ShapeStream 实例数组 */
  shapeStreams: ShapeStream[];
  
  /** 消息处理器映射 */
  messageHandlers: Map<string, (messages: any[]) => void>;
  
  /** 是否正在接收消息 */
  isReceivingMessages: boolean;
  
  /** 启动订阅 */
  startSubscriptions(): void;
  
  /** 停止订阅 */
  stopSubscriptions(): void;
}

/**
 * 同步状态类型
 */
export type SyncState = {
  /** 同步是否正在运行 */
  isRunning: boolean;
  
  /** 是否正在切换状态 */
  isTransitioning: boolean;
  
  /** 错误信息（如果有） */
  error?: string;
};

/**
 * 同步状态枚举
 */
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'paused' | 'completed';

/**
 * 订阅管理器类型
 */
export type SubscriptionManager = {
  /** ShapeStream 实例数组 */
  streams: ShapeStream[];
  
  /** 是否正在接收消息 */
  isReceivingMessages: boolean;
  
  /** 最后一次接收消息的时间戳 */
  lastMessageTime: number | null;
  
  /** 消息计数 */
  messageCount: number;
  
  /** 启动订阅 */
  startSubscriptions(): void;
  
  /** 停止订阅 */
  stopSubscriptions(): void;
  
  /** 检查状态 */
  checkStatus(): boolean;
};

/**
 * 同步状态信息
 */
export interface SyncStatusInfo {
  /** 当前状态 */
  status: 'running' | 'stopped' | 'error' | 'transitioning';
  
  /** 状态消息 */
  message: string;
  
  /** 是否活跃 */
  isActive: boolean;
  
  /** 是否有错误 */
  isError: boolean;
  
  /** 是否可以重试 */
  canRetry: boolean;
  
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 消息处理回调类型
 */
export type MessageHandler = (messages: any[]) => void;

/**
 * 错误处理回调类型
 */
export type ErrorHandler = (error: any) => void;

/**
 * 状态变化回调类型
 */
export type StatusChangeCallback = (isRunning: boolean) => void;

/**
 * 变更记录类型
 */
export interface ChangeRecord {
  /** 变更ID */
  id: string;
  
  /** 记录ID */
  record_id: string;
  
  /** 表名 */
  table_name: string;
  
  /** 操作类型 */
  operation: 'insert' | 'update' | 'delete';
  
  /** 变更数据 */
  data: any;
  
  /** 状态 */
  status: 'pending' | 'completed' | 'failed' | 'syncing';
  
  /** 重试次数 */
  retry_count: number;
  
  /** 最大重试次数 */
  max_retries: number;
  
  /** 时间戳 */
  timestamp: string;
  
  /** 错误信息 */
  error_message?: string;
  
  /** 创建时间 */
  created_at: string;
  
  /** 更新时间 */
  updated_at: string;
}

/**
 * 同步结果类型
 */
export interface SyncResult {
  /** 变更ID */
  changeId: string;
  
  /** 是否成功 */
  success: boolean;
  
  /** 错误信息 */
  error?: string;
  
  /** 是否可重试 */
  retryable: boolean;
}

/**
 * 变更集合类型
 */
export interface ChangeSet {
  /** 列表变更 */
  lists: ListChange[];
  
  /** 任务变更 */
  todos: TodoChange[];
  
  /** 目标变更 */
  goals: GoalChange[];
}

/**
 * 列表变更类型
 */
export interface ListChange {
  /** 列表ID */
  id: string;
  
  /** 列表名称 */
  name: string;
  
  /** 排序顺序 */
  sort_order: number;
  
  /** 是否隐藏 */
  is_hidden: boolean;
  
  /** 修改的列 */
  modified_columns: string[];
  
  /** 是否为新记录 */
  new: boolean;
}

/**
 * 任务变更类型
 */
export interface TodoChange {
  /** 任务ID */
  id: string;
  
  /** 任务标题 */
  title: string;
  
  /** 是否完成 */
  completed: boolean;
  
  /** 是否删除 */
  deleted?: boolean;
  
  /** 排序顺序 */
  sort_order: number;
  
  /** 截止日期 */
  due_date?: string;
  
  /** 任务内容 */
  content?: string;
  
  /** 标签 */
  tags?: string[];
  
  /** 优先级 */
  priority?: number;
  
  /** 创建时间 */
  created_time: string;
  
  /** 完成时间 */
  completed_time?: string;
  
  /** 开始日期 */
  start_date?: string;
  
  /** 列表ID */
  list_id?: string;
  
  /** 重复规则 */
  repeat?: string;
  
  /** 提醒设置 */
  reminder?: string;
  
  /** 是否为重复任务 */
  is_recurring?: boolean;
  
  /** 重复任务父ID */
  recurring_parent_id?: string;
  
  /** 实例编号 */
  instance_number?: number;
  
  /** 下次截止日期 */
  next_due_date?: string;
  
  /** 目标ID */
  goal_id?: string;
  
  /** 在目标中的排序 */
  sort_order_in_goal?: number;
  
  /** 修改的列 */
  modified_columns: string[];
  
  /** 是否为新记录 */
  new: boolean;
}

/**
 * 目标变更类型
 */
export interface GoalChange {
  /** 目标ID */
  id: string;
  
  /** 目标名称 */
  name: string;
  
  /** 目标描述 */
  description?: string;
  
  /** 列表ID */
  list_id?: string;
  
  /** 开始日期 */
  start_date?: string;
  
  /** 截止日期 */
  due_date?: string;
  
  /** 优先级 */
  priority?: number;
  
  /** 创建时间 */
  created_time: string;
  
  /** 是否存档 */
  is_archived?: boolean;
  
  /** 修改的列 */
  modified_columns: string[];
  
  /** 是否为新记录 */
  new: boolean;
}

/**
 * 重试配置类型
 */
export interface RetryConfig {
  /** 最大重试次数 */
  maxRetries: number;
  
  /** 基础延迟时间（毫秒） */
  baseDelay: number;
  
  /** 最大延迟时间（毫秒） */
  maxDelay: number;
  
  /** 退避倍数 */
  backoffMultiplier: number;
  
  /** 抖动因子 */
  jitterFactor: number;
  
  /** 可重试的错误类型 */
  retryableErrors: string[];
}

/**
 * 默认重试配置
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  retryableErrors: [
    'network',
    'timeout',
    'connection',
    'fetch',
    'abort',
    'econnreset',
    'enotfound',
    'etimedout'
  ]
};

/**
 * 队列统计信息类型
 */
export interface QueueStats {
  /** 待处理的变更数量 */
  pending: number;
  
  /** 已完成的变更数量 */
  completed: number;
  
  /** 失败的变更数量 */
  failed: number;
  
  /** 正在同步的变更数量 */
  syncing: number;
  
  /** 总变更数量 */
  total: number;
}

/**
 * 数据库操作类型
 */
export interface DatabaseOperation {
  /** 操作ID */
  id: string;
  
  /** 表名 */
  table: string;
  
  /** 操作类型 */
  operation: 'insert' | 'update' | 'delete';
  
  /** 操作数据 */
  data: Record<string, unknown>;
  
  /** 操作时间戳 */
  timestamp: string;
}