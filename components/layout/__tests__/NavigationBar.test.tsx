import React from 'react'
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({ syncing: false, listeners: new Set<() => void>(), layout: vi.fn() }))
vi.mock('@/lib/hooks/useSyncStatus', () => ({ useIsSyncing: () => React.useSyncExternalStore((fn) => { state.listeners.add(fn); return () => { state.listeners.delete(fn) } }, () => state.syncing) }))
vi.mock('@/lib/hooks/useNavResize', () => ({ useNavResize: () => { state.layout(); return { navWidth: 220, isResizing: false, resizeHandleProps: {} } } }))
vi.mock('@/components/PWAInstallButton', () => ({ PWAInstallButton: () => null }))
import { NavigationBar } from '../NavigationBar'
afterEach(() => { cleanup(); localStorage.clear(); state.syncing = false; state.layout.mockClear() })
describe('navigation during sync', () => {
  it('updates sync status without rendering the navigation and allows expansion', () => {
    render(<NavigationBar onOpenSettings={() => {}} onSectionChange={() => {}} />)
    const renders = state.layout.mock.calls.length
    act(() => { state.syncing = true; state.listeners.forEach(fn => fn()) })
    expect(screen.getByRole('status').textContent).toBe('同步中')
    expect(state.layout.mock.calls.length).toBe(renders)
    fireEvent.click(screen.getByRole('button', { name: '收起侧边栏' }))
    expect(document.getElementById('desktop-sidebar')?.style.width).toBe('64px')
    fireEvent.click(screen.getByRole('button', { name: '展开侧边栏' }))
    expect(document.getElementById('desktop-sidebar')?.style.width).toBe('220px')
    expect(document.getElementById('desktop-sidebar')?.className).not.toContain('transition-[width]')
  })
})
