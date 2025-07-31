// lib/sync/ShapeSyncManager.ts
// Shape同步管理器 - 集成Shape监控和自动重连功能

import { networkStatusManager } from './NetworkStatusManager';
import { ShapeMonitorConfig } from './NetworkMonitor';
import { getAuthToken } from '../auth';

export interface ShapeSyncConfig {
  table: string;
  columns: string[];
  gatekeeperUrl?: string;
  onData?: (data: any[]) => Promise<void>;
  onError?: (error: string) => void;
  onReconnect?: () => void;
  onDisconnect?: () => void;
}

export interface ShapeSyncStatus {
  isActive: boolean;
  lastSync: string;
  totalRecords: number;
  errors: string[];
  isConnected: boolean;
  lastSuccessfulConnection: string;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  responseTime?: number;
  lastError?: string;
}

/**
 * 安全的AbortController包装器
 */
class SafeAbortController {
  private controller: AbortController;
  private isAborted = false;

  constructor() {
    this.controller = new AbortController();
  }

  get signal() {
    return this.controller.signal;
  }

  abort(): void {
    if (this.isAborted) return;
    
    try {
      this.isAborted = true;
      this.controller.abort();
    } catch (error) {
      // 静默处理abort错误
      console.debug('SafeAbortController: Silent abort error:', error);
    }
  }

  get aborted(): boolean {
    return this.isAborted || this.controller.signal.aborted;
  }
}

/**
 * Shape同步管理器
 * 负责管理ElectricSQL Shape的同步和连接监控
 */
export class ShapeSyncManager {
  private static instance: ShapeSyncManager;
  private activeSyncs = new Map<string, {
    config: ShapeSyncConfig;
    status: ShapeSyncStatus;
    abortController?: SafeAbortController;
  }>();
  private isInitialized = false;

  private constructor() {}

  static getInstance(): ShapeSyncManager {
    if (!ShapeSyncManager.instance) {
      ShapeSyncManager.instance = new ShapeSyncManager();
    }
    return ShapeSyncManager.instance;
  }

  /**
   * 初始化Shape同步管理器
   */
  initialize(): void {
    if (this.isInitialized) {
      console.warn('ShapeSyncManager: Already initialized');
      return;
    }

    console.log('ShapeSyncManager: Initializing shape sync manager');

    // 添加全局错误处理器来捕获未处理的AbortError
    if (typeof window !== 'undefined') {
      window.addEventListener('unhandledrejection', (event) => {
        if (event.reason instanceof Error && event.reason.name === 'AbortError') {
          console.debug('ShapeSyncManager: Caught unhandled AbortError (this is normal)');
          event.preventDefault(); // 阻止错误冒泡到控制台
        }
      });
    }

    // 监听网络状态变化
    networkStatusManager.onNetworkChange((isOnline) => {
      console.log(`ShapeSyncManager: Network status changed - ${isOnline ? 'online' : 'offline'}`);
      
      if (isOnline) {
        // 网络恢复时，重新启动所有同步
        this.resumeAllSyncs();
      } else {
        // 网络断开时，暂停所有同步
        this.pauseAllSyncs();
      }
    });

    // 监听Shape连接状态变化
    if (networkStatusManager.isShapeMonitoringEnabled()) {
      networkStatusManager.onShapeConnectionChange((shapeKey, isConnected, error) => {
        console.log(`ShapeSyncManager: Shape connection status changed - ${shapeKey}: ${isConnected ? 'connected' : 'disconnected'}`);
        
        const syncInfo = this.activeSyncs.get(shapeKey);
        if (syncInfo) {
          // 更新连接状态
          syncInfo.status.isConnected = isConnected;
          
          if (isConnected) {
            // 连接恢复，重新开始同步
            console.log(`ShapeSyncManager: Resuming sync for ${shapeKey}`);
            this.startSync(shapeKey, syncInfo.config);
            syncInfo.config.onReconnect?.();
          } else {
            // 连接断开，暂停同步
            console.log(`ShapeSyncManager: Pausing sync for ${shapeKey}`);
            this.pauseSync(shapeKey);
            syncInfo.config.onDisconnect?.();
            
            if (error) {
              syncInfo.status.errors.push(error);
              syncInfo.config.onError?.(error);
            }
          }
        }
      });
    }

    this.isInitialized = true;
    console.log('ShapeSyncManager: Initialization complete');
  }

