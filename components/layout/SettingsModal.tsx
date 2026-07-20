'use client'
import React, { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { X } from 'lucide-react'
import { Dialog, DialogBody, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog'
import SettingsShell from '@/components/settings/SettingsShell'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [sheetOffset, setSheetOffset] = useState(0)
  const [isDraggingSheet, setIsDraggingSheet] = useState(false)
  const sheetDragStartRef = useRef<number | null>(null)

  const handleSheetPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return

    event.preventDefault()
    sheetDragStartRef.current = event.clientY
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setIsDraggingSheet(true)
  }

  const handleSheetPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const startY = sheetDragStartRef.current
    if (startY === null) return

    setSheetOffset(Math.max(0, event.clientY - startY))
  }

  const releaseSheetPointer = (event: ReactPointerEvent<HTMLDivElement>, shouldEvaluateDismissal = true) => {
    const startY = sheetDragStartRef.current
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId)
    }

    sheetDragStartRef.current = null
    setIsDraggingSheet(false)
    setSheetOffset(0)

    if (shouldEvaluateDismissal && startY !== null && event.clientY - startY >= 120) {
      onClose()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent
        size="xl"
        showClose={false}
        className={`bottom-0 left-0 top-auto h-[min(92dvh,760px)] max-h-[92dvh] w-full translate-x-0 translate-y-[var(--settings-sheet-offset)] rounded-b-none rounded-t-2xl border-x-0 border-b-0 shadow-2xl data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom md:bottom-auto md:left-1/2 md:top-1/2 md:h-[80vh] md:max-h-[calc(100dvh-2rem)] md:w-full md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-lg md:border md:shadow-lg md:data-[state=closed]:zoom-out-95 md:data-[state=open]:zoom-in-95 ${isDraggingSheet ? 'transition-none' : ''}`}
        style={{ '--settings-sheet-offset': `${sheetOffset}px` } as React.CSSProperties}
      >
        <DialogTitle className="sr-only">设置</DialogTitle>
        <div className="relative flex h-14 shrink-0 items-center justify-between border-b border-[oklch(var(--border))] px-5 pt-3 md:hidden">
          <div
            data-testid="settings-sheet-handle"
            className="absolute left-1/2 top-0 z-10 flex h-6 w-24 -translate-x-1/2 cursor-grab items-start justify-center pt-2 active:cursor-grabbing"
            role="presentation"
            aria-hidden="true"
            onPointerDown={handleSheetPointerDown}
            onPointerMove={handleSheetPointerMove}
            onPointerUp={releaseSheetPointer}
            onPointerCancel={(event) => releaseSheetPointer(event, false)}
            style={{ touchAction: 'none' }}
          >
            <span className="pointer-events-none h-1 w-10 rounded-full bg-[oklch(var(--border))]" />
          </div>
          <p className="text-base font-semibold leading-6 text-[oklch(var(--foreground))]">设置</p>
          <DialogClose className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[oklch(var(--muted-foreground))] transition-colors hover:bg-[oklch(var(--accent))] hover:text-[oklch(var(--accent-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(var(--background))]">
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">关闭设置</span>
          </DialogClose>
        </div>
        <DialogClose className="absolute right-4 top-4 z-20 hidden h-9 w-9 items-center justify-center rounded-md text-[oklch(var(--muted-foreground))] transition-colors hover:bg-[oklch(var(--accent))] hover:text-[oklch(var(--accent-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(var(--background))] md:inline-flex">
          <X className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only">关闭设置</span>
        </DialogClose>
        <DialogBody className="p-0">
          <SettingsShell />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
