'use client'

import { Toaster as SonnerToaster, type ToasterProps } from 'sonner'

export function Toaster(props: ToasterProps) {
  return (
    <SonnerToaster
      toastOptions={{
        classNames: {
          toast: 'border border-[oklch(var(--border))] bg-[oklch(var(--background))] text-[oklch(var(--foreground))]',
          description: 'text-[oklch(var(--muted-foreground))]',
          actionButton: 'bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))]',
          cancelButton: 'bg-[oklch(var(--muted))] text-[oklch(var(--muted-foreground))]',
        },
      }}
      {...props}
    />
  )
}
