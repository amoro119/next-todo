'use client'

import * as React from 'react'
import { cn } from '@/components/common/cn'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'flex min-h-20 w-full rounded-md border border-[oklch(var(--input))] bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-[oklch(var(--muted-foreground))] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[oklch(var(--ring))] disabled:cursor-not-allowed disabled:opacity-50',
      className
    )}
    ref={ref}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Textarea }
