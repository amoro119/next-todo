'use client'

import { useCallback } from "react"
import { v4 as uuid } from "uuid"
import { useStores } from "@/lib/stores/createStores"
import { parseDidaCsv } from "@/lib/csvParser"
import { RRuleEngine } from "@/lib/recurring/RRuleEngine"
import type { Todo, List } from "@/lib/types"

export function useSyncOperations(todos: Todo[], lists: List[]) {
  const { todoStore, listStore } = useStores()

  const handleImport = useCallback(
    async (file: File) => {
      const reader = new FileReader()
      reader.onload = async (e) => {
        const content = e.target?.result as string
        if (!content) return
        try {
          let todosToImport: Partial<Todo>[] = []
          if (file.name.endsWith(".csv")) {
            const { todos: parsedTodos, removedTodos } = parseDidaCsv(content)
            todosToImport = [...parsedTodos, ...removedTodos].map((t) => ({
              ...t,
              deleted: !!(t as unknown as { removed?: boolean }).removed,
            }))
            console.log(`[CSV Import] Parsed: ${parsedTodos.length} active + ${removedTodos.length} removed = ${todosToImport.length} total`)
            console.log(`[CSV Import] With completedTime: ${todosToImport.filter(t => t.completed_time).length} | Without: ${todosToImport.filter(t => !t.completed_time).length}`)
          } else if (file.name.endsWith(".sql")) {
            alert("SQL 文件导入在当前版本中暂不可用。请使用 CSV 格式导入。")
            return
          } else {
            alert("不支持的文件格式。请选择 .csv 或 .sql 文件。")
            return
          }
          if (todosToImport.length === 0) {
            alert("没有找到可导入的事项。")
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
            const confirmed = confirm(previewMessage)
            if (!confirmed) return
          }

          const listNames = new Set(todosToImport.map((t) => t.list_name).filter((s): s is string => !!s))
          const listNameToId = new Map<string, string>()
          for (const listName of listNames) {
            const list = lists.find((l: List) => l.name === listName)
            if (!list) {
              try {
                const newList = { id: uuid(), name: listName, sort_order: lists.length, is_hidden: false, modified: new Date().toISOString() }
                await listStore.getState().addList(newList)
                listNameToId.set(listName, newList.id)
              } catch (error) {
                console.error(`Failed to create list "${listName}":`, error)
              }
            } else {
              listNameToId.set(listName, list.id)
            }
          }

          let importedCount = 0
          let skippedCount = 0
          for (const todo of todosToImport) {
            try {
              const listId = todo.list_name ? listNameToId.get(todo.list_name) ?? null : null
              const todoData = { ...todo, list_id: listId }
              delete (todoData as Record<string, unknown>).list_name
              await todoStore.getState().addTodo(todoData)
              importedCount++
            } catch (error) {
              console.error(`Failed to import todo "${todo.title}":`, error)
              skippedCount++
            }
          }

          const summary = `导入完成！成功导入 ${importedCount} 个项目${skippedCount > 0 ? `，${skippedCount} 个项目跳过` : ""}。`
          console.log(`[CSV Import] ${summary}`)
          if (skippedCount === 0) {
            console.log(summary)
          } else {
            alert(summary)
          }
        } catch (error) {
          console.error("导入失败:", error)
          alert(`导入失败: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
      }
      reader.readAsText(file)
    },
    [lists, listStore, todoStore]
  )

  const handleExport = useCallback(async () => {
    try {
      const allTodos = todos
      const allLists = lists
      let sqlContent = "-- Todo App Database Export\n"
      sqlContent += `-- Export Date: ${new Date().toISOString()}\n\n`
      sqlContent += "-- Clear existing data\n"
      sqlContent += "DELETE FROM todos;\n"
      sqlContent += "DELETE FROM lists;\n\n"
      sqlContent += "-- Insert lists\n"
      for (const list of allLists) {
        const name = list.name.replace(/'/g, "''")
        sqlContent += `INSERT INTO lists (id, name, sort_order, is_hidden, modified) VALUES ('${list.id}', '${name}', ${list.sort_order}, ${list.is_hidden}, '${list.modified || new Date().toISOString()}');\n`
      }
      sqlContent += "\n-- Insert todos\n"
      for (const todo of allTodos) {
        const title = todo.title.replace(/'/g, "''")
        const content = todo.content ? todo.content.replace(/'/g, "''") : null
        const tags = todo.tags ? todo.tags.replace(/'/g, "''") : null
        const repeat = todo.repeat ? todo.repeat.replace(/'/g, "''") : null
        const reminder = todo.reminder ? todo.reminder.replace(/'/g, "''") : null
        sqlContent += `INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id, repeat, reminder, is_recurring, recurring_parent_id, instance_number, next_due_date, modified) VALUES (`
        sqlContent += `'${todo.id}', `
        sqlContent += `'${title}', `
        sqlContent += `${todo.completed}, `
        sqlContent += `${todo.deleted}, `
        sqlContent += `${todo.sort_order}, `
        sqlContent += `${todo.due_date ? `'${todo.due_date}'` : "NULL"}, `
        sqlContent += `${content ? `'${content}'` : "NULL"}, `
        sqlContent += `${tags ? `'${tags}'` : "NULL"}, `
        sqlContent += `${todo.priority}, `
        sqlContent += `'${todo.created_time}', `
        sqlContent += `${todo.completed_time ? `'${todo.completed_time}'` : "NULL"}, `
        sqlContent += `${todo.start_date ? `'${todo.start_date}'` : "NULL"}, `
        sqlContent += `${todo.list_id ? `'${todo.list_id}'` : "NULL"}, `
        sqlContent += `${repeat ? `'${repeat}'` : "NULL"}, `
        sqlContent += `${reminder ? `'${reminder}'` : "NULL"}, `
        sqlContent += `${todo.is_recurring || false}, `
        sqlContent += `${todo.recurring_parent_id ? `'${todo.recurring_parent_id}'` : "NULL"}, `
        sqlContent += `${todo.instance_number ?? "NULL"}, `
        sqlContent += `${todo.next_due_date ? `'${todo.next_due_date}'` : "NULL"}, `
        sqlContent += `'${todo.modified || new Date().toISOString()}'`
        sqlContent += ");\n"
      }
      const blob = new Blob([sqlContent], { type: "application/sql" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `todos-${new Date().toISOString().split("T")[0]}.sql`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Export failed:", error)
      alert(`导出失败: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }, [todos, lists])

  return {
    handleImport,
    handleExport,
  }
}
