// lib/sync/BatchSyncProcessor.ts
import { ChangeRecord, SyncResult, ChangeSet, ListChange, TodoChange, GoalChange, RetryConfig, DEFAULT_RETRY_CONFIG } from './types';
import { SyncQueueManager } from './SyncQueueManager';
import { getAuthToken } from '../../lib/auth';
import { RetryStrategy, ExponentialBackoffStrategy } from './RetryStrategy';

export interface SyncProgressCallback {
  (processed: number, total: number): void;
}

export interface BatchSyncProcessor {
  // 处理同步队列
  processSyncQueue(progressCallback?: SyncProgressCallback): Promise<SyncResult[]>;
  
  // 批量同步变更
  syncChanges(changes: ChangeRecord[], progressCallback?: SyncProgressCallback): Promise<SyncResult[]>;
  
  // 处理单个变更
  syncSingleChange(change: ChangeRecord): Promise<SyncResult>;
  
  // 重试失败的变更
  retryFailedChanges(progressCallback?: SyncProgressCallback): Promise<SyncResult[]>;
  
  // 设置批处理大小
  setBatchSize(size: number): void;
  
  // 获取当前批处理大小
  getBatchSize(): number;
}

export class BatchSyncProcessorImpl implements BatchSyncProcessor {
  private batchSize = 20;
  private retryConfig: RetryConfig = DEFAULT_RETRY_CONFIG;
  private retryStrategy: RetryStrategy;
  private writeServerUrl: string;

