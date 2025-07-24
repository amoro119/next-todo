// components/OfflineSyncDebugger.tsx
'use client'

import { useEffect, useState } from 'react';
import { getSyncScheduler } from '../lib/sync/initOfflineSync';
import { networkStatusManager } from '../lib/sync/NetworkStatusManager';
import { SyncStatus } from '../lib/sync/types';

export default function OfflineSyncDebugger() {
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [lastNetworkChange, setLastNetworkChange] = useState<Date | null>(null);
  const [refreshCounter, setRefreshCounter] = useState(0);

  useEffect(() => {
    // 获取 SyncScheduler 实例
    const syncScheduler = getSyncScheduler();
    if (!syncScheduler) {
      console.error('SyncScheduler 未初始化!');
      return;
    }

    // 注册状态变化回调
    syncScheduler.onSyncStatusChange((status) => {
      console.log('SyncScheduler 状态变化:', status);
      setSyncStatus(status);
    });

    // 获取当前网络状态
    const currentIsOnline = networkStatusManager.isOnline();
    setIsOnline(currentIsOnline);

    // 监听网络状态变化
    const handleNetworkChange = (online: boolean) => {
      console.log(`网络状态变化: ${online ? '在线' : '离线'}`);
      setIsOnline(online);
      setLastNetworkChange(new Date());
    };

    networkStatusManager.onNetworkChange(handleNetworkChange);

    // 定期刷新状态
    const intervalId = setInterval(() => {
      setRefreshCounter(prev => prev + 1);
    }, 5000);

    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // 手动触发同步
  const handleTriggerSync = async () => {
    const syncScheduler = getSyncScheduler();
    if (!syncScheduler) {
      console.error('SyncScheduler 未初始化!');
      return;
    }

    try {
      await syncScheduler.triggerSync();
    } catch (error) {
      console.error('手动触发同步失败:', error);
    }
  };

  // 模拟网络状态变化
  const handleToggleNetwork = () => {
    // 这里只是更新UI状态，实际网络状态由浏览器控制
    // 在真实场景中，用户需要手动切换网络
    alert(`请手动${isOnline ? '断开' : '连接'}网络，然后观察同步行为`);
  };

  // 添加测试数据到同步队列
  const handleAddTestData = async () => {
    if (typeof window === 'undefined') return;
    
    const pg = (window as any).pg;
    if (!pg) {
      alert('数据库实例未初始化!');
      return;
    }

    try {
      // 添加一个待处理的变更记录
      await pg.query(`
        INSERT INTO sync_queue (
          table_name, operation, record_id, data, timestamp, 
          retry_count, max_retries, status
        ) VALUES (
          'todos', 'insert', $1, $2, 
          $3, 0, 3, 'pending'
        )
      `, [
        `test-id-${Date.now()}`,
        JSON.stringify({ title: `测试任务 ${Date.now()}`, completed: false }),
        new Date().toISOString()
      ]);
      
      alert('成功添加测试数据到同步队列');
    } catch (error) {
      console.error('添加测试数据失败:', error);
      alert(`添加测试数据失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 bg-white p-4 border rounded shadow-lg max-w-md z-50">
      <h3 className="text-lg font-bold mb-2">离线同步调试器</h3>
      
      <div className="mb-2">
        <span className="font-semibold">网络状态:</span> 
        <span className={isOnline ? "text-green-600" : "text-red-600"}>
          {isOnline ? '在线' : '离线'}
        </span>
      </div>
      
      {lastNetworkChange && (
        <div className="mb-2">
          <span className="font-semibold">最后网络变化:</span> 
          {lastNetworkChange.toLocaleTimeString()}
        </div>
      )}
      
      {syncStatus && (
        <div className="mb-2">
          <div>
            <span className="font-semibold">同步状态:</span> 
            <span className={syncStatus.isActive ? "text-green-600" : "text-gray-600"}>
              {syncStatus.isActive ? '活跃' : '非活跃'}
            </span>
          </div>
          
          <div>
            <span className="font-semibold">进度:</span> {syncStatus.progress}%
          </div>
          
          {syncStatus.syncStage && (
            <div>
              <span className="font-semibold">阶段:</span> {syncStatus.syncStage}
            </div>
          )}
          
          {syncStatus.error && (
            <div className="text-red-600">
              <span className="font-semibold">错误:</span> {syncStatus.error}
            </div>
          )}
          
          {syncStatus.queueStats && (
            <div>
              <span className="font-semibold">队列统计:</span> 
              待处理: {syncStatus.queueStats.pending}, 
              同步中: {syncStatus.queueStats.syncing}, 
              失败: {syncStatus.queueStats.failed}, 
              完成: {syncStatus.queueStats.completed}
            </div>
          )}
          
          {syncStatus.lastSyncTime && (
            <div>
              <span className="font-semibold">最后同步时间:</span> 
              {new Date(syncStatus.lastSyncTime).toLocaleString()}
            </div>
          )}
        </div>
      )}
      
      <div className="flex space-x-2 mt-4">
        <button 
          onClick={handleTriggerSync}
          className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          触发同步
        </button>
        
        <button 
          onClick={handleToggleNetwork}
          className="px-3 py-1 bg-yellow-500 text-white rounded hover:bg-yellow-600"
        >
          {isOnline ? '模拟离线' : '模拟在线'}
        </button>
        
        <button 
          onClick={handleAddTestData}
          className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600"
        >
          添加测试数据
        </button>
      </div>
      
      <div className="text-xs text-gray-500 mt-2">
        刷新计数: {refreshCounter} | 调试器版本: 1.0
      </div>
    </div>
  );
}