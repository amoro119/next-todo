// lib/sync/ShapeSyncManager.ts
// Shape订阅管理器 - 统一管理所有ElectricSQL Shape订阅的生命周期

export class ShapeSyncManager {
  private subscriptions: Map<string, { 
    subscribe: () => void; 
    unsubscribeAll: () => void;
    isSubscribed: boolean;
  }> = new Map();
  public isStopped = false;
  private listeners: Set<(isStopped: boolean) => void> = new Set();

  /**
   * 订阅状态变化
   * @param callback 状态变化回调函数
   * @returns 取消订阅的函数
   */
  subscribe(callback: (isStopped: boolean) => void): () => void {
    this.listeners.add(callback);
    // 立即通知当前状态
    callback(this.isStopped);
    return () => this.listeners.delete(callback);
  }

  /**
   * 通知所有监听器状态变化
   */
  private notifyListeners() {
    this.listeners.forEach(callback => {
      try {
        callback(this.isStopped);
      } catch (error) {
        console.error('ShapeSyncManager: Error in listener callback:', error);
      }
    });
  }

  /**
   * 注册Shape订阅
   * @param name 订阅名称
   * @param controller 订阅控制器，包含subscribe和unsubscribeAll方法
   */
  register(name: string, controller: { 
    subscribe: () => void; 
    unsubscribeAll: () => void;
  }) {
    this.subscriptions.set(name, {
      ...controller,
      isSubscribed: true
    });
    console.log(`[ShapeSyncManager] 已注册订阅: ${name}`);
  }

  /**
   * 停止所有订阅
   */
  stopAll() {
    if (this.isStopped) {
      console.log('[ShapeSyncManager] 同步已暂停，无需重复操作');
      return;
    }
    
    console.log('[ShapeSyncManager] 暂停所有订阅');
    this.isStopped = true;
    
    // 取消订阅所有订阅
    this.subscriptions.forEach((sub, name) => {
      try {
        if (sub.isSubscribed) {
          console.log(`[ShapeSyncManager] 取消订阅: ${name}`);
          sub.unsubscribeAll();
          sub.isSubscribed = false;
        }
      } catch (error) {
        console.error(`[ShapeSyncManager] 取消订阅 ${name} 时出错:`, error);
      }
    });
    
    this.notifyListeners();
  }

  /**
   * 启动所有订阅
   */
  startAll() {
    if (!this.isStopped) {
      console.log('[ShapeSyncManager] 同步已在运行，无需重复操作');
      return;
    }
    
    console.log('[ShapeSyncManager] 启动所有订阅');
    this.isStopped = false;
    
    // 重新订阅所有订阅
    this.subscriptions.forEach((sub, name) => {
      try {
        if (!sub.isSubscribed) {
          console.log(`[ShapeSyncManager] 订阅: ${name}`);
          sub.subscribe();
          sub.isSubscribed = true;
        }
      } catch (error) {
        console.error(`[ShapeSyncManager] 订阅 ${name} 时出错:`, error);
      }
    });
    
    this.notifyListeners();
  }

  /**
   * 获取当前状态
   */
  getStatus() {
    return {
      isStopped: this.isStopped,
      subscriptionCount: this.subscriptions.size
    };
  }

  /**
   * 清理所有订阅（用于应用关闭时）
   */
  cleanup() {
    console.log('[ShapeSyncManager] 清理所有订阅');
    this.stopAll();
    this.subscriptions.clear();
    this.listeners.clear();
  }
}

// 导出单例实例
export const shapeSyncManager = new ShapeSyncManager();