  constructor(
    private syncQueueManager: SyncQueueManager,
    retryConfig?: Partial<RetryConfig>
  ) {
    if (retryConfig) {
      this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    }
    
    // 创建重试策略
    this.retryStrategy = new ExponentialBackoffStrategy(this.retryConfig);
    
    // 获取 write-server URL
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!baseUrl) {
      throw new Error('NEXT_PUBLIC_SUPABASE_URL environment variable is not set');
    }
    this.writeServerUrl = `${baseUrl}/functions/v1/write-server`;
  }

  async processSyncQueue(progressCallback?: SyncProgressCallback): Promise<SyncResult[]> {
    try {
      console.log('Starting sync queue processing...');
      
      // 获取待同步的变更
      const pendingChanges = await this.syncQueueManager.getPendingChanges(this.batchSize);
      
      if (pendingChanges.length === 0) {
        console.log('No pending changes to sync');
        if (progressCallback) {
          progressCallback(0, 0);
        }
        return [];
      }

      console.log(`Processing ${pendingChanges.length} pending changes`);
      
      // 批量同步变更
      const results = await this.syncChanges(pendingChanges, progressCallback);
      
      // 更新同步结果
      await this.updateSyncResults(results);
      
      console.log(`Sync queue processing completed. Success: ${results.filter(r => r.success).length}, Failed: ${results.filter(r => !r.success).length}`);
      
      return results;
    } catch (error) {
      console.error('Failed to process sync queue:', error);
      throw error;
    }
  }

  async syncChanges(changes: ChangeRecord[], progressCallback?: SyncProgressCallback): Promise<SyncResult[]> {
    if (changes.length === 0) {
      if (progressCallback) {
        progressCallback(0, 0);
      }
      return [];
    }

    try {
      // 将变更转换为 write-server 期望的格式
      const changeSet = this.convertToChangeSet(changes);
      
      // 调用 write-server API
      const success = await this.callWriteServer(changeSet);
      
      if (success) {
        // 如果批量同步成功，所有变更都标记为成功
        if (progressCallback) {
          progressCallback(changes.length, changes.length);
        }
        
        return changes.map(change => ({
          changeId: change.id,
          success: true,
          retryable: false
        }));
      } else {
        // 如果批量同步失败，尝试单个同步
        console.log('Batch sync failed, trying individual sync...');
        return await this.syncChangesIndividually(changes, progressCallback);
      }
    } catch (error) {
      console.error('Failed to sync changes:', error);
      
      // 如果是网络错误，标记为可重试
      const isRetryable = this.isRetryableError(error);
      
      if (progressCallback) {
        progressCallback(0, changes.length);
      }
      
      return changes.map(change => ({
        changeId: change.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: isRetryable
      }));
    }
  }

  async syncSingleChange(change: ChangeRecord): Promise<SyncResult> {
    try {
      // 将单个变更转换为 ChangeSet
      const changeSet = this.convertToChangeSet([change]);
      
      // 调用 write-server API
      const success = await this.callWriteServer(changeSet);
      
      return {
        changeId: change.id,
        success,
        retryable: !success
      };
    } catch (error) {
      console.error(`Failed to sync single change ${change.id}:`, error);
      
      return {
        changeId: change.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        retryable: this.isRetryableError(error)
      };
    }
  }

  async retryFailedChanges(progressCallback?: SyncProgressCallback): Promise<SyncResult[]> {
    try {
      console.log('Retrying failed changes...');
      
      // 获取可重试的失败变更
      const failedChanges = await this.getRetryableFailedChanges();
      
      if (failedChanges.length === 0) {
        console.log('No failed changes to retry');
        if (progressCallback) {
          progressCallback(0, 0);
        }
        return [];
      }

      console.log(`Retrying ${failedChanges.length} failed changes`);
      
      // 重新同步失败的变更
      const results = await this.syncChanges(failedChanges, progressCallback);
      
      // 更新同步结果
      await this.updateSyncResults(results);
      
      return results;
    } catch (error) {
      console.error('Failed to retry failed changes:', error);
      throw error;
    }
  }

  setBatchSize(size: number): void {
    this.batchSize = Math.max(1, Math.min(100, size)); // 限制在 1-100 之间
    console.log(`Batch size set to ${this.batchSize}`);
  }

  getBatchSize(): number {
    return this.batchSize;
  }

  // 私有方法：将变更记录转换为 write-server 期望的格式
  private convertToChangeSet(changes: ChangeRecord[]): ChangeSet {
    const lists: ListChange[] = [];
    const todos: TodoChange[] = [];
    const goals: GoalChange[] = [];

    for (const change of changes) {
      if (change.table_name === 'lists') {
        lists.push(this.convertToListChange(change));
      } else if (change.table_name === 'todos') {
        todos.push(this.convertToTodoChange(change));
      } else if (change.table_name === 'goals') {
        goals.push(this.convertToGoalChange(change));
      }
    }

    return { lists, todos, goals };
  }

  private convertToListChange(change: ChangeRecord): ListChange {
    const data = change.data;
    const isNew = change.operation === 'insert';
    
    // 根据操作类型确定修改的列
    let modifiedColumns: string[] = [];
    if (change.operation === 'insert') {
      modifiedColumns = Object.keys(data).filter(key => key !== 'id');
    } else if (change.operation === 'update') {
      modifiedColumns = Object.keys(data).filter(key => key !== 'id' && data[key] !== undefined);
    } else if (change.operation === 'delete') {
      modifiedColumns = []; // 删除操作不需要修改列信息
    }

    // 构建ListChange对象，只包含实际存在的字段
    const listChange: ListChange = {
      id: data.id as string,
      modified_columns: modifiedColumns,
      new: isNew
    };

    // 只有当字段在数据中存在时才添加到变更对象中
    if ('name' in data && data.name !== undefined) {
      listChange.name = data.name as string;
    }
    if ('sort_order' in data && data.sort_order !== undefined) {
      listChange.sort_order = data.sort_order as number;
    }
    if ('is_hidden' in data && data.is_hidden !== undefined) {
      listChange.is_hidden = data.is_hidden as boolean;
    }

    return listChange;
  }

  private convertToTodoChange(change: ChangeRecord): TodoChange {
    const data = { ...change.data }; // Create a mutable copy
    const isNew = change.operation === 'insert';
    let modifiedColumns: string[] = [];

    if (change.operation === 'insert') {
      modifiedColumns = Object.keys(data).filter(key => key !== 'id');
    } else if (change.operation === 'update') {
      modifiedColumns = Object.keys(data).filter(key => key !== 'id' && data[key] !== undefined);
    } else if (change.operation === 'delete') {
      // This is a permanent delete. Signal it to the server by setting
      // `deleted: true` and having an empty `modified_columns` array.
      modifiedColumns = [];
      data.deleted = true;
    }

    // 构建TodoChange对象，只包含实际存在的字段
    const todoChange: TodoChange = {
      id: data.id as string,
      modified_columns: modifiedColumns,
      new: isNew
    };

    // 只有当字段在数据中存在时才添加到变更对象中
    const todoFields = [
      'title', 'completed', 'deleted', 'sort_order', 'due_date', 'content',
      'tags', 'priority', 'created_time', 'completed_time', 'start_date', 'list_id',
      // 重复任务相关字段
      'repeat', 'reminder', 'is_recurring', 'recurring_parent_id', 'instance_number', 'next_due_date',
      // 目标关联字段
      'goal_id', 'sort_order_in_goal'
    ];

    for (const field of todoFields) {
      if (field in data && data[field] !== undefined) {
        (todoChange as any)[field] = data[field];
      }
    }

    return todoChange;
  }

  private convertToGoalChange(change: ChangeRecord): GoalChange {
    const data = change.data;
    const isNew = change.operation === 'insert';
    
    let modifiedColumns: string[] = [];
    if (change.operation === 'insert') {
      modifiedColumns = Object.keys(data).filter(key => key !== 'id');
    } else if (change.operation === 'update') {
      modifiedColumns = Object.keys(data).filter(key => key !== 'id' && data[key] !== undefined);
    } else if (change.operation === 'delete') {
      modifiedColumns = ['is_archived']; // 存档操作
    }

    // 构建GoalChange对象，只包含实际存在的字段
    const goalChange: GoalChange = {
      id: data.id as string,
      modified_columns: modifiedColumns,
      new: isNew
    };

    // 只有当字段在数据中存在时才添加到变更对象中
    const goalFields = [
      'name', 'description', 'list_id', 'start_date', 'due_date',
      'priority', 'created_time', 'is_archived'
    ];

    for (const field of goalFields) {
      if (field in data && data[field] !== undefined) {
        (goalChange as any)[field] = data[field];
      }
    }

    return goalChange;
  }

  // 私有方法：调用 write-server API
  private async callWriteServer(changeSet: ChangeSet): Promise<boolean> {
    try {
      // 获取认证 token
      const token = await getAuthToken();
      
      const response = await fetch(this.writeServerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(changeSet)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Write server error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      return result.success === true;
    } catch (error) {
      console.error('Write server call failed:', error);
      throw error;
    }
  }

  // 私有方法：单个同步变更
  private async syncChangesIndividually(changes: ChangeRecord[], progressCallback?: SyncProgressCallback): Promise<SyncResult[]> {
    const results: SyncResult[] = [];
    let processedCount = 0;
    const totalCount = changes.length;
    
    for (const change of changes) {
      const result = await this.syncSingleChange(change);
      results.push(result);
      
      processedCount++;
      
      if (progressCallback) {
        progressCallback(processedCount, totalCount);
      }
      
      // 如果单个同步也失败，添加延迟避免过于频繁的请求
      if (!result.success) {
        await this.delay(1000);
      }
    }
    
    return results;
  }

  // 私有方法：获取可重试的失败变更
  private async getRetryableFailedChanges(): Promise<ChangeRecord[]> {
    // 这里应该查询状态为 'failed' 且重试次数未超过最大限制的变更
    // 为了简化，我们重用 getPendingChanges，但实际应该有专门的查询
    const allChanges = await this.syncQueueManager.getPendingChanges(this.batchSize * 2);
    return allChanges.filter(change => 
      change.status === 'failed' && 
      change.retry_count < change.max_retries
    );
  }

  // 私有方法：更新同步结果
  private async updateSyncResults(results: SyncResult[]): Promise<void> {
    for (const result of results) {
      if (result.success) {
        await this.syncQueueManager.updateChangeStatus(result.changeId, 'completed');
        // 可选：立即删除已完成的变更
        await this.syncQueueManager.removeCompletedChange(result.changeId);
      } else {
        await this.syncQueueManager.updateChangeStatus(
          result.changeId, 
          'failed', 
          result.error
        );
      }
    }
  }

  // 私有方法：检查错误是否可重试
  private isRetryableError(error: unknown): boolean {
    return this.retryStrategy.shouldRetry(error, 0);
  }

  // 私有方法：延迟函数
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}