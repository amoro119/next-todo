'use client'

import { useCallback, useRef, useState } from "react"
import { v4 as uuid } from "uuid"
import { toast } from "sonner"
import { db } from "@/lib/db/dexie"
import { createDexieDatabaseAPI } from "@/lib/db/databaseAPI"
import type { DatabaseAPI } from "@/lib/db/databaseAPI"
import { useStores } from "@/lib/stores/createStores"
import { useUIStore } from "@/lib/stores/uiStore"
import { sanitizeUuidField } from "@/lib/hooks/useTodoOperations"
import type { Todo, List, Goal } from "@/lib/types"
import { GoalFormData } from "@/components/goals/GoalModal"
import type { GoalsMainInterfaceRef } from "@/components/goals/GoalsMainInterface"

export function useGoalOperations(
  goals: Goal[],
  _lists: List[],
  _todos: Todo[],
  onUpdateSelectedGoal?: (goal: Goal) => void
) {
  const api: DatabaseAPI = (() => createDexieDatabaseAPI(db))()
  const memoApi = api

  const { goalStore, todoStore } = useStores()
  const { setActiveSection } = useUIStore()

  const goalsMainInterfaceRef = useRef<GoalsMainInterfaceRef>(null)

  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false)
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null)

  const handleCreateGoal = useCallback(() => {
    setIsGoalModalOpen(true)
  }, [])

  const handleEditGoal = useCallback((goal: Goal) => {
    setEditingGoalId(goal.id)
    setIsGoalModalOpen(true)
  }, [])

  const handleCloseGoalModal = useCallback(() => {
    setIsGoalModalOpen(false)
    setEditingGoalId(null)
  }, [])

  const handleGoalCreated = useCallback(
    async (goalId: string): Promise<void> => {
      console.log("目标创建成功，准备切换到详情页面，目标ID:", goalId)
      setActiveSection("goals")
      return new Promise(async (resolve, reject) => {
        try {
          const allGoals = await memoApi.getGoals()
          const goalRaw = allGoals.find((g) => g.id === goalId)
          if (goalRaw) {
            const allLists = await memoApi.getLists()
            const list = allLists.find((l) => l.id === goalRaw.list_id)
            const allTodos = await memoApi.getTodos()
            const taskTodos = allTodos.filter((t) => t.goal_id === goalId && !t.deleted)
            const completedTasks = taskTodos.filter((t) => t.completed)
            const goal = {
              ...goalRaw,
              list_name: list?.name ?? null,
              total_tasks: taskTodos.length,
              completed_tasks: completedTasks.length,
              progress: taskTodos.length > 0 ? Math.round((completedTasks.length / taskTodos.length) * 100) : 0,
            } as Goal
            console.log("从数据库获取到目标数据:", goal)
            if (goalsMainInterfaceRef.current) {
              console.log("立即切换到目标详情页面")
              goalsMainInterfaceRef.current.selectGoalDirectly(goal)
              setTimeout(() => { console.log("目标切换完成"); resolve() }, 50)
            } else {
              console.error("GoalsMainInterface ref 不可用")
              reject(new Error("GoalsMainInterface ref 不可用"))
            }
          } else {
            console.error("数据库中未找到新创建的目标")
            reject(new Error("数据库中未找到新创建的目标"))
          }
        } catch (error) {
          console.error("查询新创建的目标失败:", error)
          reject(error)
        }
      })
    },
    [memoApi]
  )

  const handleSaveGoal = useCallback(
    async (goalData: GoalFormData): Promise<string> => {
      try {
        console.log("开始保存目标:", goalData)
        const isUpdate = !!(goalData.goalId && goalData.goalId !== "new")
        const goalId = isUpdate ? goalData.goalId : uuid()

        if (isUpdate) {
          const updateData = {
            name: goalData.name,
            description: goalData.description || null,
            list_id: sanitizeUuidField(goalData.list_id),
            start_date: goalData.start_date || null,
            due_date: goalData.due_date || null,
            priority: goalData.priority || 0,
          }
          console.log("更新目标数据:", updateData)
          await goalStore.getState().updateGoal(goalId!, updateData)
          console.log("目标更新成功，ID:", goalId)
          if (goalsMainInterfaceRef.current) {
            const updatedGoal = { ...goals.find(g => g.id === goalId), ...updateData, id: goalId } as Goal
            goalsMainInterfaceRef.current.updateSelectedGoal(updatedGoal)
          }
          if (onUpdateSelectedGoal) {
            const updatedGoal = { ...goals.find(g => g.id === goalId), ...updateData, id: goalId } as Goal
            onUpdateSelectedGoal(updatedGoal)
          }
        } else {
          const goal = {
            id: goalId,
            name: goalData.name,
            description: goalData.description || null,
            list_id: sanitizeUuidField(goalData.list_id),
            start_date: goalData.start_date || null,
            due_date: goalData.due_date || null,
            priority: goalData.priority || 0,
            created_time: new Date().toISOString(),
            is_archived: false,
          }
          console.log("准备插入目标数据:", goal)
          await goalStore.getState().addGoal(goal)
          console.log("目标插入成功，ID:", goalId)
        }

        if (!isUpdate) {
          const associatedTodos = goalData.associatedTodos || { existing: [], new: [] }
          if (associatedTodos.existing && associatedTodos.existing.length > 0) {
            console.log("关联现有待办事项:", associatedTodos.existing)
            for (let i = 0; i < associatedTodos.existing.length; i++) {
              await todoStore.getState().updateTodo(associatedTodos.existing[i], { goal_id: goalId, sort_order_in_goal: i + 1 })
            }
          }
          if (associatedTodos.new && associatedTodos.new.length > 0) {
            console.log("创建新待办事项:", associatedTodos.new)
            const existingCount = associatedTodos.existing?.length || 0
            for (let i = 0; i < associatedTodos.new.length; i++) {
              const todoTitle = associatedTodos.new[i]
              if (todoTitle.trim()) {
                const todoId = uuid()
                const newTodo = {
                  id: todoId, title: todoTitle.trim(), completed: false, deleted: false, sort_order: 0,
                  list_id: goalData.list_id || null, goal_id: goalId, sort_order_in_goal: existingCount + i + 1,
                  created_time: new Date().toISOString(),
                }
                await todoStore.getState().addTodo(newTodo)
              }
            }
          }
        }
        return goalId!
      } catch (error) {
        console.error("保存目标失败:", error)
        alert(`保存目标失败: ${error instanceof Error ? error.message : "未知错误"}`)
        throw error
      }
    },
    [goals, memoApi]
  )

  const handleUpdateGoal = useCallback(
    async (updatedGoal: Goal) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { list_name: _, progress: __, total_tasks: ___, completed_tasks: ____, ...updateData } = updatedGoal
        if (updateData.list_id !== undefined) updateData.list_id = sanitizeUuidField(updateData.list_id)
        await goalStore.getState().updateGoal(updatedGoal.id, updateData)
      } catch (error) {
        console.error("更新目标失败:", error)
        alert(`更新目标失败: ${error instanceof Error ? error.message : "未知错误"}`)
      }
    },
    [memoApi]
  )

  const handleDeleteGoal = useCallback(
    async (goalId: string) => {
      const goalToDelete = goals.find((g: Goal) => g.id === goalId)
      if (!goalToDelete) return
      try {
        await goalStore.getState().deleteGoal(goalId)
        const allTodos = await memoApi.getTodos()
        const todosToUpdate = allTodos.filter((t) => t.goal_id === goalId)
        for (const todo of todosToUpdate) await todoStore.getState().updateTodo(todo.id, { goal_id: null })
        toast.success('目标已删除')
      } catch (error) {
        toast.error('删除目标失败')
        throw error
      }
    },
    [goals, memoApi]
  )

  const handleAssociateTasks = useCallback(
    async (taskIds: string[], goalId: string) => {
      try {
        for (const taskId of taskIds) await todoStore.getState().updateTodo(taskId, { goal_id: goalId })
        console.log(`成功关联 ${taskIds.length} 个任务到目标 ${goalId}`)
      } catch (error) {
        console.error("关联任务失败:", error)
        alert(`关联任务失败: ${error instanceof Error ? error.message : "未知错误"}`)
      }
    },
    [memoApi]
  )

  return {
    isGoalModalOpen, setIsGoalModalOpen,
    editingGoalId, setEditingGoalId,
    goalsMainInterfaceRef,
    handleCreateGoal,
    handleEditGoal,
    handleCloseGoalModal,
    handleGoalCreated,
    handleSaveGoal,
    handleUpdateGoal,
    handleDeleteGoal,
    handleAssociateTasks,
  }
}
