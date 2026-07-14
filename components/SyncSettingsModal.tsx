'use client'

import { useState } from 'react'
import { getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from '../lib/config/supabaseStorage'
import { clearSyncConfigCache } from '../lib/config/syncConfig'
import { useSyncStatus } from '../lib/hooks/useSyncStatus'
import { useDatabase } from '@/app/providers/DatabaseProvider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface SyncSettingsModalProps {
  onClose: () => void
}

export default function SyncSettingsModal({ onClose }: SyncSettingsModalProps) {
  const saved = getSupabaseConfig()
  const [url, setUrl] = useState(saved.url ?? '')
  const [anonKey, setAnonKey] = useState(saved.anonKey ?? '')
  const [syncEnabled, setSyncEnabled] = useState(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('sync_enabled') !== 'false'
      : true
  )
  const [confirmClear, setConfirmClear] = useState(false)
  const [clearing, setClearing] = useState(false)

  const { connectionStatus } = useSyncStatus()
  const { api } = useDatabase()

  const statusDot: Record<string, { color: string; label: string }> = {
    connected:    { color: 'bg-green-500',  label: '已连接' },
    connecting:   { color: 'bg-yellow-500', label: '连接中...' },
    disconnected: { color: 'bg-[oklch(var(--muted-foreground))]', label: '未连接' },
    error:        { color: 'bg-[oklch(var(--destructive))]', label: '连接错误' },
  }
  const status = statusDot[connectionStatus] ?? statusDot.disconnected

  function handleSave() {
    saveSupabaseConfig(url.trim(), anonKey.trim())
    localStorage.setItem('sync_enabled', syncEnabled ? 'true' : 'false')
    clearSyncConfigCache()
    window.location.reload()
  }

  async function handleClearLocalData() {
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent size="md" className="max-h-[calc(100dvh-2rem)]">
        <DialogHeader>
          <DialogTitle>数据与备份设置</DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <div className="flex items-center gap-2 text-sm text-[oklch(var(--muted-foreground))]">
            <span className={`inline-block h-2 w-2 rounded-full ${status.color}`} />
            <span>Supabase 连接状态：{status.label}</span>
          </div>

          <div className="space-y-2">
            <label htmlFor="sync-settings-url" className="block text-sm font-medium text-[oklch(var(--foreground))]">Supabase URL</label>
            <Input
              id="sync-settings-url"
              type="text"
              placeholder="https://xxx.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="sync-settings-key" className="block text-sm font-medium text-[oklch(var(--foreground))]">Anon Key</label>
            <Input
              id="sync-settings-key"
              type="password"
              placeholder="eyJ..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between border-b border-[oklch(var(--border))] py-3">
            <span className="text-sm font-medium text-[oklch(var(--foreground))]">启用实时同步</span>
            <label className="relative inline-flex cursor-pointer items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={syncEnabled}
                onChange={(e) => {
                  setSyncEnabled(e.target.checked)
                  setConfirmClear(false)
                }}
              />
              <span className="relative h-6 w-10 rounded-full bg-[oklch(var(--muted))] transition-colors after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:bg-[oklch(var(--primary))] peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-[oklch(var(--ring))]" />
            </label>
          </div>

          <div className="space-y-3 rounded-lg border border-[oklch(var(--destructive)/0.3)] p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-[oklch(var(--foreground))]">清除本地数据</p>
                <p className="mt-0.5 text-xs text-[oklch(var(--muted-foreground))]">
                  {syncEnabled
                    ? '请先关闭实时同步再执行此操作'
                    : '将清空本地所有待办、清单和目标数据，操作不可恢复'}
                </p>
              </div>
              {!confirmClear && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={syncEnabled}
                  onClick={() => setConfirmClear(true)}
                  className="shrink-0 border-[oklch(var(--destructive)/0.4)] text-[oklch(var(--destructive))] hover:bg-[oklch(var(--destructive)/0.1)]"
                >
                  清除数据
                </Button>
              )}
            </div>

            {confirmClear && (
              <div className="border-t border-[oklch(var(--border))] pt-3">
                <p className="mb-2 text-xs font-medium text-[oklch(var(--destructive))]">确认要清除所有本地数据吗？此操作不可撤销。</p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setConfirmClear(false)}>取消</Button>
                  <Button type="button" size="sm" variant="destructive" onClick={handleClearLocalData} disabled={clearing}>
                    {clearing ? '清除中...' : '确认清除'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="button" onClick={handleSave}>保存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
