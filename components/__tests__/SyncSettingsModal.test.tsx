import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import SyncSettingsModal from '@/components/SyncSettingsModal'

const mockGetSupabaseConfig = vi.hoisted(() =>
  vi.fn(() => ({
    url: 'https://test.supabase.co',
    anonKey: 'test-anon-key',
  })),
)
const mockSaveSupabaseConfig = vi.hoisted(() => vi.fn())
const mockClearSyncConfigCache = vi.hoisted(() => vi.fn())

vi.mock('@/lib/config/supabaseStorage', () => ({
  getSupabaseConfig: mockGetSupabaseConfig,
  saveSupabaseConfig: mockSaveSupabaseConfig,
  clearSupabaseConfig: vi.fn(),
  hasSupabaseConfig: vi.fn(() => true),
}))

vi.mock('@/lib/hooks/useSyncStatus', () => ({
  useSyncStatus: vi.fn(() => ({
    isConnected: false,
    isSyncing: false,
    lastSyncTime: null,
    error: null,
    connectionStatus: 'disconnected' as const,
    pendingOperations: 0,
  })),
}))

vi.mock('@/lib/config/syncConfig', () => ({
  clearSyncConfigCache: mockClearSyncConfigCache,
  getSupabaseSyncConfig: vi.fn(() => ({ enabled: true })),
}))

const reloadMock = vi.fn()
Object.defineProperty(window, 'location', {
  value: { reload: reloadMock },
  writable: true,
})

describe('SyncSettingsModal', () => {
  const onClose = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the title "数据与备份设置"', () => {
    render(<SyncSettingsModal onClose={onClose} />)
    expect(screen.getByText('数据与备份设置')).toBeInTheDocument()
  })

  it('pre-fills URL and Anon Key from getSupabaseConfig', () => {
    render(<SyncSettingsModal onClose={onClose} />)
    expect(screen.getByDisplayValue('https://test.supabase.co')).toBeInTheDocument()
    const keyInput = screen.getByDisplayValue('test-anon-key')
    expect(keyInput).toBeInTheDocument()
    expect(keyInput).toHaveAttribute('type', 'password')
  })

  it('calls onClose when clicking the close button (×)', () => {
    render(<SyncSettingsModal onClose={onClose} />)
    fireEvent.click(screen.getByText('×'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when clicking the overlay/backdrop', () => {
    const { container } = render(<SyncSettingsModal onClose={onClose} />)
    const overlay = container.firstChild as HTMLElement
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls saveSupabaseConfig and reloads on save', () => {
    render(<SyncSettingsModal onClose={onClose} />)
    fireEvent.click(screen.getByText('保存'))
    expect(mockSaveSupabaseConfig).toHaveBeenCalled()
    expect(mockClearSyncConfigCache).toHaveBeenCalled()
    expect(reloadMock).toHaveBeenCalled()
  })
})
