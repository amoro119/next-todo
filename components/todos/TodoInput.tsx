'use client'

import type { KeyboardEvent } from 'react'

interface TodoInputProps {
  value: string
  onChange: (v: string) => void
  onSubmit: () => void
  placeholder?: string
}

export function TodoInput({ value, onChange, onSubmit, placeholder = '添加任务…' }: TodoInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      onSubmit()
    }
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className="w-full px-4 py-3 bg-transparent border-b border-[oklch(var(--border))] text-[oklch(var(--foreground))] placeholder:text-[oklch(var(--muted-foreground))] focus:outline-none text-sm"
    />
  )
}
