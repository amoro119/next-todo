'use client'

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { Goal, List, Todo } from '@/lib/types'
import GoalDetails from './GoalDetails'
import GoalHeader from './GoalHeader'
import { useIsDesktopLayout } from '@/lib/hooks/useIsDesktopLayout'

interface GoalDetailsDrawerProps {
  goal: Goal | null
  todos: Todo[]
  goals: Goal[]
  lists: List[]
  onUpdateGoal: (goal: Goal) => void
  onUpdateTodo: (todoId: string, updates: Partial<Todo>) => void
  onDeleteTodo: (todoId: string) => void
  onCreateTodo: (todo: Omit<Todo, 'id' | 'created_time'>) => void
  onAssociateTasks: (taskIds: string[], goalId: string) => void
  onEditGoal?: (goal: Goal) => void
  onClose: () => void
}

const DEFAULT_DRAWER_WIDTH = 512
const MIN_DRAWER_WIDTH = 360
const MAX_DRAWER_WIDTH = 720
const MIN_MAIN_WIDTH = 400
const DRAWER_WIDTH_STORAGE_KEY = 'next-todo:goal-details-drawer-width'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export default function GoalDetailsDrawer({
  goal,
  todos,
  goals,
  lists,
  onUpdateGoal,
  onUpdateTodo,
  onDeleteTodo,
  onCreateTodo,
  onAssociateTasks,
  onEditGoal,
  onClose,
}: GoalDetailsDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null)
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null)
  const [drawerWidth, setDrawerWidth] = useState(DEFAULT_DRAWER_WIDTH)
  const [isResizing, setIsResizing] = useState(false)
  const [mountedGoal, setMountedGoal] = useState<Goal | null>(goal)
  const [mountedTodos, setMountedTodos] = useState<Todo[]>(todos)
  const isDesktop = useIsDesktopLayout()

  useEffect(() => {
    if (goal) setMountedGoal(goal)
  }, [goal])

  useEffect(() => {
    if (goal) setMountedTodos(todos)
  }, [goal, todos])

  const getDrawerBounds = useCallback(() => {
    const containerWidth = drawerRef.current?.parentElement?.clientWidth ?? window.innerWidth
    const maxWidth = Math.min(MAX_DRAWER_WIDTH, Math.max(MIN_DRAWER_WIDTH, containerWidth - MIN_MAIN_WIDTH))
    return { min: Math.min(MIN_DRAWER_WIDTH, maxWidth), max: maxWidth }
  }, [])

  const constrainDrawerWidth = useCallback((width: number) => {
    const { min, max } = getDrawerBounds()
    return clamp(width, min, max)
  }, [getDrawerBounds])

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
    if (!goal) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [goal, onClose])

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
  const displayGoal = goal ?? mountedGoal
  const displayTodos = goal ? todos : mountedTodos

  return (
    <>
      {goal && (
        <div
          role="separator"
          aria-label="调整目标详情宽度"
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
        role={isDesktop ? 'complementary' : 'dialog'}
        aria-modal={isDesktop ? undefined : true}
        className="fixed inset-0 z-50 flex h-[100dvh] w-full min-h-0 flex-col overflow-hidden bg-[oklch(var(--background))] will-change-transform md:relative md:inset-auto md:z-auto md:block md:h-full md:w-auto md:shrink-0"
        style={{
          width: isDesktop ? (goal ? drawerCssWidth : 0) : '100%',
          backgroundColor: displayGoal ? 'oklch(var(--background))' : 'transparent',
          pointerEvents: goal ? 'auto' : 'none',
          transition: isDesktop ? (isResizing ? 'none' : 'width 320ms cubic-bezier(0.22, 1, 0.36, 1)') : 'none',
        }}
        onTransitionEnd={(event) => {
          if (event.target === event.currentTarget && event.propertyName === 'width' && !goal) {
            setMountedGoal(null)
          }
        }}
        aria-hidden={!goal}
        aria-label={displayGoal ? `目标详情：${displayGoal.name}` : undefined}
      >
        <AnimatePresence initial={false}>
          {mountedGoal && (
            <motion.div
              initial={isDesktop ? { opacity: 0, x: '100%' } : { opacity: 0, y: '100%' }}
              animate={isDesktop
                ? { opacity: goal ? 1 : 0, x: goal ? 0 : '100%' }
                : { opacity: goal ? 1 : 0, y: goal ? 0 : '100%' }}
              onAnimationComplete={() => {
                if (!isDesktop && !goal) setMountedGoal(null)
              }}
              transition={{ duration: goal ? 0.36 : 0.24, ease: goal ? [0.22, 1, 0.36, 1] : [0.4, 0, 1, 1] }}
              className="h-full bg-[oklch(var(--background))]"
              style={isDesktop ? { width: drawerCssWidth, minWidth: drawerCssWidth } : { width: '100%' }}
            >
              <div className="mobile-detail-safe-top flex h-full min-h-0 flex-col bg-[oklch(var(--background))] px-3 sm:px-5">
                <GoalHeader
                  selectedGoal={displayGoal!}
                  goalCount={goals.length}
                  onBackToList={onClose}
                  onEditGoal={onEditGoal}
                />
                <GoalDetails
                  goal={displayGoal!}
                  todos={displayTodos}
                  goals={goals}
                  lists={lists}
                  onUpdateGoal={onUpdateGoal}
                  onUpdateTodo={onUpdateTodo}
                  onDeleteTodo={onDeleteTodo}
                  onCreateTodo={onCreateTodo}
                  onAssociateTasks={onAssociateTasks}
                  onClose={onClose}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>
    </>
  )
}
