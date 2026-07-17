'use client'

import { useEffect, useState } from 'react'
import { CalendarDays, CheckSquare, PanelLeftClose, PanelLeftOpen, Settings, Target } from 'lucide-react'
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

const COLLAPSED_NAV_WIDTH = 64
const COLLAPSED_STORAGE_KEY = 'navPanelCollapsed'

interface NavigationBarProps {
  onOpenSettings: () => void
  onSectionChange: (section: AppSection) => void
}

export function NavigationBar({ onOpenSettings, onSectionChange }: NavigationBarProps) {
  const { navWidth, isResizing, resizeHandleProps } = useNavResize()
  const { isSyncing } = useSyncStatus()
  const activeSection = useUIStore((s) => s.activeSection)
  const setActiveSection = useUIStore((s) => s.setActiveSection)
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    setIsCollapsed(window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true')
  }, [])

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, String(isCollapsed))
  }, [isCollapsed])

  const toggleCollapsed = () => setIsCollapsed((value) => !value)

  return (
    <>
      <div
        id="desktop-sidebar"
        className={cn(
          'hidden md:flex flex-col h-full border-r border-[oklch(var(--border))] bg-[oklch(var(--background))] relative shrink-0',
          isResizing ? 'transition-none' : 'transition-[width] duration-200 ease-out'
        )}
        style={{ width: `${isCollapsed ? COLLAPSED_NAV_WIDTH : navWidth}px` }}
      >
        <div className={cn('flex items-center px-3 py-4', isCollapsed ? 'justify-center' : 'justify-between')}>
          {!isCollapsed && <span className="text-sm font-semibold text-[oklch(var(--foreground))]">NEXT TODO</span>}
          <div className={cn('flex items-center gap-1', isCollapsed && 'flex-col')}>
            <PWAInstallButton />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={toggleCollapsed}
              className="text-[oklch(var(--muted-foreground))]"
              aria-label={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
              aria-expanded={!isCollapsed}
              aria-controls="desktop-sidebar"
              title={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
            >
              {isCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
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
              aria-label={label}
              title={isCollapsed ? label : undefined}
              className={cn(
                'relative h-9 text-xs font-medium tracking-widest uppercase whitespace-nowrap',
                isCollapsed ? 'justify-center px-0' : 'justify-start px-3',
                activeSection === section
                  ? 'bg-[oklch(var(--accent))] text-[oklch(var(--accent-foreground))]'
                  : 'text-[oklch(var(--muted-foreground))]'
              )}
            >
              <span className={cn('absolute left-0 h-5 w-0.5 rounded-full bg-[oklch(var(--primary))] opacity-0', activeSection === section && 'opacity-100')} />
              <Icon className="h-4 w-4" />
              <span className={cn(isCollapsed && 'sr-only')}>{label}</span>
            </Button>
          ))}
        </nav>

        <div className={cn('mt-auto hidden md:flex flex-col gap-1 px-2', process.env.NODE_ENV === 'development' ? 'pb-16' : 'pb-3')}>
          {isSyncing && (
            <div className={cn('flex items-center gap-2 px-3 py-2 text-xs text-[oklch(var(--muted-foreground))]', isCollapsed && 'justify-center px-0')}>
              <div className="h-3 w-3 shrink-0 animate-spin rounded-full border border-current border-t-transparent" />
              <span className={cn(isCollapsed && 'sr-only')}>同步中</span>
            </div>
          )}

          <Button
            type="button"
            variant="ghost"
            onClick={onOpenSettings}
            className={cn(
              'w-full text-[oklch(var(--muted-foreground))]',
              isCollapsed ? 'justify-center px-0' : 'justify-start px-3'
            )}
            aria-label="设置"
            title={isCollapsed ? '设置' : undefined}
          >
            <Settings size={16} />
            <span className={cn(isCollapsed && 'sr-only')}>设置</span>
          </Button>
        </div>

        <div
          {...resizeHandleProps}
          className={cn(
            'absolute right-0 top-0 bottom-0 w-2 translate-x-1 rounded-full transition-colors hover:bg-[oklch(var(--primary)/0.25)] focus-visible:bg-[oklch(var(--primary)/0.25)]',
            isCollapsed && 'pointer-events-none opacity-0'
          )}
        />
      </div>

      <div className="mobile-app-nav sticky top-0 z-40 w-full border-b border-[oklch(var(--border))] bg-[oklch(var(--background))] md:hidden">
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
        <div className="mobile-scroll-x flex gap-2 overflow-x-auto px-4 pb-2 scrollbar-none">
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
