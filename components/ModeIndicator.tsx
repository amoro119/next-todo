'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useAppConfig } from '../lib/hooks/useAppConfig';
import { Button } from '@/components/ui/button';

export function ModeIndicator() {
  const { sync, isOnline } = useAppConfig();
  const [collapsed, setCollapsed] = useState(true);

  const getModeInfo = () => {
    if (!sync.enabled) {
      switch (sync.reason) {
        case 'free_user':
          return {
            mode: '免费版',
            description: '仅本地存储',
            color: 'text-[oklch(var(--muted-foreground))]',
          };
        case 'user_preference':
          return {
            mode: '本地模式',
            description: '同步已禁用',
            color: 'text-[oklch(var(--muted-foreground))]',
          };
        default:
          return {
            mode: '本地模式',
            description: '仅本地存储',
            color: 'text-[oklch(var(--muted-foreground))]',
          };
      }
    }

    // 同步启用时
    if (!isOnline) {
      return {
        mode: '离线模式',
        description: '数据将在联网后同步',
        color: 'text-[oklch(var(--destructive))]',
      };
    }

    return {
      mode: '同步模式',
      description: '数据实时同步',
      color: 'text-[oklch(var(--foreground))]',
    };
  };

  const modeInfo = getModeInfo();

  return (
    <div className="fixed bottom-4 left-4 z-50 max-w-xs rounded-lg border border-[oklch(var(--border))] bg-[oklch(var(--background))]">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="w-full justify-between gap-3 px-3"
        onClick={() => setCollapsed((value) => !value)}
        aria-expanded={!collapsed}
      >
        <span className="text-xs font-medium">开发模式 · {modeInfo.mode}</span>
        {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </Button>

      {!collapsed && (
        <div className="space-y-2 border-t border-[oklch(var(--border))] px-3 py-3 text-xs">
          <div className="flex justify-between gap-4">
            <span className="text-[oklch(var(--muted-foreground))]">状态</span>
            <span className={modeInfo.color}>{modeInfo.description}</span>
          </div>
          <div className="flex justify-between gap-4">
            <span className="text-[oklch(var(--muted-foreground))]">网络</span>
            <span className={isOnline ? 'text-[oklch(var(--foreground))]' : 'text-[oklch(var(--destructive))]'}>
              {isOnline ? '在线' : '离线'}
            </span>
          </div>
          <div className="text-[oklch(var(--muted-foreground))]">版本 1.0</div>
        </div>
      )}
    </div>
  );
}
