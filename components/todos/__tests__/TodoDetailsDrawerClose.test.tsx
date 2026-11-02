import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { Todo } from '@/lib/types'
const state = vi.hoisted(() => ({ desktop: true }))
vi.mock('@/lib/hooks/useIsDesktopLayout', () => ({ useIsDesktopLayout: () => state.desktop }))
vi.mock('@/components/TodoModal', () => ({ default: ({ isOpen }: { isOpen: boolean }) => <div data-testid="editor" data-open={isOpen} /> }))
import TodoDetailsDrawer from '../TodoDetailsDrawer'
afterEach(cleanup)
const todo = { id: 'close-test', title: '关闭测试' } as Todo
const props = { goals: [], lists: [], onSubmit: vi.fn(), onUpdate: vi.fn(), onDelete: vi.fn(), onRestore: vi.fn(), onPermanentDelete: vi.fn(), onClose: vi.fn() }
it('releases desktop drawer and separator together without waiting for animation', () => {
  state.desktop = true
  const { rerender, container } = render(<TodoDetailsDrawer {...props} todo={todo} />)
  expect(screen.queryByTestId('editor')).not.toBeNull()
  rerender(<TodoDetailsDrawer {...props} todo={null} />)
  expect(screen.queryByTestId('editor')).toBeNull()
  expect(screen.queryByRole('separator')).toBeNull()
  expect(container.querySelector('aside')?.style.width).toBe('0px')
  state.desktop = false
  rerender(<TodoDetailsDrawer {...props} todo={null} />)
  expect(screen.queryByTestId('editor')).toBeNull()
  state.desktop = true
  rerender(<TodoDetailsDrawer {...props} todo={todo} />)
  expect(screen.queryByTestId('editor')).not.toBeNull()
})
it('keeps mobile editor content unchanged during its exit animation', () => {
  state.desktop = false
  const { rerender } = render(<TodoDetailsDrawer {...props} todo={todo} />)
  rerender(<TodoDetailsDrawer {...props} todo={null} />)
  expect(screen.getByTestId('editor').getAttribute('data-open')).toBe('true')
})
