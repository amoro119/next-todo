'use client'

import { useMemo, useState } from 'react'
import { ArchiveRestore, Search, Trash2 } from 'lucide-react'
import type { Goal } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ArchivedGoalsListProps {
  goals: Goal[]
  onRestoreGoal: (goalId: string) => void
  onDeleteGoal: (goalId: string) => void
  onViewGoal: (goal: Goal) => void
}

export default function ArchivedGoalsList({ goals, onRestoreGoal, onDeleteGoal, onViewGoal }: ArchivedGoalsListProps) {
  const [query, setQuery] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)
  const filtered = useMemo(() => goals.filter((goal) => goal.name.toLowerCase().includes(query.toLowerCase())), [goals, query])

  return (
    <>
      <div className="space-y-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            aria-label="搜索已存档目标"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索已存档目标"
            className="form-control h-9 w-full pl-9 pr-3 text-sm placeholder:text-muted-foreground"
          />
        </div>

        {!filtered.length ? (
          <div className="flex items-center justify-center py-16 text-center">
            <p className="text-sm text-muted-foreground">{query ? '未找到匹配的目标' : '暂无已存档目标'}</p>
          </div>
        ) : (
          <ul aria-label="已存档目标列表">
            {filtered.map((goal) => (
              <li key={goal.id} className="mb-2 flex min-h-[60px] items-center gap-3 rounded-lg border border-border bg-card px-6 py-4">
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onViewGoal(goal)}
                >
                  {goal.name}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{goal.progress ?? 0}%</span>
                </button>
                <Button type="button" variant="ghost" size="icon" aria-label={`恢复目标 ${goal.name}`} onClick={() => onRestoreGoal(goal.id)}>
                  <ArchiveRestore className="h-4 w-4" aria-hidden="true" />
                </Button>
                <Button type="button" variant="ghost" size="icon" aria-label={`删除目标 ${goal.name}`} onClick={() => setDeleteTarget(goal)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>删除已存档目标？</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除目标“{deleteTarget?.name}”吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[oklch(var(--destructive))] text-[oklch(var(--destructive-foreground))] hover:bg-[oklch(var(--destructive)/0.9)]"
              onClick={() => {
                if (deleteTarget) onDeleteGoal(deleteTarget.id)
                setDeleteTarget(null)
              }}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
