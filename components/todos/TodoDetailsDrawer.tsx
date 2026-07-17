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
import { useIsDesktopLayout } from '@/lib/hooks/useIsDesktopLayout'

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
  const [sheetOffset, setSheetOffset] = useState(0)
  const sheetDragRef = useRef<{ startY: number; offset: number } | null>(null)
  const isDesktop = useIsDesktopLayout()

  useEffect(() => {
    if (todo) {
      setMountedTodo(todo)
      setSheetOffset(0)
    }
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

  const handleSheetPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isDesktop) return

    event.preventDefault()
    sheetDragRef.current = { startY: event.clientY, offset: sheetOffset }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handleSheetPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = sheetDragRef.current
    if (!dragState) return

    setSheetOffset(Math.max(0, dragState.offset + event.clientY - dragState.startY))
  }

  const handleSheetPointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const shouldClose = sheetOffset >= 120
    sheetDragRef.current = null
    setSheetOffset(0)
    if (shouldClose) onClose()
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

      <AnimatePresence initial={false}>
        {todo && (
          <motion.button
            type="button"
            aria-label="关闭任务详情"
            className="fixed inset-0 z-40 bg-[oklch(var(--overlay))] md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      <aside
        ref={drawerRef}
        role={isDesktop ? 'complementary' : 'dialog'}
        aria-modal={isDesktop ? undefined : true}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[min(92dvh,760px)] w-full min-h-0 flex-col overflow-hidden rounded-t-2xl border-t border-[oklch(var(--border))] bg-[oklch(var(--background))] shadow-2xl will-change-transform md:relative md:inset-auto md:z-auto md:block md:h-full md:w-auto md:shrink-0 md:rounded-none md:border-0 md:shadow-none"
        style={{
          width: isDesktop ? (todo ? drawerCssWidth : 0) : '100%',
          visibility: displayTodo ? 'visible' : 'hidden',
          pointerEvents: todo ? 'auto' : 'none',
          transition: isDesktop ? (isResizing ? 'none' : 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)') : 'none',
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
              initial={isDesktop ? { opacity: 0, x: '100%' } : { opacity: 0, y: '100%' }}
              animate={isDesktop
                ? { opacity: todo ? 1 : 0, x: todo ? 0 : '100%' }
                : { opacity: todo ? 1 : 0, y: todo ? sheetOffset : '100%' }}
              onAnimationComplete={() => {
                if (!isDesktop && !todo) setMountedTodo(null)
              }}
              transition={{ duration: todo ? 0.36 : 0.24, ease: todo ? [0.22, 1, 0.36, 1] : [0.4, 0, 1, 1] }}
              className="h-full w-full md:w-auto"
              style={isDesktop ? { width: drawerCssWidth, minWidth: drawerCssWidth } : undefined}
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
                onSheetPointerDown={handleSheetPointerDown}
                onSheetPointerMove={handleSheetPointerMove}
                onSheetPointerUp={handleSheetPointerEnd}
                onSheetPointerCancel={handleSheetPointerEnd}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </>
  )
}
