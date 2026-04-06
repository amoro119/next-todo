// lib/sync/SimpleSyncManager.ts
// 基于消息流的简化同步状态管理器

import { ShapeStream } from "@electric-sql/client";
import { 
  SimpleSyncManagerInterface, 
  MessageHandler, 
  ErrorHandler, 
  StatusChangeCallback 
} from './types';
import { 
  handleSyncStartupError, 
  clearSyncStateFromStorage, 
  calculateBackoffDelay,
  shouldClearStateBeforeRetry 
} from './syncErrorHandling';

export class SimpleSyncManager implements SimpleSyncManagerInterface {
  public shapeStreams: ShapeStream[] = [];
  public isReceivingMessages: boolean = false;
  public lastMessageTime: number | null = null;
  
  private listeners: Set<StatusChangeCallback> = new Set();
  private messageTimeoutId: NodeJS.Timeout | null = null;
  private readonly MESSAGE_TIMEOUT = 60000;
  private messageProcessor?: (shapeName: string, messages: unknown[]) => Promise<void>;
  private unsubscribeFunctions: (() => void)[] = [];
  
  // Retry state
  private retryAttempt: number = 0;
  private readonly MAX_RETRY_ATTEMPTS = 5;
  private retryTimeoutId: NodeJS.Timeout | null = null;
  private isRetrying: boolean = false;

  constructor() {
    this.setupMessageTimeoutCheck();
  }

  setMessageProcessor(processor: (shapeName: string, messages: any[]) => Promise<void>): void {
    this.messageProcessor = processor;
  }

