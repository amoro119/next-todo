'use client'

import { CalendarDays, CheckSquare, Settings, Target } from 'lucide-react'
import { useNavResize } from '@/lib/hooks/useNavResize'
import { useSyncStatus } from '@/lib/hooks/useSyncStatus'
import { useUIStore, type AppSection } from '@/lib/stores/uiStore'
import { PWAInstallButton } from '@/components/PWAInstallButton'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/common/cn'

const NAV_ITEMS = [
  { section: 'todo' as AppSection, label: '待办', icon: CheckSquare },
  { section: 'goals' as AppSection, label: '目标', icon: Target },
  { section: 'calendar' as AppSection, label: '日历', icon: CalendarDays },
]

interface NavigationBarProps {
  onOpenSettings: () => void
  onSectionChange: (section: AppSection) => void
}

export function NavigationBar({ onOpenSettings, onSectionChange }: NavigationBarProps) {
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
          <span className="text-sm font-semibold text-[oklch(var(--foreground))]">NEXT TODO</span>
          <div className="flex items-center gap-1">
            <PWAInstallButton />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={onOpenSettings}
              className="text-[oklch(var(--muted-foreground))]"
              aria-label="设置"
            >
              <Settings size={16} />
            </Button>
          </div>
        </div>

        <nav className="flex flex-col gap-1 px-2">
          {NAV_ITEMS.map(({ section, label, icon: Icon }) => (
            <Button
              key={section}
              type="button"
              variant="ghost"
              onClick={() => {
                onSectionChange(section)
                setActiveSection(section)
              }}
              aria-current={activeSection === section ? 'page' : undefined}
              className={cn(
                'relative h-9 justify-start px-3 text-xs font-medium tracking-widest uppercase whitespace-nowrap',
                activeSection === section
                  ? 'bg-[oklch(var(--accent))] text-[oklch(var(--accent-foreground))]'
                  : 'text-[oklch(var(--muted-foreground))]'
              )}
            >
              <span className={cn('absolute left-0 h-5 w-0.5 rounded-full bg-[oklch(var(--primary))] opacity-0', activeSection === section && 'opacity-100')} />
              <Icon className="h-4 w-4" />
              {label}
            </Button>
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
          className="absolute right-0 top-0 bottom-0 w-2 translate-x-1 rounded-full transition-colors hover:bg-[oklch(var(--primary)/0.25)] focus-visible:bg-[oklch(var(--primary)/0.25)]"
        />
      </div>

      <div className="md:hidden sticky top-0 z-40 w-full border-b border-[oklch(var(--border))] bg-[oklch(var(--background))]">
        <div className="flex items-center justify-between px-4 py-2">
          <span className="text-sm font-semibold text-[oklch(var(--foreground))]">NEXT TODO</span>
          <Button
            type="button"
            variant="ghost"
            size="mobileIcon"
            onClick={onOpenSettings}
            className="text-[oklch(var(--muted-foreground))]"
            aria-label="设置"
          >
            <Settings size={16} />
          </Button>
        </div>
        <div className="flex overflow-x-auto px-4 pb-2 gap-2 scrollbar-none">
          {NAV_ITEMS.map(({ section, label, icon: Icon }) => (
            <Button
              key={section}
              type="button"
              variant="ghost"
              onClick={() => {
                onSectionChange(section)
                setActiveSection(section)
              }}
              aria-current={activeSection === section ? 'page' : undefined}
              className={cn(
                'h-10 shrink-0 px-3 text-xs font-medium tracking-widest uppercase whitespace-nowrap',
                activeSection === section
                  ? 'bg-[oklch(var(--accent))] text-[oklch(var(--accent-foreground))]'
                  : 'text-[oklch(var(--muted-foreground))]'
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}
