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

// 添加变化推送功能
export async function sendChangesToServer(changes: ChangeSet): Promise<void> {
  try {
    console.log('Starting manual sync to server...');
    
    const response = await fetch('http://localhost:3001/apply-changes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(changes),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to send changes: ${response.status} ${errorText}`)
    }

    const result = await response.json()
    if (!result.success) {
      throw new Error('Server returned error')
    }

    console.log('Changes sent to server successfully')
    
  } catch (error) {
    console.error('Failed to send changes to server:', error)
    throw error
  }
}

// 创建变化对象的工具函数
export function createListChange(
  id: string,
  data: Partial<ListChange>,
  isNew = false,
  isPermanentDelete = false
): ListChange {
  return {
    id,
    new: isNew,
    deleted: isPermanentDelete,
    ...data,
    modified_columns: Object.keys(data).filter(key => key !== 'id' && key !== 'new' && key !== 'modified_columns') as (keyof ListChange)[],
  }
}

export function createTodoChange(
  id: string,
  data: Partial<TodoChange>,
  isNew = false,
  isPermanentDelete = false
): TodoChange {
  return {
    id,
    new: isNew,
    deleted: isPermanentDelete,
    ...data,
    // CORRECTED: Do NOT filter out 'deleted' from modified_columns.
    // This allows the server to differentiate between soft and hard deletes.
    modified_columns: Object.keys(data).filter(key => key !== 'id' && key !== 'new' && key !== 'modified_columns') as (keyof TodoChange)[],
  }
}