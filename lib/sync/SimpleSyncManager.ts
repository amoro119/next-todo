// lib/sync/SimpleSyncManager.ts
// 基于消息流的简化同步状态管理器

import { ShapeStream } from "@electric-sql/client";
import { 
  SimpleSyncManagerInterface, 
  MessageHandler, 
  ErrorHandler, 
  StatusChangeCallback 
} from './types';

export class SimpleSyncManager implements SimpleSyncManagerInterface {
  public shapeStreams: ShapeStream[] = [];
  public isReceivingMessages: boolean = false;
  public lastMessageTime: number | null = null;
  
  private listeners: Set<StatusChangeCallback> = new Set();
  private messageTimeoutId: NodeJS.Timeout | null = null;
  private readonly MESSAGE_TIMEOUT = 60000; // 60秒无消息则认为断开
  private messageProcessor?: (shapeName: string, messages: unknown[]) => Promise<void>;
  private unsubscribeFunctions: (() => void)[] = []; // 存储取消订阅函数

  constructor() {
    this.setupMessageTimeoutCheck();
  }

  /**
   * 设置消息处理器
   */
  setMessageProcessor(processor: (shapeName: string, messages: any[]) => Promise<void>): void {
    this.messageProcessor = processor;
  }

  /**
   * 订阅同步状态变化
   * @param callback 状态变化回调函数，参数为是否正在运行
   * @returns 取消订阅的函数
   */
  subscribe(callback: StatusChangeCallback): () => void {
    this.listeners.add(callback);
    // 立即通知当前状态
    callback(this.isReceivingMessages);
    return () => this.listeners.delete(callback);
  }

  /**
   * 通知所有监听器状态变化
   */
  private notifyListeners() {
    const isRunning = this.isReceivingMessages;
    this.listeners.forEach(callback => {
      try {
        callback(isRunning);
      } catch (error) {
        console.error('SimpleSyncManager: Error in listener callback:', error);
      }
    });
  }

  /**
   * 启动同步 - 创建并订阅ShapeStream
   */
  async startSync(messageProcessor?: (shapeName: string, messages: any[]) => Promise<void>): Promise<void> {
    console.log('[SimpleSyncManager] 启动同步');
    
    // 如果提供了消息处理器，设置它
    if (messageProcessor) {
      this.messageProcessor = messageProcessor;
    }
    
    // 先停止现有订阅
    this.stopSync();
    
    try {
      // 创建新的ShapeStream订阅
      await this.createShapeStreams();
      
      // 开始订阅所有流
      this.subscribeToStreams();
      
      console.log(`[SimpleSyncManager] 已创建 ${this.shapeStreams.length} 个订阅`);
    } catch (error) {
      console.error('[SimpleSyncManager] 启动同步失败:', error);
      this.updateMessageStatus(false);
      throw error;
    }
  }

  /**
   * 停止同步 - 取消所有订阅
   */
  stopSync(): void {
    console.log('[SimpleSyncManager] 停止同步');
    
    // 取消所有订阅
    this.shapeStreams.forEach(stream => {
      try {
        stream.unsubscribeAll();
      } catch (error) {
        console.error('[SimpleSyncManager] 取消订阅时出错:', error);
      }
    });
    
    // 清空流数组
    this.shapeStreams = [];
    
    // 更新状态
    this.updateMessageStatus(false);
  }

  /**
   * 创建ShapeStream实例
   */
  private async createShapeStreams(): Promise<void> {
    const electricProxyUrl = process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL;
    if (!electricProxyUrl) {
      throw new Error("NEXT_PUBLIC_ELECTRIC_PROXY_URL is not set.");
    }

    // 获取认证令牌
    const { getCachedAuthToken } = await import('../auth');
    const token = getCachedAuthToken();
    if (!token) {
      throw new Error("Authentication token is not available for sync.");
    }

    // 定义需要同步的表
    const shapes = [
      {
        name: "lists",
        columns: ["id", "name", "sort_order", "is_hidden", "modified"],
      },
      {
        name: "todos", 
        columns: [
          "id", "title", "completed", "deleted", "sort_order", "due_date",
          "content", "tags", "priority", "created_time", "completed_time",
          "start_date", "list_id", "repeat", "reminder", "is_recurring",
          "recurring_parent_id", "instance_number", "next_due_date",
          "goal_id", "sort_order_in_goal",
        ],
      },
      {
        name: "goals",
        columns: [
          "id", "name", "description", "list_id", "start_date", "due_date",
          "priority", "created_time", "is_archived",
        ],
      },
    ];

    // 创建ShapeStream实例
    this.shapeStreams = shapes.map(shape => 
      new ShapeStream({
        url: `${electricProxyUrl}/v1/shape`,
        params: { 
          table: shape.name, 
          columns: shape.columns 
        },
        subscribe: false,
        headers: { 
          Authorization: `Bearer ${token}` 
        },
      })
    );
  }

