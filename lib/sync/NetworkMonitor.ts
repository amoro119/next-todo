// lib/sync/NetworkMonitor.ts
import { getAuthToken } from '../auth';

export interface NetworkMonitor {
  // 开始监控网络状态
  startMonitoring(): void
  
  // 停止监控
  stopMonitoring(): void
  
  // 获取当前网络状态
  isOnline(): boolean
  
  // 注册网络状态变化回调
  onNetworkChange(callback: (isOnline: boolean) => void): void
  
  // 测试服务器连接
  testServerConnection(): Promise<boolean>
  
  // 获取网络状态统计信息
  getNetworkStats?(): NetworkStatusCache | null
  
  // 清除网络状态缓存
  clearNetworkCache?(): void
  
  // 强制刷新网络状态
  refreshNetworkStatus?(): Promise<boolean>
}

export interface NetworkStatusCache {
  isOnline: boolean;
  lastChecked: string; // ISO格式时间戳
  serverReachable: boolean;
  responseTime?: number; // 毫秒
  reconnectAttempts: number;
}

// LocalStorage键名
const NETWORK_STATUS_KEY = 'app_network_status';

export class NetworkMonitorImpl implements NetworkMonitor {
  private isMonitoring = false;
  private networkChangeCallbacks: ((isOnline: boolean) => void)[] = [];
  private lastOnlineStatus: boolean;
  private serverTestTimeout = 10000; // 10秒超时
  private reconnectAttempts = 0;
  
