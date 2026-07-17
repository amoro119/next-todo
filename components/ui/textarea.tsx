'use client'

import * as React from 'react'
import { cn } from '@/components/common/cn'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    className={cn(
      'form-control flex min-h-20 w-full resize-y px-3 py-2 text-sm placeholder:text-[oklch(var(--muted-foreground))]',
      className
    )}
    ref={ref}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

export { Textarea }
