// lib/sync/SyncQueueManager.ts
import { PGlite } from '@electric-sql/pglite';
import { ChangeRecord, QueueStats, DatabaseOperation } from './types';

export interface SyncQueueManager {
  // 添加变更到队列
  addChange(change: Omit<ChangeRecord, 'id' | 'created_at' | 'updated_at'>): Promise<void>;
  
  // 从数据库操作创建变更记录
  createChangeFromOperation(operation: DatabaseOperation): Promise<void>;
  
  // 获取待同步的变更
  getPendingChanges(limit?: number): Promise<ChangeRecord[]>;
  
  // 更新变更状态
  updateChangeStatus(id: string, status: ChangeRecord['status'], error?: string): Promise<void>;
  
  // 删除已完成的变更
  removeCompletedChange(id: string): Promise<void>;
  
  // 获取队列统计信息
  getQueueStats(): Promise<QueueStats>;
  
  // 清理失败的变更（超过最大重试次数）
  cleanupFailedChanges(): Promise<void>;
  
  // 批量清理已完成的变更
  cleanupCompletedChanges(olderThanHours?: number): Promise<number>;
}

export class SyncQueueManagerImpl implements SyncQueueManager {
  constructor(private db: PGlite) {}

  async addChange(change: Omit<ChangeRecord, 'id' | 'created_at' | 'updated_at'>): Promise<void> {
    try {
      await this.db.query(`
        INSERT INTO sync_queue (
          table_name, operation, record_id, data, timestamp, 
          retry_count, max_retries, status, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        change.table_name,
        change.operation,
        change.record_id,
        JSON.stringify(change.data),
        change.timestamp,
        change.retry_count || 0,
        change.max_retries || 3,
        change.status || 'pending',
        change.error_message || null
      ]);
      
      console.log(`Added change to sync queue: ${change.operation} on ${change.table_name}:${change.record_id}`);
    } catch (error) {
      console.error('Failed to add change to sync queue:', error);
      throw error;
    }
  }

  async createChangeFromOperation(operation: DatabaseOperation): Promise<void> {
    const change: Omit<ChangeRecord, 'id' | 'created_at' | 'updated_at'> = {
      table_name: operation.table,
      operation: operation.operation,
      record_id: operation.id,
      data: operation.data,
      timestamp: operation.timestamp,
      retry_count: 0,
      max_retries: 3,
      status: 'pending'
    };
    
    await this.addChange(change);
  }

  async getPendingChanges(limit: number = 50): Promise<ChangeRecord[]> {
    try {
      const result = await this.db.query(`
        SELECT * FROM sync_queue 
        WHERE status = 'pending' 
        ORDER BY timestamp ASC 
        LIMIT $1
      `, [limit]);
      
      return result.rows.map((row: any) => ({
        ...row,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data
      })) as ChangeRecord[];
    } catch (error) {
      console.error('Failed to get pending changes:', error);
      throw error;
    }
  }

  async updateChangeStatus(id: string, status: ChangeRecord['status'], error?: string): Promise<void> {
    try {
      const updateFields = ['status = $2', 'updated_at = NOW()'];
      const values = [id, status];
      
      if (status === 'failed' && error) {
        updateFields.push('error_message = $3');
        values.push(error);
      }
      
      if (status === 'syncing' || status === 'failed') {
        updateFields.push('retry_count = retry_count + 1');
      }
      
      await this.db.query(`
        UPDATE sync_queue 
        SET ${updateFields.join(', ')}
        WHERE id = $1
      `, values);
      
      console.log(`Updated change ${id} status to ${status}`);
    } catch (error) {
      console.error('Failed to update change status:', error);
      throw error;
    }
  }

  async removeCompletedChange(id: string): Promise<void> {
    try {
      await this.db.query('DELETE FROM sync_queue WHERE id = $1', [id]);
      console.log(`Removed completed change ${id}`);
    } catch (error) {
      console.error('Failed to remove completed change:', error);
      throw error;
    }
  }

  async getQueueStats(): Promise<QueueStats> {
    try {
      const result = await this.db.query(`
        SELECT 
          status,
          COUNT(*) as count
        FROM sync_queue 
        GROUP BY status
      `);
      
      const stats: QueueStats = {
        pending: 0,
        syncing: 0,
        failed: 0,
        completed: 0,
        total: 0
      };
      
      for (const row of result.rows) {
        const status = (row as any).status as keyof QueueStats;
        const count = parseInt((row as any).count as string);
        if (status in stats) {
          stats[status] = count;
          stats.total += count;
        }
      }
      
      return stats;
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      throw error;
    }
  }

  async cleanupFailedChanges(): Promise<void> {
    try {
      const result = await this.db.query(`
        DELETE FROM sync_queue 
        WHERE status = 'failed' AND retry_count >= max_retries
      `);
      
      const affectedRows = (result as any).affectedRows || 0;
      console.log(`Cleaned up ${affectedRows} failed changes`);
    } catch (error) {
      console.error('Failed to cleanup failed changes:', error);
      throw error;
    }
  }

  async cleanupCompletedChanges(olderThanHours: number = 24): Promise<number> {
    try {
      const result = await this.db.query(`
        DELETE FROM sync_queue 
        WHERE status = 'completed' 
        AND updated_at < NOW() - INTERVAL '${olderThanHours} hours'
      `);
      
      const deletedCount = (result as any).affectedRows || 0;
      console.log(`Cleaned up ${deletedCount} completed changes older than ${olderThanHours} hours`);
      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup completed changes:', error);
      throw error;
    }
  }
}