'use client';

import React from 'react';
import { useSyncStatus } from '../lib/sync/useSyncStatus';
import { QueueStats } from '../lib/sync/types';

interface SyncQueueStatsDisplayProps {
  compact?: boolean;
}

export function SyncQueueStatsDisplay({ compact = false }: SyncQueueStatsDisplayProps) {
  const { syncStatus } = useSyncStatus();
  const stats = syncStatus.queueStats;
  
  if (!stats) {
    return null;
  }
  
  if (compact) {
    return (
      <div className="text-sm">
        <div className="flex justify-between">
          <span>待同步: {stats.pending}</span>
          <span>同步中: {stats.syncing}</span>
          <span>失败: {stats.failed}</span>
          <span>已完成: {stats.completed}</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="bg-white rounded-lg shadow p-4 my-4">
      <h3 className="text-lg font-medium mb-3">同步队列统计</h3>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-blue-50 p-3 rounded">
          <div className="text-sm text-blue-500">待同步</div>
          <div className="text-2xl font-bold">{stats.pending}</div>
        </div>
        
        <div className="bg-yellow-50 p-3 rounded">
          <div className="text-sm text-yellow-500">同步中</div>
          <div className="text-2xl font-bold">{stats.syncing}</div>
        </div>
        
        <div className="bg-red-50 p-3 rounded">
          <div className="text-sm text-red-500">失败</div>
          <div className="text-2xl font-bold">{stats.failed}</div>
        </div>
        
        <div className="bg-green-50 p-3 rounded">
          <div className="text-sm text-green-500">已完成</div>
          <div className="text-2xl font-bold">{stats.completed}</div>
        </div>
      </div>
      
      {syncStatus.syncHistory && syncStatus.syncHistory.length > 0 && (
        <div className="mt-4">
          <h4 className="text-md font-medium mb-2">同步历史</h4>
          <div className="max-h-40 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">时间</th>
                  <th className="text-left py-2">状态</th>
                  <th className="text-right py-2">处理项</th>
                  <th className="text-right py-2">耗时</th>
                </tr>
              </thead>
              <tbody>
                {syncStatus.syncHistory.map((entry, index) => {
                  const date = new Date(entry.timestamp);
                  const timeString = date.toLocaleTimeString();
                  const dateString = date.toLocaleDateString();
                  
                  return (
                    <tr key={index} className="border-b">
                      <td className="py-2">{dateString} {timeString}</td>
                      <td className={`py-2 ${entry.success ? 'text-green-500' : 'text-red-500'}`}>
                        {entry.success ? '成功' : '失败'}
                      </td>
                      <td className="text-right py-2">{entry.itemsProcessed}</td>
                      <td className="text-right py-2">{(entry.duration / 1000).toFixed(1)}s</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}