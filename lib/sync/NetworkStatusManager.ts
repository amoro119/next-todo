// lib/sync/NetworkStatusManager.ts
import { NetworkMonitorImpl, NetworkMonitor, NetworkStatusCache } from './NetworkMonitor';

/**
 * 网络状态管理器 - 单例模式
 * 提供全局的网络状态监控和管理功能
 */
export class NetworkStatusManager {
  private static instance: NetworkStatusManager;
  private networkMonitor: NetworkMonitor;
  private isInitialized = false;

  private constructor() {
    this.networkMonitor = new NetworkMonitorImpl();
  }

  /**
   * 获取单例实例
   */
  static getInstance(): NetworkStatusManager {
    if (!NetworkStatusManager.instance) {
      NetworkStatusManager.instance = new NetworkStatusManager();
    }
    return NetworkStatusManager.instance;
  }

  /**
   * 初始化网络状态管理器
   * 应该在应用启动时调用
   */
  initialize(): void {
    if (this.isInitialized) {
      console.warn('NetworkStatusManager: Already initialized');
      return;
    }

    console.log('NetworkStatusManager: Initializing network status monitoring');
    this.networkMonitor.startMonitoring();
    this.isInitialized = true;

    // 注册网络状态变化监听器
    this.networkMonitor.onNetworkChange((isOnline) => {
      console.log(`NetworkStatusManager: Network status changed to ${isOnline ? 'online' : 'offline'}`);
      
      // 触发自定义事件，让其他组件可以监听
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('networkStatusChange', {
          detail: { isOnline }
        }));
      }
    });
  }

  /**
   * 清理资源
   * 应该在应用关闭时调用
   */
  cleanup(): void {
    if (!this.isInitialized) return;

    console.log('NetworkStatusManager: Cleaning up network status monitoring');
    this.networkMonitor.stopMonitoring();
    this.isInitialized = false;
  }

  /**
   * 获取当前网络状态
   */
  isOnline(): boolean {
    return this.networkMonitor.isOnline();
  }

  /**
   * 测试服务器连接
   */
  async testServerConnection(): Promise<boolean> {
    return this.networkMonitor.testServerConnection();
  }

  /**
   * 获取网络状态统计信息
   */
  getNetworkStats(): NetworkStatusCache | null {
    if ('getNetworkStats' in this.networkMonitor) {
      return (this.networkMonitor as any).getNetworkStats();
    }
    return null;
  }

  /**
   * 强制刷新网络状态
   */
  async refreshNetworkStatus(): Promise<boolean> {
    if ('refreshNetworkStatus' in this.networkMonitor) {
      return (this.networkMonitor as any).refreshNetworkStatus();
    }
    return this.networkMonitor.testServerConnection();
  }

  /**
   * 清除网络状态缓存
   */
  clearNetworkCache(): void {
    if ('clearNetworkCache' in this.networkMonitor) {
      (this.networkMonitor as any).clearNetworkCache();
    }
  }

  /**
   * 注册网络状态变化回调
   */
  onNetworkChange(callback: (isOnline: boolean) => void): void {
    this.networkMonitor.onNetworkChange(callback);
  }

  /**
   * 获取网络监控器实例（用于高级用法）
   */
  getNetworkMonitor(): NetworkMonitor {
    return this.networkMonitor;
  }
}

// 导出单例实例
export const networkStatusManager = NetworkStatusManager.getInstance();