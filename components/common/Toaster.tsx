'use client'
import { useToast } from '@/lib/hooks/useToast'
import { cn } from './cn'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={cn(
            'pointer-events-auto flex items-start gap-3 rounded-lg border p-4 shadow-lg transition-all',
            'bg-[oklch(var(--background))] border-[oklch(var(--border))] text-[oklch(var(--foreground))]',
            toast.variant === 'destructive' && 'border-[oklch(var(--destructive))] bg-[oklch(var(--destructive))] text-[oklch(var(--destructive-foreground))]',
            toast.variant === 'success' && 'border-green-500/30 bg-green-50 dark:bg-green-950/30 text-green-900 dark:text-green-100'
          )}
        >
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium">{toast.title}</p>
            {toast.description && (
              <p className="text-xs mt-0.5 opacity-70">{toast.description}</p>
            )}
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="mt-2 text-xs font-medium underline underline-offset-2 hover:no-underline"
              >
                {toast.action.label}
              </button>
            )}
          </div>
          <button
            onClick={() => dismiss(toast.id)}
            className="shrink-0 opacity-50 hover:opacity-100 text-lg leading-none"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
