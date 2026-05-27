'use client'
import React from 'react'
import { NavigationBar } from './NavigationBar'
import { KeyboardManager } from './KeyboardManager'
import { Toaster } from '@/components/common/Toaster'
import { ToastProvider } from '@/lib/hooks/useToast'

interface LayoutShellProps {
  children: React.ReactNode
  onOpenSettings: () => void
}

export function LayoutShell({ children, onOpenSettings }: LayoutShellProps) {
  return (
    <ToastProvider>
      <div className="flex flex-col md:flex-row h-screen w-full overflow-hidden bg-[oklch(var(--background))]">
        <NavigationBar onOpenSettings={onOpenSettings} />
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>

      {/* Global overlays */}
      <KeyboardManager />
      <Toaster />
    </ToastProvider>
  )
}
