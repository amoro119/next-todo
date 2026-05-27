'use client'

import { useRef } from 'react'
import { useSyncOperations } from '@/lib/hooks/useSyncOperations'
import { useTodosQuery, useListsQuery } from '@/lib/hooks/useDexieQuery'

export default function DataBackupSettings() {
  const { data: todos } = useTodosQuery()
  const { data: lists } = useListsQuery()
  const { handleImport, handleExport } = useSyncOperations(todos, lists)
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="max-w-lg space-y-6">
      <h2 className="text-lg font-semibold text-[oklch(var(--foreground))]">数据与备份</h2>

      <div className="rounded-lg border border-[oklch(var(--border))] p-4 space-y-3">
        <p className="text-sm font-medium text-[oklch(var(--foreground))]">导入滴答清单 CSV</p>
        <p className="text-xs text-[oklch(var(--muted-foreground))]">支持从滴答清单导出的 .csv 文件，保留清单、重复任务等信息</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) handleImport(file)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 rounded-lg bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))] text-sm font-medium hover:opacity-90 transition-opacity"
        >
          选择 CSV 文件
        </button>
      </div>

      <div className="rounded-lg border border-[oklch(var(--border))] p-4 space-y-3">
        <p className="text-sm font-medium text-[oklch(var(--foreground))]">导出本地数据</p>
        <p className="text-xs text-[oklch(var(--muted-foreground))]">将所有待办事项和清单导出为 JSON 文件备份</p>
        <button
          onClick={handleExport}
          className="px-4 py-2 rounded-lg border border-[oklch(var(--border))] text-[oklch(var(--foreground))] text-sm font-medium hover:bg-[oklch(var(--muted))] transition-colors"
        >
          导出 JSON
        </button>
      </div>
    </div>
  )
}
