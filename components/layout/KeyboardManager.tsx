'use client'
import React, { useEffect, useState, useCallback } from 'react'
import { Command } from 'cmdk'
import { useUIStore } from '@/lib/stores/uiStore'
import { cn } from '@/components/common/cn'
import { Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface SearchResult {
  id: string
  title: string
  type: 'todo' | 'goal'
  section: 'todo' | 'goals'
}

export function KeyboardManager() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results] = useState<SearchResult[]>([])
  const { setActiveSection } = useUIStore()

  // Open on Cmd+K / Ctrl+K
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleSelect = useCallback((result: SearchResult) => {
    setActiveSection(result.section)
    setOpen(false)
    setQuery('')
  }, [setActiveSection])

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { setOpen(nextOpen); if (!nextOpen) setQuery('') }}>
      <DialogContent
        size="md"
        className="overflow-hidden shadow-2xl"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">搜索待办和目标</DialogTitle>
        <DialogDescription className="sr-only">输入关键词搜索并打开待办事项或目标</DialogDescription>
        <Command shouldFilter={false}>
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[oklch(var(--border))]">
            <Search className="h-4 w-4 text-[oklch(var(--muted-foreground))] shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="搜索待办、目标..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-[oklch(var(--muted-foreground))]"
              autoFocus
            />
            <kbd className="text-xs text-[oklch(var(--muted-foreground))] border border-[oklch(var(--border))] rounded px-1.5 py-0.5">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-64 overflow-y-auto p-2">
            {query.length === 0 && (
              <Command.Empty className="py-6 text-center text-sm text-[oklch(var(--muted-foreground))]">
                输入关键词搜索...
              </Command.Empty>
            )}
            {query.length > 0 && results.length === 0 && (
              <Command.Empty className="py-6 text-center text-sm text-[oklch(var(--muted-foreground))]">
                未找到相关内容
              </Command.Empty>
            )}
            {results.map((result) => (
              <Command.Item
                key={result.id}
                value={result.id}
                onSelect={() => handleSelect(result)}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 rounded-md text-sm cursor-pointer',
                  'hover:bg-[oklch(var(--accent))] hover:text-[oklch(var(--accent-foreground))]',
                  'data-[selected=true]:bg-[oklch(var(--accent))] data-[selected=true]:text-[oklch(var(--accent-foreground))]'
                )}
              >
                <span className="text-xs text-[oklch(var(--muted-foreground))] w-8 shrink-0">
                  {result.type === 'todo' ? '待办' : '目标'}
                </span>
                <span className="flex-1 truncate">{result.title}</span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  )
}
