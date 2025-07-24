'use client';

import React from 'react';
import { useSyncStatus } from '../lib/sync/useSyncStatus';
import { SyncQueueStatsDisplay } from './SyncQueueStatsDisplay';

export function SyncStatusDetails() {
  const { syncStatus, triggerSync, isTriggering, syncInterval, updateSyncInterval, toggleAdaptiveSync } = useSyncStatus();
  
  if (!syncStatus.isActive) {
    return (
      <div className="bg-white rounded-lg shadow p-4">
        <div className="text-gray-500">同步系统未激活</div>
      </div>
    );
  }
  
  // Format sync interval
  const formatInterval = (ms: number) => {
    if (ms < 60000) {
      return `${Math.round(ms / 1000)}秒`;
    } else {
      return `${Math.round(ms / 60000)}分钟`;
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow p-4">
      <h2 className="text-xl font-bold mb-4">同步状态详情</h2>
      
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <span className="font-medium">当前状态:</span>
          <span className={`px-2 py-1 rounded text-sm ${getStatusColor(syncStatus.syncStage)}`}>
            {getStatusText(syncStatus.syncStage)}
          </span>
        </div>
        
        {syncStatus.error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded mb-2">
            错误: {syncStatus.error}
          </div>
        )}
        
        {syncStatus.lastSyncTime && (
          <div className="text-sm text-gray-600 mb-2">
            上次同步时间: {new Date(syncStatus.lastSyncTime).toLocaleString()}
          </div>
        )}
      </div>
      
      <SyncQueueStatsDisplay />
      
      <div className="mt-4 border-t pt-4">
        <h3 className="text-lg font-medium mb-2">同步设置</h3>
        
        <div className="flex justify-between items-center mb-2">
          <span>同步间隔:</span>
          <div className="flex items-center space-x-2">
            <select 
              value={syncInterval} 
              onChange={(e) => updateSyncInterval(parseInt(e.target.value))}
              className="border rounded px-2 py-1"
            >
              <option value={30000}>30秒</option>
              <option value={60000}>1分钟</option>
              <option value={300000}>5分钟</option>
              <option value={600000}>10分钟</option>
            </select>
          </div>
        </div>
        
        <div className="flex justify-between items-center mb-4">
          <span>自适应同步:</span>
          <label className="inline-flex items-center cursor-pointer">
            <input 
              type="checkbox" 
              className="sr-only peer"
              onChange={(e) => toggleAdaptiveSync(e.target.checked)}
              defaultChecked={true}
            />
            <div className="relative w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
        
        <button 
          onClick={triggerSync} 
          disabled={isTriggering || syncStatus.progress > 0 && syncStatus.progress < 100}
          className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTriggering ? '同步中...' : '立即同步'}
        </button>
      </div>
    </div>
  );
}

function getStatusColor(stage?: string): string {
  switch (stage) {
    case 'preparing':
      return 'bg-blue-100 text-blue-800';
    case 'processing':
      return 'bg-yellow-100 text-yellow-800';
    case 'cleaning':
      return 'bg-purple-100 text-purple-800';
    case 'completed':
      return 'bg-green-100 text-green-800';
    case 'failed':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function getStatusText(stage?: string): string {
  switch (stage) {
    case 'preparing':
      return '准备中';
    case 'processing':
      return '处理中';
    case 'cleaning':
      return '清理中';
    case 'completed':
      return '已完成';
    case 'failed':
      return '失败';
    default:
      return '未知';
  }
}