  /**
   * 订阅所有ShapeStream
   */
  private subscribeToStreams(): void {
    this.shapeStreams.forEach((stream, index) => {
      const shapeName = this.getShapeNameByIndex(index);
      
      stream.subscribe(
        (messages) => this.handleMessages(shapeName, messages),
        (error) => this.handleError(shapeName, error)
      );
    });
  }

  /**
   * 处理收到的消息
   */
  private async handleMessages(shapeName: string, messages: any[]): Promise<void> {
    if (!messages?.length) return;
    
    console.log(`[SimpleSyncManager] ${shapeName} 收到 ${messages.length} 条消息`);
    
    // 更新消息接收状态
    this.updateMessageStatus(true);
    
    // 如果设置了消息处理器，使用它；否则使用默认处理
    if (this.messageProcessor) {
      try {
        await this.messageProcessor(shapeName, messages);
      } catch (error) {
        console.error(`[SimpleSyncManager] 消息处理失败 (${shapeName}):`, error);
      }
    } else {
      // 默认处理消息（占位符）
      this.processMessages(shapeName, messages);
    }
  }

  /**
   * 处理订阅错误
   */
  private handleError(shapeName: string, error: unknown): void {
    console.error(`[SimpleSyncManager] ${shapeName} 订阅错误:`, error);
    
    // 错误时更新状态为未接收消息
    this.updateMessageStatus(false);
  }

  /**
   * 更新消息接收状态
   */
  private updateMessageStatus(isReceiving: boolean): void {
    const wasReceiving = this.isReceivingMessages;
    this.isReceivingMessages = isReceiving;
    this.lastMessageTime = isReceiving ? Date.now() : this.lastMessageTime;
    
    // 状态变化时通知监听器
    if (wasReceiving !== isReceiving) {
      this.notifyListeners();
    }
    
    // 重置超时检查
    this.resetMessageTimeout();
  }

  /**
   * 设置消息超时检查
   */
  private setupMessageTimeoutCheck(): void {
    // 定期检查是否超时无消息
    setInterval(() => {
      if (this.isReceivingMessages && this.lastMessageTime) {
        const timeSinceLastMessage = Date.now() - this.lastMessageTime;
        if (timeSinceLastMessage > this.MESSAGE_TIMEOUT) {
          console.warn('[SimpleSyncManager] 消息超时，更新状态为未接收');
          this.updateMessageStatus(false);
        }
      }
    }, 10000); // 每10秒检查一次
  }

  /**
   * 重置消息超时计时器
   */
  private resetMessageTimeout(): void {
    if (this.messageTimeoutId) {
      clearTimeout(this.messageTimeoutId);
    }
    
    if (this.isReceivingMessages) {
      this.messageTimeoutId = setTimeout(() => {
        console.warn('[SimpleSyncManager] 消息接收超时');
        this.updateMessageStatus(false);
      }, this.MESSAGE_TIMEOUT);
    }
  }

  /**
   * 根据索引获取表名
   */
  private getShapeNameByIndex(index: number): string {
    const names = ["lists", "todos", "goals"];
    return names[index] || `shape_${index}`;
  }

  /**
   * 处理具体的消息内容（占位符方法）
   */
  private processMessages(shapeName: string, messages: unknown[]): void {
    // 这里可以添加具体的消息处理逻辑
    // 目前只是记录日志，实际处理逻辑可以在后续任务中实现
    console.log(`[SimpleSyncManager] 处理 ${shapeName} 的 ${messages.length} 条消息`);
  }

  /**
   * 获取当前状态信息
   */
  getStatus() {
    return {
      isReceivingMessages: this.isReceivingMessages,
      lastMessageTime: this.lastMessageTime,
      streamCount: this.shapeStreams.length,
      hasActiveStreams: this.shapeStreams.length > 0,
    };
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    console.log('[SimpleSyncManager] 清理资源');
    
    // 停止同步
    this.stopSync();
    
    // 清理超时计时器
    if (this.messageTimeoutId) {
      clearTimeout(this.messageTimeoutId);
      this.messageTimeoutId = null;
    }
    
    // 清空监听器
    this.listeners.clear();
  }
}

// 导出单例实例
export const simpleSyncManager = new SimpleSyncManager();