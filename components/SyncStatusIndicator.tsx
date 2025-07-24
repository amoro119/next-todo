'use client';

import React from 'react';
import { useSyncStatus } from '../lib/sync/useSyncStatus';

export function SyncStatusIndicator() {
  const { syncStatus, triggerSync, isTriggering } = useSyncStatus();
  
  // Don't render anything if sync is not active
  if (!syncStatus.isActive) {
    return null;
  }
  
  // Show error state
  if (syncStatus.error) {
    return (
      <div className="flex items-center space-x-2 text-red-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
        </svg>
        <span className="text-sm">同步错误: {syncStatus.error}</span>
        <button 
          onClick={triggerSync} 
          disabled={isTriggering}
          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
        >
          重试
        </button>
      </div>
    );
  }
  
  // Show syncing state
  if (syncStatus.progress > 0 && syncStatus.progress < 100) {
    // Calculate estimated time remaining
    let timeRemainingText = '';
    if (syncStatus.estimatedTimeRemaining !== undefined) {
      const seconds = Math.round(syncStatus.estimatedTimeRemaining);
      if (seconds < 60) {
        timeRemainingText = `${seconds}秒`;
      } else {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        timeRemainingText = `${minutes}分${remainingSeconds}秒`;
      }
    }
    
    return (
      <div className="flex flex-col">
        <div className="flex items-center space-x-2">
          <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm text-blue-600">
            {syncStatus.currentItem || `同步中 (${syncStatus.progress}%)`}
          </span>
        </div>
        
        <div className="mt-1">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-in-out" 
              style={{ width: `${syncStatus.progress}%` }}
            ></div>
          </div>
          
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>
              {syncStatus.syncStage === 'processing' && syncStatus.itemsProcessed !== undefined && syncStatus.totalItemsToSync !== undefined && 
                `${syncStatus.itemsProcessed}/${syncStatus.totalItemsToSync} 项`}
            </span>
            <span>
              {syncStatus.processingSpeed !== undefined && 
                `${Math.round(syncStatus.processingSpeed * 10) / 10} 项/秒`}
            </span>
            <span>
              {timeRemainingText && `剩余: ${timeRemainingText}`}
            </span>
          </div>
        </div>
      </div>
    );
  }
  
  // Show pending changes if any
  const pendingCount = syncStatus.queueStats?.pending || 0;
  const failedCount = syncStatus.queueStats?.failed || 0;
  
  if (pendingCount > 0 || failedCount > 0) {
    return (
      <div className="flex items-center space-x-2">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
        </svg>
        <span className="text-sm text-yellow-600">
          {pendingCount > 0 && `${pendingCount} 个变更等待同步`}
          {pendingCount > 0 && failedCount > 0 && ', '}
          {failedCount > 0 && `${failedCount} 个变更失败`}
        </span>
        <button 
          onClick={triggerSync} 
          disabled={isTriggering}
          className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 disabled:opacity-50"
        >
          立即同步
        </button>
      </div>
    );
  }
  
  // Show last sync time if available
  if (syncStatus.lastSyncTime) {
    const lastSyncDate = new Date(syncStatus.lastSyncTime);
    
    // Calculate time since last sync
    const now = new Date();
    const diffMs = now.getTime() - lastSyncDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    let timeAgo = '';
    if (diffMins < 1) {
      timeAgo = '刚刚';
    } else if (diffMins < 60) {
      timeAgo = `${diffMins}分钟前`;
    } else {
      const diffHours = Math.floor(diffMins / 60);
      timeAgo = `${diffHours}小时前`;
    }
    
    return (
      <div className="flex items-center space-x-2 text-green-600">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span className="text-sm">同步完成 ({timeAgo})</span>
        <button 
          onClick={triggerSync} 
          disabled={isTriggering}
          className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 disabled:opacity-50"
        >
          刷新
        </button>
      </div>
    );
  }
  
  return null;
}