  /**
   * 添加Shape同步配置
   */
  addShapeSync(shapeKey: string, config: ShapeSyncConfig): void {
    console.log(`ShapeSyncManager: Adding shape sync - ${shapeKey}`);

    // 设置默认的gatekeeper URL
    const fullConfig: ShapeSyncConfig = {
      gatekeeperUrl: process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL || 'https://uurjvmztzzresuplaiuw.supabase.co/functions/v1/gatekeeper',
      ...config
    };

    // 初始化同步状态
    const status: ShapeSyncStatus = {
      isActive: false,
      lastSync: '',
      totalRecords: 0,
      errors: [],
      isConnected: false,
      lastSuccessfulConnection: '',
      reconnectAttempts: 0,
      maxReconnectAttempts: 5,
      responseTime: undefined,
      lastError: undefined
    };

    this.activeSyncs.set(shapeKey, { config: fullConfig, status });

    // 开始Shape监控
    if (networkStatusManager.isShapeMonitoringEnabled()) {
      const monitorConfig: ShapeMonitorConfig = {
        table: config.table,
        columns: config.columns,
        gatekeeperUrl: fullConfig.gatekeeperUrl!,
        checkInterval: 30000, // 30秒检查一次
        maxReconnectAttempts: 5,
        reconnectDelay: 2000,
        timeout: 15000
      };

      networkStatusManager.startShapeMonitoring(shapeKey, monitorConfig);
    }

    // 立即开始同步（如果网络可用）
    if (networkStatusManager.isOnline()) {
      this.startSync(shapeKey, fullConfig);
    }
  }

  /**
   * 移除Shape同步配置
   */
  removeShapeSync(shapeKey: string): void {
    console.log(`ShapeSyncManager: Removing shape sync - ${shapeKey}`);

    const syncInfo = this.activeSyncs.get(shapeKey);
    if (syncInfo) {
      // 停止当前同步
      this.pauseSync(shapeKey);
      
      // 停止Shape监控
      if (networkStatusManager.isShapeMonitoringEnabled()) {
        networkStatusManager.stopShapeMonitoring(shapeKey);
      }
      
      // 移除配置
      this.activeSyncs.delete(shapeKey);
    }
  }

  /**
   * 获取Shape同步状态
   */
  getShapeSyncStatus(shapeKey: string): ShapeSyncStatus | null {
    const syncInfo = this.activeSyncs.get(shapeKey);
    if (syncInfo) {
      // 更新连接状态和监控信息
      if (networkStatusManager.isShapeMonitoringEnabled()) {
        const connectionStatus = networkStatusManager.getShapeConnectionStatus(shapeKey);
        if (connectionStatus) {
          syncInfo.status.isConnected = connectionStatus.isConnected;
          syncInfo.status.lastSuccessfulConnection = connectionStatus.lastSuccessfulConnection;
          syncInfo.status.reconnectAttempts = connectionStatus.reconnectAttempts;
          syncInfo.status.maxReconnectAttempts = connectionStatus.maxReconnectAttempts;
          syncInfo.status.responseTime = connectionStatus.responseTime;
          syncInfo.status.lastError = connectionStatus.error;
        }
      }
      return syncInfo.status;
    }
    return null;
  }

  /**
   * 获取所有Shape同步状态
   */
  getAllShapeSyncStatuses(): { [shapeKey: string]: ShapeSyncStatus } {
    const statuses: { [shapeKey: string]: ShapeSyncStatus } = {};
    
    for (const [shapeKey, syncInfo] of this.activeSyncs) {
      // 更新连接状态和监控信息
      if (networkStatusManager.isShapeMonitoringEnabled()) {
        const connectionStatus = networkStatusManager.getShapeConnectionStatus(shapeKey);
        if (connectionStatus) {
          syncInfo.status.isConnected = connectionStatus.isConnected;
          syncInfo.status.lastSuccessfulConnection = connectionStatus.lastSuccessfulConnection;
          syncInfo.status.reconnectAttempts = connectionStatus.reconnectAttempts;
          syncInfo.status.maxReconnectAttempts = connectionStatus.maxReconnectAttempts;
          syncInfo.status.responseTime = connectionStatus.responseTime;
          syncInfo.status.lastError = connectionStatus.error;
        }
      }
      statuses[shapeKey] = syncInfo.status;
    }
    
    return statuses;
  }

  /**
   * 手动触发Shape同步
   */
  async triggerShapeSync(shapeKey: string): Promise<boolean> {
    console.log(`ShapeSyncManager: Manual sync trigger - ${shapeKey}`);

    const syncInfo = this.activeSyncs.get(shapeKey);
    if (!syncInfo) {
      console.warn(`ShapeSyncManager: Sync config not found - ${shapeKey}`);
      return false;
    }

    // 先检查Shape连接
    if (networkStatusManager.isShapeMonitoringEnabled()) {
      const reconnected = await networkStatusManager.reconnectShape(shapeKey);
      if (!reconnected) {
        console.warn(`ShapeSyncManager: Shape connection failed, cannot sync - ${shapeKey}`);
        return false;
      }
    }

    // 开始同步
    return await this.startSync(shapeKey, syncInfo.config);
  }

