// lib/sync/QueueMaintenance.ts
import { SyncQueueManager } from './SyncQueueManager';

/**
 * 队列维护服务
 * 负责定期清理和维护同步队列
 */
export class QueueMaintenance {
  private cleanupInterval?: NodeJS.Timeout;
  private isActive = false;
  
  constructor(
    private syncQueueManager: SyncQueueManager,
    private options: {
      // 清理已完成变更的间隔（毫秒）
      completedCleanupInterval: number;
      // 保留已完成变更的时间（小时）
      completedRetentionHours: number;
      // 清理失败变更的间隔（毫秒）
      failedCleanupInterval: number;
    } = {
      completedCleanupInterval: 6 * 60 * 60 * 1000, // 6小时
      completedRetentionHours: 24, // 24小时
      failedCleanupInterval: 24 * 60 * 60 * 1000 // 24小时
    }
  ) {}
  
  /**
   * 启动队列维护服务
   */
  start(): void {
    if (this.isActive) return;
    
    console.log('QueueMaintenance: Starting queue maintenance service');
    this.isActive = true;
    
    // 立即执行一次清理
    this.runMaintenance();
    
    // 设置定期清理
    this.cleanupInterval = setInterval(() => {
      this.runMaintenance();
    }, this.options.completedCleanupInterval);
  }
  
  /**
   * 停止队列维护服务
   */
  stop(): void {
    if (!this.isActive) return;
    
    console.log('QueueMaintenance: Stopping queue maintenance service');
    this.isActive = false;
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }
  
  /**
   * 手动触发队列维护
   */
  async runMaintenance(): Promise<void> {
    try {
      console.log('QueueMaintenance: Running queue maintenance');
      
      // 清理已完成的变更
      const completedCount = await this.syncQueueManager.cleanupCompletedChanges(
        this.options.completedRetentionHours
      );
      
      // 清理失败的变更
      await this.syncQueueManager.cleanupFailedChanges();
      
      console.log(`QueueMaintenance: Maintenance completed. Removed ${completedCount} completed changes.`);
    } catch (error) {
      console.error('QueueMaintenance: Error during maintenance:', error);
    }
  }
}