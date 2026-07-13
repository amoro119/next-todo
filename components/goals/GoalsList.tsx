'use client'

import { useMemo, useState } from 'react'
import { Archive, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import type { Goal } from '@/lib/types'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

interface GoalsListProps {
  goals: Goal[]
  onGoalClick: (goal: Goal) => void
  onEditGoal: (goal: Goal) => void
  onArchiveGoal: (goalId: string) => void
  onDeleteGoal: (goalId: string) => void
  onCreateGoal?: () => void
  loading?: boolean
}

function priorityLabel(priority: number) {
  return ['无优先级', '低', '中', '高'][priority] ?? '无优先级'
}

function dueInfo(dueDate?: string | null, progress = 0) {
  if (!dueDate || progress === 100) return null
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000)
  if (days < 0) return { label: `逾期 ${Math.abs(days)} 天`, className: 'text-destructive' }
  if (days === 0) return { label: '今天到期', className: 'font-medium text-foreground' }
  if (days <= 3) return { label: `${days} 天后到期`, className: 'font-medium text-foreground' }
  return { label: new Date(dueDate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' }), className: 'text-muted-foreground' }
}

export default function GoalsList({ goals, onGoalClick, onEditGoal, onArchiveGoal, onDeleteGoal, onCreateGoal, loading = false }: GoalsListProps) {
  const [deleteTarget, setDeleteTarget] = useState<Goal | null>(null)
  const sortedGoals = useMemo(() => [...goals].sort((a, b) => {
    const aProgress = a.progress ?? 0
    const bProgress = b.progress ?? 0
    const aDue = a.due_date ? new Date(a.due_date).getTime() : Number.MAX_SAFE_INTEGER
    const bDue = b.due_date ? new Date(b.due_date).getTime() : Number.MAX_SAFE_INTEGER
    const aComplete = aProgress === 100 ? 1 : 0
    const bComplete = bProgress === 100 ? 1 : 0
    const aOverdue = aDue < Date.now() && aProgress < 100 ? 0 : 1
    const bOverdue = bDue < Date.now() && bProgress < 100 ? 0 : 1
    if (aOverdue !== bOverdue) return aOverdue - bOverdue
    if (aComplete !== bComplete) return aComplete - bComplete
    if (a.priority !== b.priority) return b.priority - a.priority
    if (aDue !== bDue) return aDue - bDue
    return new Date(b.created_time).getTime() - new Date(a.created_time).getTime()
  }), [goals])

  if (loading) {
    return <div className="space-y-3" aria-label="正在加载目标"><div className="h-28 animate-pulse rounded-lg bg-muted" /><div className="h-28 animate-pulse rounded-lg bg-muted" /></div>
  }

  if (!sortedGoals.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center text-sm text-muted-foreground">
        <p className="text-sm text-muted-foreground">还没有进行中的目标</p>
        {onCreateGoal && <Button type="button" size="sm" onClick={onCreateGoal}><Plus className="h-4 w-4" aria-hidden="true" />创建目标</Button>}
      </div>
    )
  }

  return (
    <>
      <ul aria-label="目标列表">
      {sortedGoals.map((goal) => {
        const progress = Math.max(0, Math.min(100, goal.progress ?? 0))
        const done = goal.total_tasks ? `${goal.completed_tasks ?? 0}/${goal.total_tasks} 项任务` : '尚未添加任务'
        const due = dueInfo(goal.due_date, progress)
        return (
          <li key={goal.id} className="group mb-3 w-full rounded-lg border border-border bg-card transition-all duration-300">
            <div className="min-h-[88px] w-full px-4 py-4">
              <div className="flex min-h-8 items-center justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <h2 className="min-w-0">
                    <a
                      href={`#goal-${goal.id}`}
                      className="block truncate text-sm font-semibold text-foreground underline-offset-4 focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      onClick={(event) => {
                        event.preventDefault()
                        onGoalClick(goal)
                      }}
                    >
                      {goal.name}
                    </a>
                  </h2>
                  {goal.priority > 0 && <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{priorityLabel(goal.priority)}</span>}
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-8 w-3 shrink-0" aria-label={`打开目标 ${goal.name} 的操作菜单`}><MoreHorizontal className="h-4 w-4" aria-hidden="true" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => onEditGoal(goal)}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" />编辑</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onArchiveGoal(goal.id)}><Archive className="mr-2 h-4 w-4" aria-hidden="true" />存档</DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setDeleteTarget(goal)}><Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />删除</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <div>
                {goal.description && <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">{goal.description}</p>}
                <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>{done}</span><span className="font-medium text-foreground">{progress}%</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[oklch(var(--border))]" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.name} 完成度`}>
                  <div className="h-full rounded-full bg-[oklch(var(--primary))] transition-[width] duration-300" style={{ width: `${progress}%` }} />
                </div>
                {due && <p className={`mt-2 text-xs ${due.className}`}>{due.label}</p>}
              </div>
            </div>
          </li>
        )
      })}
      </ul>
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>删除目标？</AlertDialogTitle><AlertDialogDescription>“{deleteTarget?.name}”会被删除，已关联任务会保留但解除关联。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={() => { if (deleteTarget) onDeleteGoal(deleteTarget.id); setDeleteTarget(null) }}>删除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
