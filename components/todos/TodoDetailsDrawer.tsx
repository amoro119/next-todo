'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import TodoModal from '@/components/TodoModal'
import type { Goal, List, Todo } from '@/lib/types'

interface TodoDetailsDrawerProps {
  todo: Todo | null
  goals: Goal[]
  lists: List[]
  onSubmit: (todo: Todo) => void | Promise<void>
  onUpdate: (todoId: string, updates: Partial<Todo>) => Promise<void>
  onDelete: (todoId: string) => void | Promise<void>
  onRestore: (todoId: string) => void | Promise<void>
  onPermanentDelete: (todoId: string) => void | Promise<void>
  onClose: () => void
}

const DEFAULT_DRAWER_WIDTH = 512
const MIN_DRAWER_WIDTH = 360
const MAX_DRAWER_WIDTH = 720
const MIN_MAIN_WIDTH = 400
// 与目标详情共用宽度偏好，保证两种侧栏在页面间保持一致。
const DRAWER_WIDTH_STORAGE_KEY = 'next-todo:goal-details-drawer-width'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export default function TodoDetailsDrawer({
  todo,
  goals,
  lists,
  onSubmit,
  onUpdate,
  onDelete,
  onRestore,
  onPermanentDelete,
  onClose,
}: TodoDetailsDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null)
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_DRAWER_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [mountedTodo, setMountedTodo] = useState<Todo | null>(todo)

  useEffect(() => {
    if (todo) setMountedTodo(todo)
  }, [todo])

  const getDrawerBounds = useCallback(() => {
    const containerWidth = drawerRef.current?.parentElement?.clientWidth ?? window.innerWidth
    const maxWidth = Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, containerWidth - MIN_MAIN_WIDTH))
    return { min: Math.min(MIN_DRAWER_WIDTH, maxWidth), max: maxWidth }
  }, [])

  const constrainDrawerWidth = useCallback(
    (width: number) => {
      const { min, max } = getDrawerBounds()
      return clamp(width, min, max)
    },
    [getDrawerBounds]
  )

  const restoreDragStyles = useCallback(() => {
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  const stopResizing = useCallback(() => {
    dragStateRef.current = null
    setIsResizing(false)
    restoreDragStyles()
  }, [restoreDragStyles])

  useEffect(() => {
    if (!todo) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [todo, onClose])

  useEffect(() => {
    const storedWidth = Number(window.localStorage.getItem(DRAWER_WIDTH_STORAGE_KEY))
    if (Number.isFinite(storedWidth) && storedWidth > 0) {
      setDrawerWidth(constrainDrawerWidth(storedWidth))
    }
  }, [constrainDrawerWidth])

  useEffect(() => {
    window.localStorage.setItem(DRAWER_WIDTH_STORAGE_KEY, String(drawerWidth))
  }, [drawerWidth])

  useEffect(() => restoreDragStyles, [restoreDragStyles])

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return

    event.preventDefault()
    dragStateRef.current = {
      startX: event.clientX,
      startWidth: constrainDrawerWidth(drawerWidth),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    setIsResizing(true)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current
    if (!dragState) return

    setDrawerWidth(constrainDrawerWidth(dragState.startWidth + dragState.startX - event.clientX))
  }

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    stopResizing()
  }

  const adjustDrawerWidth = (amount: number) => {
    setDrawerWidth((currentWidth) => constrainDrawerWidth(currentWidth + amount))
  }

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 48 : 24

    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      adjustDrawerWidth(step)
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault()
      adjustDrawerWidth(-step)
    }

    if (event.key === 'Home') {
      event.preventDefault()
      setDrawerWidth(getDrawerBounds().min)
    }

    if (event.key === 'End') {
      event.preventDefault()
      setDrawerWidth(getDrawerBounds().max)
    }
  }

  const drawerCssWidth = `min(100%, ${drawerWidth}px)`
  const displayTodo = todo ?? mountedTodo

  return (
    <>
      {todo && (
        <div
          role="separator"
          aria-label="调整任务详情宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_DRAWER_WIDTH}
          aria-valuemax={MAX_DRAWER_WIDTH}
          aria-valuenow={Math.round(drawerWidth)}
          aria-valuetext={`${Math.round(drawerWidth)} 像素`}
          tabIndex={0}
          title="拖动调整详情宽度；双击重置"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onKeyDown={handleResizeKeyDown}
          onDoubleClick={() => setDrawerWidth(constrainDrawerWidth(DEFAULT_DRAWER_WIDTH))}
          className={`group relative hidden h-full w-4 shrink-0 touch-none cursor-col-resize select-none outline-none md:block focus-visible:bg-accent/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${isResizing ? 'z-10' : ''}`}
        >
          <span
            className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${isResizing ? 'bg-[oklch(var(--primary))]' : 'bg-[oklch(var(--border))] group-hover:bg-[oklch(var(--foreground)/0.5)] group-focus:bg-[oklch(var(--primary))]'}`}
          />
        </div>
      )}

      <aside
        ref={drawerRef}
        className="relative h-full min-h-0 shrink-0 overflow-hidden bg-background will-change-[width]"
        style={{
          width: todo ? drawerCssWidth : 0,
          transition: isResizing ? 'none' : 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        }}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'width' && !todo) {
            setMountedTodo(null)
          }
        }}
        aria-hidden={!todo}
        aria-label={displayTodo ? `任务详情：${displayTodo.title}` : undefined}
      >
        <AnimatePresence initial={false}>
          {mountedTodo && (
            <motion.div
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: todo ? 1 : 0, x: todo ? 0 : '100%' }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              className="h-full"
              style={{ width: drawerCssWidth, minWidth: drawerCssWidth }}
            >
              <TodoModal
                isOpen={!!todo}
                presentation="drawer"
                mode="edit"
                lists={lists}
                goals={goals}
                initialData={displayTodo ?? undefined}
                onSubmit={onSubmit}
                onUpdate={onUpdate}
                onClose={onClose}
                onDelete={onDelete}
                onRestore={onRestore}
                onPermanentDelete={onPermanentDelete}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </>
  )
}
