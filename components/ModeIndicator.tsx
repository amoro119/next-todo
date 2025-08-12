'use client';

import React from 'react';
import { useAppConfig } from '../lib/hooks/useAppConfig';

export function ModeIndicator() {
  const { user, sync, isOnline } = useAppConfig();

  const getModeInfo = () => {
    if (!sync.enabled) {
      switch (sync.reason) {
        case 'free_user':
          return {
            mode: '免费版',
            description: '仅本地存储',
            color: 'text-gray-600',
            icon: '📱',
          };
        case 'user_preference':
          return {
            mode: '本地模式',
            description: '同步已禁用',
            color: 'text-orange-600',
            icon: '🔒',
          };
        default:
          return {
            mode: '本地模式',
            description: '仅本地存储',
            color: 'text-gray-600',
            icon: '📱',
          };
      }
    }

    // 同步启用时
    if (!isOnline) {
      return {
        mode: '离线模式',
        description: '数据将在联网后同步',
        color: 'text-yellow-600',
        icon: '📡',
      };
    }

    return {
      mode: '同步模式',
      description: '数据实时同步',
      color: 'text-green-600',
      icon: '☁️',
    };
  };

  const modeInfo = getModeInfo();

  return (
    <div className="fixed bottom-4 left-4 bg-white p-4 border rounded shadow-lg max-w-xs z-50">
      <h3 className="text-lg font-bold mb-2">模式指示器</h3>
      
      <div className="mb-2">
        <div className="flex items-center space-x-2">
          <span className="text-lg">{modeInfo.icon}</span>
          <div>
            <span className="font-semibold">当前模式:</span> 
            <span className={modeInfo.color}>
              {modeInfo.mode}
            </span>
          </div>
        </div>
      </div>
      
      <div className="mb-2">
        <span className="font-semibold">状态:</span> 
        <span className="text-gray-600">{modeInfo.description}</span>
      </div>
      
      <div className="mb-2">
        <span className="font-semibold">网络:</span> 
        <span className={isOnline ? "text-green-600" : "text-red-600"}>
          {isOnline ? '在线' : '离线'}
        </span>
      </div>
      
      <div className="text-xs text-gray-500 mt-2">
        开发模式 | 版本: 1.0
      </div>
    </div>
  );
}