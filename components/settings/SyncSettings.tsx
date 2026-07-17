'use client'

import { useState } from 'react'
import { getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from '@/lib/config/supabaseStorage'
import { clearSyncConfigCache } from '@/lib/config/syncConfig'
import { useSyncStatus } from '@/lib/hooks/useSyncStatus'
import { useDatabase } from '@/app/providers/DatabaseProvider'
import { cn } from '@/components/common/cn'

const STATUS_MAP: Record<string, { dot: string; label: string }> = {
  connected:    { dot: 'bg-green-500',  label: '已连接' },
  connecting:   { dot: 'bg-yellow-500', label: '连接中...' },
  disconnected: { dot: 'bg-[oklch(var(--muted-foreground))]', label: '未连接' },
  error:        { dot: 'bg-red-500',    label: '连接错误' },
}

export default function SyncSettings() {
  const saved = getSupabaseConfig()
  const [url, setUrl] = useState(saved.url ?? '')
  const [anonKey, setAnonKey] = useState(saved.anonKey ?? '')
  const [syncEnabled, setSyncEnabled] = useState(
    typeof localStorage !== 'undefined' ? localStorage.getItem('sync_enabled') !== 'false' : true
  )
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const { connectionStatus } = useSyncStatus()
  const { api } = useDatabase()

  const status = STATUS_MAP[connectionStatus] ?? STATUS_MAP.disconnected

  const handleSave = () => {
    saveSupabaseConfig(url.trim(), anonKey.trim())
    localStorage.setItem('sync_enabled', syncEnabled ? 'true' : 'false')
    clearSyncConfigCache()
    window.location.reload()
  }

  const handleClearLocalData = async () => {
    setClearing(true)
    try {
      localStorage.setItem('sync_enabled', 'false')
      clearSyncConfigCache()
      clearSupabaseConfig()
      await api.clearLocalData()
      window.location.reload()
    } finally {
      setClearing(false)
      setConfirmClear(false)
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <h2 className="text-lg font-semibold text-[oklch(var(--foreground))]">同步设置</h2>

      <div className="flex items-center gap-2 text-sm text-[oklch(var(--muted-foreground))]">
        <span className={cn('w-2 h-2 rounded-full inline-block', status.dot)} />
        Supabase 连接状态：{status.label}
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[oklch(var(--foreground))]">Supabase URL</label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://xxx.supabase.co"
          className="form-control w-full px-3 py-2 text-sm"
        />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[oklch(var(--foreground))]">Anon Key</label>
        <input
          type="password"
          value={anonKey}
          onChange={(e) => setAnonKey(e.target.value)}
          placeholder="eyJ..."
          className="form-control w-full px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center justify-between py-3 border-b border-[oklch(var(--border))]">
        <span className="text-sm font-medium text-[oklch(var(--foreground))]">启用实时同步</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            className="sr-only peer"
            checked={syncEnabled}
            onChange={(e) => { setSyncEnabled(e.target.checked); setConfirmClear(false) }}
          />
          <div className="w-10 h-6 bg-[oklch(var(--muted))] peer-focus:outline-none rounded-full peer peer-checked:bg-[oklch(var(--primary))] after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
        </label>
      </div>

      <button
        onClick={handleSave}
        className="px-4 py-2 rounded-lg bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))] text-sm font-medium hover:opacity-90 transition-opacity"
      >
        保存并重启
      </button>

      <div className="rounded-lg border border-[oklch(var(--destructive)/0.3)] p-4 space-y-3">
        <p className="text-sm font-medium text-[oklch(var(--foreground))]">清除本地数据</p>
        <p className="text-xs text-[oklch(var(--muted-foreground))]">
          {syncEnabled ? '请先关闭实时同步再执行此操作' : '将清空本地所有待办、清单和目标数据，操作不可恢复'}
        </p>
        {!confirmClear ? (
          <button
            disabled={syncEnabled}
            onClick={() => setConfirmClear(true)}
            className="px-3 py-1.5 text-xs rounded border border-[oklch(var(--destructive)/0.4)] text-[oklch(var(--destructive))] hover:bg-[oklch(var(--destructive)/0.1)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            清除本地数据
          </button>
        ) : (
          <div className="flex gap-2 items-center">
            <button
              disabled={clearing}
              onClick={handleClearLocalData}
              className="px-3 py-1.5 text-xs rounded bg-[oklch(var(--destructive))] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {clearing ? '清除中...' : '确认清除'}
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="px-3 py-1.5 text-xs rounded border border-[oklch(var(--border))] hover:bg-[oklch(var(--muted))]"
            >
              取消
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