  subscribe(callback: StatusChangeCallback): () => void {
    this.listeners.add(callback);
    callback(this.isReceivingMessages);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners() {
    const isRunning = this.isReceivingMessages || this.isRetrying;
    this.listeners.forEach(callback => {
      try {
        callback(isRunning);
      } catch (error) {
        console.error('SimpleSyncManager: Error in listener callback:', error);
      }
    });
  }

  async startSync(messageProcessor?: (shapeName: string, messages: any[]) => Promise<void>): Promise<void> {
    console.log('[SimpleSyncManager] Starting sync');
    
    if (messageProcessor) {
      this.messageProcessor = messageProcessor;
    }
    
    this.stopSync();
    this.isRetrying = false;
    
    try {
      await this.createShapeStreams();
      this.subscribeToStreams();
      this.retryAttempt = 0;
      console.log(`[SimpleSyncManager] Created ${this.shapeStreams.length} subscriptions`);
    } catch (error) {
      console.error('[SimpleSyncManager] Start sync failed:', error);
      this.updateMessageStatus(false);
      
      // Handle error with retry logic
      const errorResult = handleSyncStartupError(error as Error);
      if (errorResult.canRetry && this.retryAttempt < this.MAX_RETRY_ATTEMPTS) {
        this.scheduleRetry(errorResult.retryDelay || 2000);
      }
      
      throw error;
    }
  }

  /**
   * Schedule a retry with exponential backoff
   */
  private scheduleRetry(delay?: number): void {
    if (this.isRetrying) return;
    
    this.isRetrying = true;
    this.retryAttempt++;
    
    const retryDelay = delay || calculateBackoffDelay(this.retryAttempt - 1);
    console.log(`[SimpleSyncManager] Scheduling retry ${this.retryAttempt}/${this.MAX_RETRY_ATTEMPTS} in ${retryDelay}ms`);
    
    this.notifyListeners();
    
    this.retryTimeoutId = setTimeout(async () => {
      try {
        console.log(`[SimpleSyncManager] Executing retry ${this.retryAttempt}`);
        
        // Clear sync state before retry for certain error types
        if (this.retryAttempt === 1 || this.retryAttempt % 2 === 0) {
          console.log('[SimpleSyncManager] Clearing sync state before retry');
          clearSyncStateFromStorage();
        }
        
        // Refresh auth token every 2 retries
        if (this.retryAttempt % 2 === 0) {
          console.log('[SimpleSyncManager] Refreshing auth token');
          const { invalidateToken, getAuthToken } = await import('../auth');
          invalidateToken();
          await getAuthToken();
        }
        
        await this.startSync();
        console.log('[SimpleSyncManager] Retry successful');
        this.retryAttempt = 0;
        this.isRetrying = false;
      } catch (error) {
        console.error(`[SimpleSyncManager] Retry ${this.retryAttempt} failed:`, error);
        this.isRetrying = false;
        
        // Continue retrying if we haven't reached max attempts
        if (this.retryAttempt < this.MAX_RETRY_ATTEMPTS) {
          const errorResult = handleSyncStartupError(error as Error);
          if (errorResult.canRetry) {
            this.scheduleRetry(errorResult.retryDelay);
          }
        } else {
          console.error('[SimpleSyncManager] Max retry attempts reached');
        }
      }
    }, retryDelay);
  }

  stopSync(): void {
    console.log('[SimpleSyncManager] Stopping sync');
    
    // Clear any pending retry
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    
    this.shapeStreams.forEach(stream => {
      try {
        stream.unsubscribeAll();
      } catch (error) {
        console.error('[SimpleSyncManager] Error unsubscribing:', error);
      }
    });
    
    this.shapeStreams = [];
    this.updateMessageStatus(false);
    this.isRetrying = false;
  }

  private async createShapeStreams(): Promise<void> {
    const electricProxyUrl = process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL;
    if (!electricProxyUrl) {
      throw new Error("NEXT_PUBLIC_ELECTRIC_PROXY_URL is not set.");
    }

    const { getCachedAuthToken } = await import('../auth');
    const token = getCachedAuthToken();
    if (!token) {
      throw new Error("Authentication token is not available for sync.");
    }

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

  private subscribeToStreams(): void {
    this.shapeStreams.forEach((stream, index) => {
      const shapeName = this.getShapeNameByIndex(index);
      
      stream.subscribe(
        (messages) => this.handleMessages(shapeName, messages),
        (error) => this.handleError(shapeName, error)
      );
    });
  }

  private async handleMessages(shapeName: string, messages: any[]): Promise<void> {
    if (!messages?.length) return;
    
    console.log(`[SimpleSyncManager] ${shapeName} received ${messages.length} messages`);
    this.updateMessageStatus(true);
    
    if (this.messageProcessor) {
      try {
        await this.messageProcessor(shapeName, messages);
      } catch (error) {
        console.error(`[SimpleSyncManager] Message processing failed (${shapeName}):`, error);
      }
    } else {
      this.processMessages(shapeName, messages);
    }
  }

  private handleError(shapeName: string, error: unknown): void {
    console.error(`[SimpleSyncManager] ${shapeName} subscription error:`, error);
    this.updateMessageStatus(false);
    
    // Check if we should retry
    const errorResult = handleSyncStartupError(error as Error);
    if (errorResult.canRetry && this.retryAttempt < this.MAX_RETRY_ATTEMPTS && !this.isRetrying) {
      console.log(`[SimpleSyncManager] Scheduling retry due to ${shapeName} error`);
      this.scheduleRetry(errorResult.retryDelay);
    }
  }

  private updateMessageStatus(isReceiving: boolean): void {
    const wasReceiving = this.isReceivingMessages;
    this.isReceivingMessages = isReceiving;
    this.lastMessageTime = isReceiving ? Date.now() : this.lastMessageTime;
    
    if (wasReceiving !== isReceiving) {
      this.notifyListeners();
    }
    
    this.resetMessageTimeout();
  }

  private setupMessageTimeoutCheck(): void {
    setInterval(() => {
      if (this.isReceivingMessages && this.lastMessageTime) {
        const timeSinceLastMessage = Date.now() - this.lastMessageTime;
        if (timeSinceLastMessage > this.MESSAGE_TIMEOUT) {
          console.warn('[SimpleSyncManager] Message timeout, updating status');
          this.updateMessageStatus(false);
        }
      }
    }, 10000);
  }

  private resetMessageTimeout(): void {
    if (this.messageTimeoutId) {
      clearTimeout(this.messageTimeoutId);
    }
    
    if (this.isReceivingMessages) {
      this.messageTimeoutId = setTimeout(() => {
        console.warn('[SimpleSyncManager] Message receive timeout');
        this.updateMessageStatus(false);
      }, this.MESSAGE_TIMEOUT);
    }
  }

  private getShapeNameByIndex(index: number): string {
    const names = ["lists", "todos", "goals"];
    return names[index] || `shape_${index}`;
  }

  private processMessages(shapeName: string, messages: unknown[]): void {
    console.log(`[SimpleSyncManager] Processing ${messages.length} messages for ${shapeName}`);
  }

  getStatus() {
    return {
      isReceivingMessages: this.isReceivingMessages,
      isRetrying: this.isRetrying,
      retryAttempt: this.retryAttempt,
      lastMessageTime: this.lastMessageTime,
      streamCount: this.shapeStreams.length,
      hasActiveStreams: this.shapeStreams.length > 0,
    };
  }

  cleanup(): void {
    console.log('[SimpleSyncManager] Cleaning up');
    this.stopSync();
    
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }
    
    if (this.messageTimeoutId) {
      clearTimeout(this.messageTimeoutId);
      this.messageTimeoutId = null;
    }
    
    this.listeners.clear();
  }
}

export const simpleSyncManager = new SimpleSyncManager();