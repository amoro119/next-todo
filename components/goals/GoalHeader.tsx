'use client'

import { ArrowLeft, Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Goal } from '@/lib/types'

interface GoalHeaderProps {
  selectedGoal: Goal | null
  goalCount: number
  onBackToList: () => void
  onEditGoal?: (goal: Goal) => void
}

function priorityLabel(priority: number) {
  return ['无优先级', '低优先级', '中优先级', '高优先级'][priority] ?? '无优先级'
}

function dueLabel(dueDate?: string | null) {
  if (!dueDate) return null
  const days = Math.ceil((new Date(dueDate).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: `逾期 ${Math.abs(days)} 天`, className: 'text-destructive bg-destructive/10' }
  if (days === 0) return { text: '今天到期', className: 'text-foreground bg-muted' }
  if (days <= 3) return { text: `${days} 天后到期`, className: 'text-foreground bg-muted' }
  return { text: `${days} 天后到期`, className: 'text-muted-foreground bg-muted' }
}

export default function GoalHeader({ selectedGoal, onBackToList, onEditGoal }: GoalHeaderProps) {
  if (!selectedGoal) return null
  const due = dueLabel(selectedGoal.due_date)

  return (
    <header className="flex items-center gap-3 py-4 sm:py-5">
      <Button type="button" variant="ghost" size="icon" onClick={onBackToList} aria-label="返回目标列表">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h1 className="truncate text-base font-semibold text-foreground">{selectedGoal.name}</h1>
          {selectedGoal.priority > 0 && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
              {priorityLabel(selectedGoal.priority)}
            </span>
          )}
        </div>
        {due && <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] ${due.className}`}>{due.text}</span>}
      </div>
      {onEditGoal && (
        <Button type="button" variant="outline" size="sm" onClick={() => onEditGoal(selectedGoal)}>
          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="hidden sm:inline">编辑</span>
          <span className="sr-only sm:hidden">编辑目标</span>
        </Button>
      )}
    </header>
  )
}
