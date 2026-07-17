'use client'

import { useState } from 'react'
import { cn } from '@/components/common/cn'
import { Button } from '@/components/ui/button'
import GeneralSettings from './GeneralSettings'
import ListsSettings from './ListsSettings'
import DataBackupSettings from './DataBackupSettings'
import SyncSettings from './SyncSettings'
import AboutSettings from './AboutSettings'

type SettingsPage = 'general' | 'lists' | 'data' | 'sync' | 'about'

const NAV_ITEMS: { id: SettingsPage; label: string;}[] = [
  { id: 'general', label: '通用' },
  { id: 'lists', label: '清单管理'},
  { id: 'data', label: '数据与备份' },
  { id: 'sync', label: '同步设置' },
  { id: 'about', label: '关于' },
]

export default function SettingsShell() {
  const [activePage, setActivePage] = useState<SettingsPage>('general')

  const renderPage = () => {
    switch (activePage) {
      case 'general': return <GeneralSettings />
      case 'lists': return <ListsSettings />
      case 'data': return <DataBackupSettings />
      case 'sync': return <SyncSettings />
      case 'about': return <AboutSettings />
    }
  }

  return (
    <div className="flex h-full bg-[oklch(var(--background))]">
      <nav className="hidden md:flex flex-col w-48 shrink-0 border-r border-[oklch(var(--border))] py-4 gap-1">
        {NAV_ITEMS.map((item) => (
          <Button
            key={item.id}
            type="button"
            variant="ghost"
            onClick={() => setActivePage(item.id)}
            aria-current={activePage === item.id ? 'page' : undefined}
            className={cn(
              'mx-2 justify-start px-4 text-sm',
              activePage === item.id
                ? 'bg-[oklch(var(--accent))] text-[oklch(var(--accent-foreground))] font-medium'
                : 'text-[oklch(var(--muted-foreground))]'
            )}
          >
            {item.label}
          </Button>
        ))}
      </nav>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden md:contents">
        <div className="mobile-scroll-x md:hidden flex shrink-0 sticky top-0 z-10 gap-2 overflow-x-auto border-b border-[oklch(var(--border))] bg-[oklch(var(--background))] px-4 py-3 pr-12 scrollbar-none [mask-image:linear-gradient(to_right,transparent,black_16px,black_calc(100%-32px),transparent)]">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.id}
              type="button"
              variant={activePage === item.id ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setActivePage(item.id)}
              aria-current={activePage === item.id ? 'page' : undefined}
              className="flex-shrink-0 whitespace-nowrap"
            >
              {item.label}
            </Button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
