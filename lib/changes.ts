// lib/changes.ts
import { z } from 'zod'

export const listChangeSchema = z.object({
  id: z.string(),
  name: z.string().nullable().optional(),
  sort_order: z.number().nullable().optional(),
  is_hidden: z.boolean().nullable().optional(),
  // local-first fields
  modified_columns: z.array(z.string()).nullable().optional(),
  deleted: z.boolean().nullable().optional(),
  new: z.boolean().nullable().optional(),
})
export type ListChange = z.infer<typeof listChangeSchema>

export const todoChangeSchema = z.object({
  id: z.string(),
  title: z.string().nullable().optional(),
  completed: z.boolean().nullable().optional(),
  deleted: z.boolean().nullable().optional(),
  sort_order: z.number().nullable().optional(),
  due_date: z.string().nullable().optional(),
  content: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  priority: z.number().nullable().optional(),
  created_time: z.string().nullable().optional(),
  completed_time: z.string().nullable().optional(),
  start_date: z.string().nullable().optional(),
  list_id: z.string().nullable().optional(),
  // local-first fields
  modified_columns: z.array(z.string()).nullable().optional(),
  new: z.boolean().nullable().optional(),
})
export type TodoChange = z.infer<typeof todoChangeSchema>

export const changeSetSchema = z.object({
  lists: z.array(listChangeSchema),
  todos: z.array(todoChangeSchema),
})
export type ChangeSet = z.infer<typeof changeSetSchema>