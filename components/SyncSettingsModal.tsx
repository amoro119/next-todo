'use client'

import { useState } from 'react'
import { getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from '../lib/config/supabaseStorage'
import { clearSyncConfigCache } from '../lib/config/syncConfig'
import { useSyncStatus } from '../lib/hooks/useSyncStatus'
import { useDatabase } from '../app/providers/DatabaseProvider'

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
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
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
              onChange={(e) => {
                setSyncEnabled(e.target.checked)
                setConfirmClear(false)
              }}
            />
            <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-blue-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-4" />
          </label>
        </div>

        <div className="mb-6 border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700">清除本地数据</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {syncEnabled
                  ? '请先关闭实时同步再执行此操作'
                  : '将清空本地所有待办、清单和目标数据，操作不可恢复'}
              </p>
            </div>
            {!confirmClear && (
              <button
                type="button"
                disabled={syncEnabled}
                onClick={() => setConfirmClear(true)}
                className="shrink-0 px-3 py-1.5 text-xs rounded border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                清除数据
              </button>
            )}
          </div>

          {confirmClear && (
            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-red-600 mb-2 font-medium">⚠️ 确认要清除所有本地数据吗？此操作不可撤销。</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="px-3 py-1.5 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleClearLocalData}
                  disabled={clearing}
                  className="px-3 py-1.5 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-60"
                >
                  {clearing ? '清除中...' : '确认清除'}
                </button>
              </div>
            </div>
          )}
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
