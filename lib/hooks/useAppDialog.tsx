'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export interface AppDialogOptions {
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
}

export interface AppDialogApi {
  alert: (options: Omit<AppDialogOptions, 'cancelLabel' | 'destructive'>) => Promise<void>
  confirm: (options: AppDialogOptions) => Promise<boolean>
}

type AlertRequest = {
  kind: 'alert'
  options: Omit<AppDialogOptions, 'cancelLabel' | 'destructive'>
  resolve: () => void
}

type ConfirmRequest = {
  kind: 'confirm'
  options: AppDialogOptions
  resolve: (confirmed: boolean) => void
}

type DialogRequest = AlertRequest | ConfirmRequest

const AppDialogContext = createContext<AppDialogApi | null>(null)

export function useAppDialog(): AppDialogApi {
  const context = useContext(AppDialogContext)
  if (!context) {
    throw new Error('useAppDialog must be used within AppDialogProvider')
  }
  return context
}

export function AppDialogProvider({ children }: { children: ReactNode }) {
  const [activeRequest, setActiveRequest] = useState<DialogRequest | null>(null)
  const activeRequestRef = useRef<DialogRequest | null>(null)
  const queueRef = useRef<DialogRequest[]>([])

  const showNextRequest = useCallback(() => {
    if (activeRequestRef.current) return
    const nextRequest = queueRef.current.shift() ?? null
    if (!nextRequest) return
    activeRequestRef.current = nextRequest
    setActiveRequest(nextRequest)
  }, [])

  const completeRequest = useCallback((confirmed: boolean) => {
    const request = activeRequestRef.current
    if (!request) return

    activeRequestRef.current = null
    setActiveRequest(null)

    if (request.kind === 'alert') request.resolve()
    else request.resolve(confirmed)

    window.setTimeout(showNextRequest, 0)
  }, [showNextRequest])

  const enqueueRequest = useCallback((request: DialogRequest) => {
    if (activeRequestRef.current) {
      queueRef.current.push(request)
      return
    }

    activeRequestRef.current = request
    setActiveRequest(request)
  }, [])

  const alert = useCallback((options: Omit<AppDialogOptions, 'cancelLabel' | 'destructive'>) => {
    return new Promise<void>((resolve) => {
      enqueueRequest({ kind: 'alert', options, resolve })
    })
  }, [enqueueRequest])

  const confirm = useCallback((options: AppDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      enqueueRequest({ kind: 'confirm', options, resolve })
    })
  }, [enqueueRequest])

  const api: AppDialogApi = { alert, confirm }
  const isAlertOpen = activeRequest?.kind === 'alert'
  const isConfirmOpen = activeRequest?.kind === 'confirm'

  return (
    <AppDialogContext.Provider value={api}>
      {children}

      <Dialog open={isAlertOpen} onOpenChange={(open) => { if (!open) completeRequest(false) }}>
        {activeRequest?.kind === 'alert' && (
          <DialogContent size="sm">
            <DialogHeader>
              <DialogTitle>{activeRequest.options.title}</DialogTitle>
              {activeRequest.options.description && (
                <DialogDescription className="whitespace-pre-line">
                  {activeRequest.options.description}
                </DialogDescription>
              )}
            </DialogHeader>
            <DialogFooter>
              <Button type="button" onClick={() => completeRequest(true)}>
                {activeRequest.options.confirmLabel ?? '知道了'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      <AlertDialog open={isConfirmOpen} onOpenChange={(open) => { if (!open) completeRequest(false) }}>
        {activeRequest?.kind === 'confirm' && (
          <AlertDialogContent size="sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{activeRequest.options.title}</AlertDialogTitle>
              {activeRequest.options.description && (
                <AlertDialogDescription className="whitespace-pre-line">
                  {activeRequest.options.description}
                </AlertDialogDescription>
              )}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{activeRequest.options.cancelLabel ?? '取消'}</AlertDialogCancel>
              <AlertDialogAction
                className={activeRequest.options.destructive ? 'bg-[oklch(var(--destructive))] text-[oklch(var(--destructive-foreground))] hover:bg-[oklch(var(--destructive)/0.9)]' : undefined}
                onClick={() => completeRequest(true)}
              >
                {activeRequest.options.confirmLabel ?? '确认'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </AppDialogContext.Provider>
  )
}
