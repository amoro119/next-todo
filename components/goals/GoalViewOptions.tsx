'use client';

import React from 'react';
import { cn } from '@/components/common/cn';

export type GoalView = 'active' | 'archived';

interface GoalViewOptionsProps {
  currentView: GoalView;
  onViewChange: (view: GoalView) => void;
}

const TABS: { id: GoalView; label: string }[] = [
  { id: 'active', label: '进行中' },
  { id: 'archived', label: '已存档' },
];

const GoalViewOptions: React.FC<GoalViewOptionsProps> = ({ currentView, onViewChange }) => {
  return (
    <div className="flex gap-2 overflow-x-auto py-2 px-1 scrollbar-none">
      {TABS.map((tab) => {
        const isActive = currentView === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onViewChange(tab.id)}
            className={cn(
              'px-4 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap shrink-0',
              isActive
                ? 'bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))]'
                : 'bg-[oklch(var(--muted))] text-[oklch(var(--muted-foreground))] hover:bg-[oklch(var(--muted)/0.8)]'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default GoalViewOptions;
