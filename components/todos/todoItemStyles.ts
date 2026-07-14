export const TODO_ITEM_STYLES = {
  row: 'relative w-full border border-[oklch(var(--border))] rounded-lg transition-all duration-300 flex items-center',
  content: 'flex-1 flex items-center gap-3 px-6 py-5 w-full relative box-border min-h-[60px] select-none',
  goalContent: 'flex-1 flex items-center gap-2 px-3 py-3 w-full relative box-border min-h-[60px] select-none',
  checkbox: 'flex items-center justify-center cursor-pointer border-2 rounded-full transition-all duration-200 shrink-0 w-[22px] h-[22px] mr-3',
  checkboxCompleted: 'border-primary bg-primary',
  checkboxPending: 'border-border bg-background hover:border-primary',
  completedContent: 'line-through bg-muted opacity-70 text-muted-foreground',
  title: 'flex-1 text-sm text-foreground leading-relaxed',
  completedTitle: 'text-muted-foreground line-through',
  meta: 'text-xs text-muted-foreground ml-1',
} as const
