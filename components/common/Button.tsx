'use client'
import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))] hover:bg-[oklch(var(--primary)/0.9)]',
        ghost:
          'hover:bg-[oklch(var(--accent))] hover:text-[oklch(var(--accent-foreground))]',
        outline:
          'border border-[oklch(var(--border))] bg-transparent hover:bg-[oklch(var(--accent))] hover:text-[oklch(var(--accent-foreground))]',
        destructive:
          'bg-[oklch(var(--destructive))] text-[oklch(var(--destructive-foreground))] hover:bg-[oklch(var(--destructive)/0.9)]',
        link: 'text-[oklch(var(--primary))] underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4',
        lg: 'h-10 px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
