'use client'

import * as React from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { Search, X } from 'lucide-react'
import { cn } from '@/components/common/cn'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

const Command = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive>
>(({ className, ...props }, ref) => (
  <CommandPrimitive ref={ref} className={cn('flex h-full w-full flex-col overflow-hidden rounded-md bg-[oklch(var(--popover))] text-[oklch(var(--popover-foreground))]', className)} {...props} />
))
Command.displayName = CommandPrimitive.displayName

const CommandDialog = ({ children, ...props }: React.ComponentProps<typeof Dialog>) => (
  <Dialog {...props}>
    <DialogContent size="lg" showClose={false} className="max-h-[min(82dvh,680px)] overflow-hidden rounded-xl shadow-xl">
      <DialogTitle className="sr-only">搜索待办和目标</DialogTitle>
      <DialogDescription className="sr-only">搜索并打开待办事项或目标</DialogDescription>
      <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[oklch(var(--muted-foreground))] [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0">
        {children}
      </Command>
    </DialogContent>
  </Dialog>
)

type CommandInputProps = React.ComponentPropsWithoutRef<typeof CommandPrimitive.Input> & {
  onClear?: () => void
  onClose?: () => void
  shortcutLabel?: string
}

const CommandInput = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Input>,
  CommandInputProps
>(({ className, onClear, onClose, shortcutLabel = '⌘ K', value, ...props }, ref) => (
  <div className="flex min-h-14 items-center border-b border-[oklch(var(--border))] px-4" cmdk-input-wrapper="">
    <Search className="mr-3 h-5 w-5 shrink-0 text-[oklch(var(--muted-foreground))]" aria-hidden="true" />
    <CommandPrimitive.Input
      ref={ref}
      value={value}
      className={cn('h-14 min-w-0 flex-1 cursor-text rounded-none border-0 bg-transparent px-0 py-3 text-base shadow-none outline-none placeholder:text-[oklch(var(--muted-foreground))] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50', className)}
      {...props}
    />
    {value && onClear ? (
      <button
        type="button"
        aria-label="清空搜索"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-[oklch(var(--muted-foreground))] transition-colors hover:bg-[oklch(var(--accent))] hover:text-[oklch(var(--accent-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] sm:h-8 sm:w-8"
        onMouseDown={(event) => event.preventDefault()}
        onClick={onClear}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    ) : (
      <kbd className="hidden shrink-0 rounded border border-[oklch(var(--border))] bg-[oklch(var(--muted)/0.55)] px-2 py-1 font-sans text-[11px] text-[oklch(var(--muted-foreground))] sm:inline-flex">
        {shortcutLabel}
      </kbd>
    )}
    {onClose && (
      <>
        <span className="mx-2 h-5 w-px shrink-0 bg-[oklch(var(--border))] sm:mx-3" aria-hidden="true" />
        <button
          type="button"
          aria-label="关闭搜索"
          className="inline-flex h-10 shrink-0 items-center justify-center rounded-md px-2 text-xs font-medium text-[oklch(var(--muted-foreground))] transition-colors hover:bg-[oklch(var(--accent))] hover:text-[oklch(var(--accent-foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(var(--ring))] sm:h-8"
          onClick={onClose}
        >
          取消
        </button>
      </>
    )}
  </div>
))
CommandInput.displayName = CommandPrimitive.Input.displayName

const CommandList = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.List>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.List ref={ref} className={cn('max-h-[min(60dvh,500px)] overflow-y-auto overflow-x-hidden', className)} {...props} />
))
CommandList.displayName = CommandPrimitive.List.displayName

const CommandEmpty = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Empty>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>
>(({ className, ...props }, ref) => <CommandPrimitive.Empty ref={ref} className={cn('px-6 py-12 text-center text-sm text-[oklch(var(--muted-foreground))]', className)} {...props} />)
CommandEmpty.displayName = CommandPrimitive.Empty.displayName

const CommandGroup = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Group>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Group ref={ref} className={cn('overflow-hidden p-2 text-[oklch(var(--foreground))] [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-[oklch(var(--muted-foreground))]', className)} {...props} />
))
CommandGroup.displayName = CommandPrimitive.Group.displayName

const CommandSeparator = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Separator ref={ref} className={cn('-mx-1 h-px bg-[oklch(var(--border))]', className)} {...props} />
))
CommandSeparator.displayName = CommandPrimitive.Separator.displayName

const CommandItem = React.forwardRef<
  React.ElementRef<typeof CommandPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof CommandPrimitive.Item>
>(({ className, ...props }, ref) => (
  <CommandPrimitive.Item ref={ref} className={cn('relative flex cursor-default select-none items-center gap-3 rounded-md px-3 py-2.5 text-sm outline-none transition-colors data-[disabled=true]:pointer-events-none data-[selected=true]:bg-[oklch(var(--accent))] data-[selected=true]:text-[oklch(var(--accent-foreground))] data-[disabled=true]:opacity-50', className)} {...props} />
))
CommandItem.displayName = CommandPrimitive.Item.displayName

const CommandShortcut = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span className={cn('ml-auto text-xs tracking-widest text-[oklch(var(--muted-foreground))]', className)} {...props} />
)
CommandShortcut.displayName = 'CommandShortcut'

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandShortcut, CommandSeparator }
