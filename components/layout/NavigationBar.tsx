'use client'

import { Settings } from 'lucide-react'
import { useNavResize } from '@/lib/hooks/useNavResize'
import { useSyncStatus } from '@/lib/hooks/useSyncStatus'
import { useUIStore, type AppSection } from '@/lib/stores/uiStore'

const NAV_ITEMS = [
  { section: 'todo' as AppSection, label: '待办' },
  { section: 'goals' as AppSection, label: '目标' },
  { section: 'calendar' as AppSection, label: '日历' },
]

interface NavigationBarProps {
  onOpenSettings: () => void
}

export function NavigationBar({ onOpenSettings }: NavigationBarProps) {
  const { navWidth, resizeHandleProps } = useNavResize()
  const { isSyncing } = useSyncStatus()
  const activeSection = useUIStore((s) => s.activeSection)
  const setActiveSection = useUIStore((s) => s.setActiveSection)

  return (
    <>
      <div
        className="hidden md:flex flex-col h-full border-r border-[oklch(var(--border))] bg-[oklch(var(--background))] relative shrink-0"
        style={{ width: `${navWidth}px` }}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-sm font-semibold text-[oklch(var(--foreground))]">待办清单</span>
          <button
            onClick={onOpenSettings}
            className="text-[oklch(var(--muted-foreground))] hover:text-[oklch(var(--foreground))] transition-colors"
            aria-label="设置"
          >
            <Settings size={16} />
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-2">
          {NAV_ITEMS.map(({ section, label }) => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={[
                'text-left px-3 py-2 rounded-md text-xs font-medium tracking-widest uppercase whitespace-nowrap transition-colors',
                activeSection === section
                  ? 'text-[oklch(var(--foreground))]'
                  : 'text-[oklch(var(--muted-foreground))] hover:text-[oklch(var(--foreground))]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </nav>

        {isSyncing && (
          <div className="mt-auto hidden px-4 pb-4 md:flex items-center gap-2 text-xs text-[oklch(var(--muted-foreground))]">
            <div className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />
            <span>同步中</span>
          </div>
        )}

        <div
          {...resizeHandleProps}
          className="absolute right-0 top-0 bottom-0 w-1 hover:bg-[oklch(var(--primary)/0.3)] transition-colors"
        />
      </div>

      <div className="md:hidden sticky top-0 z-40 w-full border-b border-[oklch(var(--border))] bg-[oklch(var(--background))]">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm font-semibold text-[oklch(var(--foreground))]">待办清单</span>
          <button
            onClick={onOpenSettings}
            className="text-[oklch(var(--muted-foreground))] hover:text-[oklch(var(--foreground))] transition-colors"
            aria-label="设置"
          >
            <Settings size={16} />
          </button>
        </div>
        <div className="flex overflow-x-auto px-4 pb-2 gap-4 scrollbar-none">
          {NAV_ITEMS.map(({ section, label }) => (
            <button
              key={section}
              onClick={() => setActiveSection(section)}
              className={[
                'text-xs font-medium tracking-widest uppercase whitespace-nowrap transition-colors shrink-0',
                activeSection === section
                  ? 'text-[oklch(var(--foreground))]'
                  : 'text-[oklch(var(--muted-foreground))] hover:text-[oklch(var(--foreground))]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
