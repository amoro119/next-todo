'use client'

import { useState } from 'react'
import { cn } from '@/components/common/cn'
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
          <button
            key={item.id}
            onClick={() => setActivePage(item.id)}
            className={cn(
              'flex items-center gap-2.5 px-4 py-2 text-sm rounded-lg mx-2 transition-colors text-left',
              activePage === item.id
                ? 'bg-[oklch(var(--primary)/0.1)] text-[oklch(var(--primary))] font-medium'
                : 'text-[oklch(var(--muted-foreground))] hover:bg-[oklch(var(--muted))] hover:text-[oklch(var(--foreground))]'
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden md:contents">
        <div className="md:hidden flex gap-2 px-4 py-3 border-b border-[oklch(var(--border))] overflow-x-auto scrollbar-none shrink-0 sticky top-0 bg-[oklch(var(--background))] z-10">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={cn(
                'flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors whitespace-nowrap',
                activePage === item.id
                  ? 'bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))]'
                  : 'bg-[oklch(var(--muted))] text-[oklch(var(--muted-foreground))]'
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-6">
          {renderPage()}
        </div>
      </div>
    </div>
  )
}
