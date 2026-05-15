'use client'

import { useState } from 'react'
import { getSupabaseConfig, saveSupabaseConfig } from '../lib/config/supabaseStorage'
import { clearSyncConfigCache } from '../lib/config/syncConfig'
import { useSyncStatus } from '../lib/hooks/useSyncStatus'

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

  const { connectionStatus } = useSyncStatus()

  const statusDot: Record<string, { color: string; label: string }> = {
    connected:    { color: 'bg-green-500',  label: '已连接' },
    connecting:   { color: 'bg-yellow-500', label: '连接中...' },
    disconnected: { color: 'bg-gray-400',   label: '未连接' },
    error:        { color: 'bg-red-500',    label: '连接错误' },
  }
  const status = statusDot[connectionStatus] ?? statusDot.disconnected

  function handleSave() {
    saveSupabaseConfig(url.trim(), anonKey.trim())
    localStorage.setItem('sync_enabled', syncEnabled ? 'true' : 'false')
    clearSyncConfigCache()
    window.location.reload()
  }

  return (
    <div
      className="modal-overlay fixed inset-0 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-gray-800">数据与备份</h2>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
            onClick={onClose}
            aria-label="关闭"
          >
            ×
          </button>
        </div>

        <div className="flex items-center mb-5 text-sm text-gray-600">
          <span className={`w-2 h-2 rounded-full inline-block mr-2 ${status.color}`} />
          <span>Supabase 连接状态：{status.label}</span>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Supabase URL
          </label>
          <input
            type="text"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="https://xxx.supabase.co"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Anon Key
          </label>
          <input
            type="password"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="eyJ..."
            value={anonKey}
            onChange={(e) => setAnonKey(e.target.value)}
          />
        </div>

        <div className="flex items-center justify-between mb-6">
          <span className="text-sm font-medium text-gray-700">启用实时同步</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              className="sr-only peer"
              checked={syncEnabled}
              onChange={(e) => setSyncEnabled(e.target.checked)}
            />
            <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
            onClick={handleSave}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
