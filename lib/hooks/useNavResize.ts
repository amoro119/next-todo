'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

const MIN_WIDTH = 120
const MAX_WIDTH = 280
const DEFAULT_WIDTH = 220
const STORAGE_KEY = 'navPanelWidth'

function getInitialWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_WIDTH
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === null) return DEFAULT_WIDTH
  const parsed = parseInt(stored, 10)
  if (isNaN(parsed)) return DEFAULT_WIDTH
  return Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, parsed))
}

export function useNavResize() {
  const [navWidth, setNavWidth] = useState(getInitialWidth)
  const [isResizing, setIsResizing] = useState(false)

  const startXRef = useRef(0)
  const startWidthRef = useRef(0)
  const currentWidthRef = useRef(navWidth)

  // Keep the ref in sync with state so mouseup always has the latest value
  useEffect(() => {
    currentWidthRef.current = navWidth
  }, [navWidth])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    startXRef.current = e.clientX
    startWidthRef.current = currentWidthRef.current
  }, [])

  const commitWidth = useCallback((width: number) => {
    const nextWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width))
    currentWidthRef.current = nextWidth
    setNavWidth(nextWidth)
    localStorage.setItem(STORAGE_KEY, String(nextWidth))
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      commitWidth(currentWidthRef.current - 8)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      commitWidth(currentWidthRef.current + 8)
    } else if (e.key === 'Home') {
      e.preventDefault()
      commitWidth(MIN_WIDTH)
    } else if (e.key === 'End') {
      e.preventDefault()
      commitWidth(MAX_WIDTH)
    }
  }, [commitWidth])

  useEffect(() => {
    if (!isResizing) return

    const handleMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - startXRef.current
      const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidthRef.current + delta))
      currentWidthRef.current = newWidth
      setNavWidth(newWidth)
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      localStorage.setItem(STORAGE_KEY, String(currentWidthRef.current))
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isResizing])

  return {
    navWidth,
    isResizing,
    resizeHandleProps: {
      onMouseDown: handleMouseDown,
      onKeyDown: handleKeyDown,
      role: 'separator',
      tabIndex: 0,
      'aria-orientation': 'vertical' as const,
      'aria-valuemin': MIN_WIDTH,
      'aria-valuemax': MAX_WIDTH,
      'aria-valuenow': navWidth,
      'aria-label': `侧栏宽度 ${navWidth} 像素`,
      style: { cursor: 'col-resize' } as React.CSSProperties,
    },
  }
}
