'use client'

export default function AboutSettings() {
  return (
    <div className="max-w-lg space-y-6">
      <h2 className="text-lg font-semibold text-[oklch(var(--foreground))]">关于</h2>

      <div className="space-y-3 text-sm text-[oklch(var(--muted-foreground))]">
        <div className="flex justify-between py-2 border-b border-[oklch(var(--border))]">
          <span className="text-[oklch(var(--foreground))]">版本</span>
          <span>1.0.0</span>
        </div>
        <div className="flex justify-between py-2 border-b border-[oklch(var(--border))]">
          <span className="text-[oklch(var(--foreground))]">技术栈</span>
          <span>Next.js · Dexie · Supabase</span>
        </div>
        <div className="flex justify-between py-2 border-b border-[oklch(var(--border))]">
          <span className="text-[oklch(var(--foreground))]">数据存储</span>
          <span>本地优先（IndexedDB）</span>
        </div>
      </div>
    </div>
  )
}