  constructor() {
    // 检查是否在浏览器环境中
    if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
      this.lastOnlineStatus = navigator.onLine;
      this.loadNetworkStatus();
    } else {
      // 服务端环境，默认为在线状态
      this.lastOnlineStatus = true;
    }
  }

  startMonitoring(): void {
    if (this.isMonitoring) return;
    
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined') {
      console.warn('NetworkMonitor: Cannot start monitoring in server environment');
      return;
    }
    
    this.isMonitoring = true;
    
    // 监听浏览器网络状态变化事件
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    
    // 定期检查服务器连接状态
    this.startPeriodicServerCheck();
    
    console.log('NetworkMonitor: Started monitoring network status');
  }

  stopMonitoring(): void {
    if (!this.isMonitoring) return;
    
    this.isMonitoring = false;
    
    // 检查是否在浏览器环境中
    if (typeof window !== 'undefined') {
      // 移除事件监听器
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
    
    console.log('NetworkMonitor: Stopped monitoring network status');
  }

  isOnline(): boolean {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      // 服务端环境，默认返回在线状态
      return true;
    }
    
    // 结合浏览器状态和服务器连接状态
    const browserOnline = navigator.onLine;
    const cachedStatus = this.getCachedNetworkStatus();
    
    // 如果浏览器显示离线，直接返回false
    if (!browserOnline) return false;
    
    // 如果浏览器显示在线，检查服务器连接状态
    return cachedStatus?.serverReachable ?? true;
  }

  onNetworkChange(callback: (isOnline: boolean) => void): void {
    this.networkChangeCallbacks.push(callback);
  }

  async testServerConnection(): Promise<boolean> {
    try {
      // 通过 getAuthToken 获取 token（已自动缓存）
      const token = await getAuthToken();
      if (!token) {
        console.warn('NetworkMonitor: 无法获取认证令牌，假定服务器可达');
        return true;
      }

      // 使用独立的健康检查地址
      const healthcheckUrl = process.env.NEXT_PUBLIC_WRITE_SERVER_URL;
      if (!healthcheckUrl) {
        console.warn('NetworkMonitor: HEALTHCHECK_URL 未配置，假定服务器可达');
        return true;
      }

      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.serverTestTimeout);

      // 携带缓存token进行健康检查
      const response = await fetch(healthcheckUrl, {
        method: 'HEAD',
        signal: controller.signal,
        cache: 'no-cache',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      const isReachable = response.ok;

      this.updateNetworkStatus({
        isOnline: navigator.onLine,
        serverReachable: isReachable,
        responseTime,
        reconnectAttempts: isReachable ? 0 : this.reconnectAttempts + 1,
        lastChecked: new Date().toISOString()
      });

      if (isReachable) {
        this.reconnectAttempts = 0;
      } else {
        this.reconnectAttempts++;
      }

      return isReachable;
    } catch (error) {
      console.warn('NetworkMonitor: Server connection test failed:', error);
      this.reconnectAttempts++;
      this.updateNetworkStatus({
        isOnline: navigator.onLine,
        serverReachable: false,
        reconnectAttempts: this.reconnectAttempts,
        lastChecked: new Date().toISOString()
      });
      return false;
    }
  }

  private handleOnline = async () => {
    console.log('NetworkMonitor: Browser reports online');
    
    // 浏览器报告在线时，测试服务器连接
    const serverReachable = await this.testServerConnection();
    const newOnlineStatus = serverReachable;
    
    if (newOnlineStatus !== this.lastOnlineStatus) {
      this.lastOnlineStatus = newOnlineStatus;
      this.notifyNetworkChange(newOnlineStatus);
    }
  };

  private handleOffline = () => {
    console.log('NetworkMonitor: Browser reports offline');
    
    this.updateNetworkStatus({
      isOnline: false,
      serverReachable: false,
      reconnectAttempts: this.reconnectAttempts,
      lastChecked: new Date().toISOString()
    });
    
    if (this.lastOnlineStatus !== false) {
      this.lastOnlineStatus = false;
      this.notifyNetworkChange(false);
    }
  };

  private startPeriodicServerCheck(): void {
    // 每30秒检查一次服务器连接（仅在浏览器显示在线时）
    const checkInterval = setInterval(async () => {
      if (!this.isMonitoring) {
        clearInterval(checkInterval);
        return;
      }
      
      if (!navigator.onLine) return; // 浏览器离线时跳过检查
      
      const serverReachable = await this.testServerConnection();
      const newOnlineStatus = serverReachable;
      
      if (newOnlineStatus !== this.lastOnlineStatus) {
        this.lastOnlineStatus = newOnlineStatus;
        this.notifyNetworkChange(newOnlineStatus);
      }
    }, 30000);
  }

  private notifyNetworkChange(isOnline: boolean): void {
    console.log(`NetworkMonitor: Network status changed to ${isOnline ? 'online' : 'offline'}`);
    
    this.networkChangeCallbacks.forEach(callback => {
      try {
        callback(isOnline);
      } catch (error) {
        console.error('NetworkMonitor: Error in network change callback:', error);
      }
    });
  }

  private getCachedNetworkStatus(): NetworkStatusCache | null {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return null;
    }
    
    try {
      const cached = localStorage.getItem(NETWORK_STATUS_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('NetworkMonitor: Failed to load cached network status:', error);
      return null;
    }
  }

  private updateNetworkStatus(status: Partial<NetworkStatusCache>): void {
    // 检查是否在浏览器环境中
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }
    
    try {
      const current = this.getCachedNetworkStatus() || {
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        serverReachable: true,
        reconnectAttempts: 0,
        lastChecked: new Date().toISOString()
      };
      
      const updated = { ...current, ...status };
      localStorage.setItem(NETWORK_STATUS_KEY, JSON.stringify(updated));
    } catch (error) {
      console.warn('NetworkMonitor: Failed to update network status cache:', error);
    }
  }

  private loadNetworkStatus(): void {
    const cached = this.getCachedNetworkStatus();
    if (cached) {
      // 如果缓存的状态太旧（超过5分钟），重新检查
      const lastChecked = new Date(cached.lastChecked);
      const now = new Date();
      const timeDiff = now.getTime() - lastChecked.getTime();
      
      if (timeDiff > 5 * 60 * 1000) { // 5分钟
        if (process.env.NODE_ENV === 'development') {
          console.log('NetworkMonitor: Cached status is stale, will recheck server connection');
        }
        // 异步重新检查服务器状态
        setTimeout(() => this.testServerConnection(), 1000);
      } else {
        this.lastOnlineStatus = cached.isOnline && cached.serverReachable;
        if (process.env.NODE_ENV === 'development') {
          console.log(`NetworkMonitor: Loaded cached network status: ${this.lastOnlineStatus ? 'online' : 'offline'}`);
        }
      }
      
      this.reconnectAttempts = cached.reconnectAttempts || 0;
    } else {
      if (process.env.NODE_ENV === 'development') {
        console.log('NetworkMonitor: No cached network status found, will test server connection');
      }
      // 如果没有缓存状态，初始化时检查服务器连接
      setTimeout(() => this.testServerConnection(), 1000);
    }
  }

  // 获取网络状态统计信息
  getNetworkStats(): NetworkStatusCache | null {
    return this.getCachedNetworkStatus();
  }

  // 清除网络状态缓存
  clearNetworkCache(): void {
    try {
      localStorage.removeItem(NETWORK_STATUS_KEY);
      console.log('NetworkMonitor: Network status cache cleared');
    } catch (error) {
      console.warn('NetworkMonitor: Failed to clear network status cache:', error);
    }
  }

  // 强制刷新网络状态
  async refreshNetworkStatus(): Promise<boolean> {
    console.log('NetworkMonitor: Forcing network status refresh');
    const serverReachable = await this.testServerConnection();
    const newOnlineStatus = navigator.onLine && serverReachable;
    
    if (newOnlineStatus !== this.lastOnlineStatus) {
      this.lastOnlineStatus = newOnlineStatus;
      this.notifyNetworkChange(newOnlineStatus);
    }
    
    return newOnlineStatus;
  }
}