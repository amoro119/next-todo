'use client'

import { useCallback, useState } from "react"
import { v5 as uuidv5 } from "uuid"
import { useStores } from "@/lib/stores/createStores"
import { parseDidaCsv, type ParsedDidaTodo } from "@/lib/csvParser"
import { RRuleEngine } from "@/lib/recurring/RRuleEngine"
import type { Todo, List } from "@/lib/db/types"
import { useAppDialog } from "@/lib/hooks/useAppDialog"
import { useDatabase } from "@/app/providers/DatabaseProvider"

const IMPORT_BATCH_SIZE = 250

function importSignature(todo: Pick<Todo, 'title' | 'created_time'>, listName: string | null): string {
  return JSON.stringify([
    todo.title.trim(),
    todo.created_time ?? null,
    listName?.trim() || null,
  ])
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return current
  const merged = new Map(current.map((record) => [record.id, record]))
  for (const record of incoming) merged.set(record.id, record)
  return [...merged.values()]
}

export function useSyncOperations(todos: Todo[], lists: List[]) {
  const { todoStore, listStore } = useStores()
  const { api } = useDatabase()
  const { alert, confirm } = useAppDialog()
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] = useState({ completed: 0, total: 0 })

  const handleImport = useCallback(
    async (file: File) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const content = e.target?.result as string
        if (!content) return
        try {
          setIsImporting(true)
          let todosToImport: ParsedDidaTodo[] = []
          if (file.name.endsWith(".csv")) {
            const { todos: parsedTodos, removedTodos } = parseDidaCsv(content)
            todosToImport = [...parsedTodos, ...removedTodos].map((t) => ({
              ...t,
              deleted: Boolean(t.deleted),
            }))
            console.log(`[CSV Import] Parsed: ${parsedTodos.length} active + ${removedTodos.length} removed = ${todosToImport.length} total`)
            console.log(`[CSV Import] With completedTime: ${todosToImport.filter(t => t.completed_time).length} | Without: ${todosToImport.filter(t => !t.completed_time).length}`)
          } else if (file.name.endsWith(".sql")) {
            await alert({
              title: "暂不支持 SQL 导入",
              description: "当前版本请使用 CSV 格式导入。",
            })
            return
          } else {
            await alert({
              title: "不支持的文件格式",
              description: "请选择 .csv 或 .sql 文件。",
            })
            return
          }
          if (todosToImport.length === 0) {
            await alert({ title: "没有可导入的事项" })
            return
          }

          const recurringTasks = todosToImport.filter((todo) => todo.is_recurring && todo.repeat)
          if (recurringTasks.length > 0) {
            const previewMessage =
              `发现 ${recurringTasks.length} 个重复任务：\n\n` +
              recurringTasks
                .map((task) => {
                  try {
                    const description = task.repeat
                      ? RRuleEngine.generateHumanReadableDescription(task.repeat)
                      : "重复任务"
                    return `• ${task.title}: ${description}`
                  } catch {
                    return `• ${task.title}: 重复任务 (格式可能有误)`
                  }
                })
                .join("\n") +
              "\n\n是否继续导入？"
            const confirmed = await confirm({
              title: "确认导入重复任务",
              description: previewMessage,
              confirmLabel: "继续导入",
            })
            if (!confirmed) return
          }

          const listNames = new Set(todosToImport.map((t) => t.list_name).filter((s): s is string => !!s))
          const listNameToId = new Map(lists.map((list) => [list.name, list.id]))
          const newLists: Partial<List>[] = []
          for (const listName of listNames) {
            if (listNameToId.has(listName)) continue
            const listId = uuidv5(`next-todo:dida-list:${listName}`, uuidv5.URL)
            listNameToId.set(listName, listId)
            newLists.push({
              id: listId,
              name: listName,
              sort_order: lists.length + newLists.length,
              is_hidden: false,
            })
          }

          const listNameById = new Map(lists.map((list) => [list.id, list.name]))
          const existingIds = new Set(todos.map((todo) => todo.id))
          const existingSignatures = new Set(todos.map((todo) => (
            importSignature(todo, todo.list_id ? listNameById.get(todo.list_id) ?? null : null)
          )))
          let duplicateCount = 0
          const candidates: Partial<Todo>[] = []
          for (const todo of todosToImport) {
            const listName = todo.list_name?.trim() || null
            const signature = importSignature({
              title: todo.title ?? '',
              created_time: todo.created_time ?? null,
            }, listName)
            if ((todo.id && existingIds.has(todo.id)) || existingSignatures.has(signature)) {
              duplicateCount += 1
              continue
            }
            existingSignatures.add(signature)
            const todoData: Partial<Todo> = {
              ...todo,
              list_id: listName ? listNameToId.get(listName) ?? null : null,
            }
            delete (todoData as Record<string, unknown>).list_name
            candidates.push(todoData)
          }

          setImportProgress({ completed: 0, total: candidates.length })
          const importedLists: List[] = []
          const importedTodos: Todo[] = []
          let skippedCount = duplicateCount
          const batchCount = Math.max(1, Math.ceil(candidates.length / IMPORT_BATCH_SIZE))
          for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
            const start = batchIndex * IMPORT_BATCH_SIZE
            const batch = candidates.slice(start, start + IMPORT_BATCH_SIZE)
            const result = await api.importBatch({
              lists: batchIndex === 0 ? newLists : [],
              todos: batch,
            })
            importedLists.push(...result.lists)
            importedTodos.push(...result.todos)
            skippedCount += result.skippedTodos
            setImportProgress({
              completed: Math.min(start + batch.length, candidates.length),
              total: candidates.length,
            })
            await new Promise<void>((resolve) => setTimeout(resolve, 0))
          }

          listStore.setState((state) => ({ lists: mergeById(state.lists, importedLists) }))
          todoStore.setState((state) => ({ todos: mergeById(state.todos, importedTodos) }))
          const importedCount = importedTodos.length

          const summary = `导入完成！成功导入 ${importedCount} 个项目${skippedCount > 0 ? `，${skippedCount} 个项目跳过` : ""}。`
          console.log(`[CSV Import] ${summary}`)
          if (skippedCount === 0) {
            console.log(summary)
          } else {
            await alert({ title: "导入完成", description: summary })
          }
        } catch (error) {
          console.error("导入失败:", error)
          await alert({
            title: "导入失败",
            description: error instanceof Error ? error.message : "未知错误",
          })
        } finally {
          setIsImporting(false)
        }
      }
      reader.readAsText(file)
    },
    [todos, lists, api, listStore, todoStore, alert, confirm]
  )

  const handleExport = useCallback(async () => {
    try {
      const exportedAt = new Date().toISOString()
      const backup = JSON.stringify({
        format: 'next-todo-backup',
        version: 2,
        exportedAt,
        lists,
        todos,
      }, null, 2)
      const blob = new Blob([backup], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `todos-${exportedAt.split("T")[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Export failed:", error)
      await alert({
        title: "导出失败",
        description: error instanceof Error ? error.message : "未知错误",
      })
    }
  }, [todos, lists, alert])

  return {
    handleImport,
    handleExport,
    isImporting,
    importProgress,
  }
}
