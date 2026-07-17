'use client'
import React from 'react'
import { NavigationBar } from './NavigationBar'
import type { AppSection } from '@/lib/stores/uiStore'
import { Toaster } from '@/components/common/Toaster'
import { Toaster as SonnerToaster } from '@/components/ui/sonner'
import { ToastProvider } from '@/lib/hooks/useToast'

interface LayoutShellProps {
  children: React.ReactNode
  onOpenSettings: () => void
  onSectionChange: (section: AppSection) => void
}

export function LayoutShell({ children, onOpenSettings, onSectionChange }: LayoutShellProps) {
  return (
    <ToastProvider>
      <div className="flex h-screen h-[100dvh] w-full flex-col overflow-hidden overscroll-none bg-[oklch(var(--background))] md:flex-row">
        <NavigationBar onOpenSettings={onOpenSettings} onSectionChange={onSectionChange} />
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {children}
        </main>
      </div>

      {/* Global overlays */}
      <Toaster />
      <SonnerToaster richColors position="bottom-right" />
    </ToastProvider>
  )
}