  /**
   * 开始Shape同步
   */
  private async startSync(shapeKey: string, config: ShapeSyncConfig): Promise<boolean> {
    const syncInfo = this.activeSyncs.get(shapeKey);
    if (!syncInfo) return false;

    try {
      // 如果已经在同步，先安全地停止
      if (syncInfo.abortController) {
        const oldController = syncInfo.abortController;
        syncInfo.abortController = undefined; // 立即清理引用
        
        // 异步中止旧的控制器
        setTimeout(() => {
          if (!oldController.aborted) {
            oldController.abort();
          }
        }, 0);
      }

      // 创建新的安全中断控制器
      const abortController = new SafeAbortController();
      syncInfo.abortController = abortController;
      syncInfo.status.isActive = true;

      console.log(`ShapeSyncManager: Starting sync - ${shapeKey}`);

      // 获取认证token
      const token = await getAuthToken();
      if (!token) {
        throw new Error('无法获取认证token');
      }

      // 构建请求URL
      const url = new URL(`${config.gatekeeperUrl}/v1/shape`);
      url.searchParams.set('table', config.table);
      url.searchParams.set('columns', config.columns.join(','));
      url.searchParams.set('offset', '-1'); // ElectricSQL初始请求使用-1
      url.searchParams.set('limit', '1000'); // 批量获取

      // 发起同步请求
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`同步请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      // ElectricSQL返回的是数组格式，需要转换为期望的格式
      let rows: any[] = [];
      if (Array.isArray(data)) {
        // ElectricSQL格式：[{key, value, headers}, ...]
        rows = data.map(item => item.value);
      } else if (data.rows && Array.isArray(data.rows)) {
        // 标准格式：{rows: [...]}
        rows = data.rows;
      }
      
      // 处理数据
      if (rows.length > 0) {
        syncInfo.status.totalRecords += rows.length;
        syncInfo.status.lastSync = new Date().toISOString();
        
        // 调用数据处理回调
        if (config.onData) {
          await config.onData(rows);
        }
        
        console.log(`ShapeSyncManager: Sync completed - ${shapeKey}, fetched ${rows.length} records`);
      }

      syncInfo.status.isActive = false;
      return true;

    } catch (error) {
      // 检查是否是AbortError，如果是则静默处理
      if (error instanceof Error && error.name === 'AbortError') {
        console.debug(`ShapeSyncManager: Sync aborted for ${shapeKey} (this is normal)`);
        if (syncInfo) {
          syncInfo.status.isActive = false;
          syncInfo.abortController = undefined;
        }
        return false;
      }
      
      console.error(`ShapeSyncManager: Sync failed - ${shapeKey}:`, error);
      
      if (syncInfo) {
        syncInfo.status.isActive = false;
        // 清理AbortController引用
        syncInfo.abortController = undefined;
        
        const errorMessage = error instanceof Error ? error.message : '未知错误';
        syncInfo.status.errors.push(errorMessage);
        
        // 只有非AbortError才调用错误回调
        if (!(error instanceof Error && error.name === 'AbortError')) {
          config.onError?.(errorMessage);
        }
      }
      
      return false;
    } finally {
      // 确保在任何情况下都清理AbortController引用
      if (syncInfo && syncInfo.abortController) {
        syncInfo.abortController = undefined;
      }
    }
  }

  /**
   * 暂停Shape同步
   */
  private pauseSync(shapeKey: string): void {
    const syncInfo = this.activeSyncs.get(shapeKey);
    if (!syncInfo) return;

    console.log(`ShapeSyncManager: Pausing sync - ${shapeKey}`);
    
    // 标记为非活跃状态
    syncInfo.status.isActive = false;
    
    // 安全地处理AbortController
    if (syncInfo.abortController) {
      const controller = syncInfo.abortController;
      syncInfo.abortController = undefined; // 立即清理引用
      
      // 异步中止，避免阻塞
      setTimeout(() => {
        if (!controller.aborted) {
          controller.abort();
        }
      }, 0);
    }
  }

  /**
   * 恢复所有同步
   */
  private resumeAllSyncs(): void {
    console.log('ShapeSyncManager: Resuming all syncs');
    
    for (const [shapeKey, syncInfo] of this.activeSyncs) {
      if (!syncInfo.status.isActive) {
        this.startSync(shapeKey, syncInfo.config);
      }
    }
  }

  /**
   * 暂停所有同步
   */
  private pauseAllSyncs(): void {
    console.log('ShapeSyncManager: Pausing all syncs');
    
    for (const shapeKey of this.activeSyncs.keys()) {
      this.pauseSync(shapeKey);
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      network: networkStatusManager.getNetworkStats(),
      shapes: this.getAllShapeSyncStatuses(),
      totalActiveShapes: Array.from(this.activeSyncs.values()).filter(s => s.status.isActive).length,
      totalShapes: this.activeSyncs.size,
      shapeMonitoringEnabled: networkStatusManager.isShapeMonitoringEnabled()
    };
  }

  /**
   * 清理资源
   */
  cleanup(): void {
    if (!this.isInitialized) return;

    console.log('ShapeSyncManager: Cleaning up');

    // 停止所有同步
    for (const shapeKey of this.activeSyncs.keys()) {
      this.removeShapeSync(shapeKey);
    }

    this.isInitialized = false;
  }
}

// 导出单例实例
export const shapeSyncManager = ShapeSyncManager.getInstance();