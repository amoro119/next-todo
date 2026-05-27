'use client'

import { ThemeToggle } from '@/components/ThemeToggle'

export default function GeneralSettings() {
  return (
    <div className="max-w-lg space-y-6">
      <h2 className="text-lg font-semibold text-[oklch(var(--foreground))]">通用设置</h2>

      <div className="flex items-center justify-between py-3 border-b border-[oklch(var(--border))]">
        <div>
          <p className="text-sm font-medium text-[oklch(var(--foreground))]">外观主题</p>
          <p className="text-xs text-[oklch(var(--muted-foreground))] mt-0.5">切换深色 / 浅色模式</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex items-center justify-between py-3 border-b border-[oklch(var(--border))]">
        <div>
          <p className="text-sm font-medium text-[oklch(var(--foreground))]">语言</p>
          <p className="text-xs text-[oklch(var(--muted-foreground))] mt-0.5">界面语言</p>
        </div>
        <span className="text-sm text-[oklch(var(--muted-foreground))]">中文（简体）</span>
      </div>
    </div>
  )
}
