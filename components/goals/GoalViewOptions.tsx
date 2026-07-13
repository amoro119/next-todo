'use client';

import React from 'react';
import { cn } from '@/components/common/cn';

export type GoalView = 'active' | 'archived';

interface GoalViewOptionsProps {
  currentView: GoalView;
  onViewChange: (view: GoalView) => void;
  counts: Record<GoalView, number>;
}

const TABS: { id: GoalView; label: string }[] = [
  { id: 'active', label: '进行中' },
  { id: 'archived', label: '已存档' },
];

const GoalViewOptions: React.FC<GoalViewOptionsProps> = ({ currentView, onViewChange, counts }) => {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none" role="tablist" aria-label="目标筛选">
      {TABS.map((tab) => {
        const isActive = currentView === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onViewChange(tab.id)}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={cn(
              'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              isActive
                ? 'bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))]'
                : 'bg-[oklch(var(--muted))] text-[oklch(var(--muted-foreground))]'
            )}
          >
            {tab.label}
            <span className="text-xs opacity-70">{counts[tab.id]}</span>
          </button>
        );
      })}
    </div>
  );
};

export default GoalViewOptions;
