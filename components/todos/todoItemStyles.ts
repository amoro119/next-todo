export const TODO_ITEM_STYLES = {
  row: 'relative w-full border border-[oklch(var(--border))] rounded-lg transition-all duration-300 flex items-center',
  completedRow: 'border-[oklch(var(--border)/0.7)] bg-[oklch(var(--muted)/0.35)]',
  content: 'flex-1 flex items-center gap-3 px-6 py-5 w-full relative box-border min-h-[60px] select-none',
  goalContent: 'flex-1 flex items-center gap-2 px-3 py-3 w-full relative box-border min-h-[60px] select-none',
  checkbox: 'flex items-center justify-center cursor-pointer border-2 rounded-full transition-all duration-200 shrink-0 w-[22px] h-[22px] mr-3',
  checkboxCompleted: 'border-[oklch(var(--muted-foreground)/0.5)] bg-[oklch(var(--muted-foreground)/0.35)] text-[oklch(var(--muted-foreground))]',
  checkboxPending: 'border-border bg-background hover:border-primary',
  completedContent: 'bg-[oklch(var(--muted)/0.55)] text-[oklch(var(--muted-foreground))]',
  title: 'flex-1 text-sm text-foreground leading-relaxed',
  completedTitle: 'text-[oklch(var(--muted-foreground))] line-through decoration-[oklch(var(--muted-foreground)/0.7)]',
  meta: 'text-xs text-muted-foreground ml-1',
  completedMeta: 'text-xs text-[oklch(var(--muted-foreground)/0.7)] ml-1',
} as const
