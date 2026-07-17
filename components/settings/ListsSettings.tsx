'use client'

import { useState, useEffect, useRef } from 'react'
import type { DragEvent } from 'react'
import { useDatabase } from '@/app/providers/DatabaseProvider'
import { useListsQuery } from '@/lib/hooks/useDexieQuery'
import { cn } from '@/components/common/cn'
import type { List } from '@/lib/types'

export default function ListsSettings() {
  const { api } = useDatabase()
  const { data: lists } = useListsQuery()

  const [newListName, setNewListName] = useState('')
  const [editingList, setEditingList] = useState<List | null>(null)
  const [editingName, setEditingName] = useState('')
  const [currentLists, setCurrentLists] = useState<List[]>([])
  const editInputRef = useRef<HTMLInputElement>(null)
  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)

  useEffect(() => {
    setCurrentLists([...lists].sort((a, b) => a.sort_order - b.sort_order))
  }, [lists])

  useEffect(() => {
    if (editingList && editInputRef.current) editInputRef.current.focus()
  }, [editingList])

  const handleAdd = async () => {
    if (!newListName.trim()) return
    await api.addList({ name: newListName.trim() })
    setNewListName('')
  }

  const handleSaveEdit = async () => {
    if (!editingList || !editingName.trim()) return
    await api.updateList(editingList.id, { name: editingName.trim() })
    setEditingList(null)
  }

  const handleToggleVisibility = async (list: List) => {
    await api.updateList(list.id, { is_hidden: !list.is_hidden })
  }

  const handleDelete = async (id: string) => {
    await api.deleteList(id)
  }

  const handleDragStart = (e: DragEvent<HTMLLIElement>, index: number) => {
    dragItem.current = index
    e.currentTarget.classList.add('opacity-50')
  }

  const handleDragEnter = (e: DragEvent<HTMLLIElement>, index: number) => {
    dragOverItem.current = index
    const copy = [...currentLists]
    const dragged = copy[dragItem.current!]
    copy.splice(dragItem.current!, 1)
    copy.splice(dragOverItem.current!, 0, dragged)
    dragItem.current = dragOverItem.current
    dragOverItem.current = null
    setCurrentLists(copy)
  }

  const handleDragEnd = (e: DragEvent<HTMLLIElement>) => {
    e.currentTarget.classList.remove('opacity-50')
    currentLists.forEach((l, i) => api.updateList(l.id, { sort_order: i }))
  }

  return (
    <div className="max-w-lg space-y-6">
      <h2 className="text-lg font-semibold text-[oklch(var(--foreground))]">清单管理</h2>

      <div className="space-y-2">
        <label className="text-sm font-medium text-[oklch(var(--foreground))]">添加新清单</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            onKeyUp={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="新清单名称"
            className="form-control flex-1 px-3 py-2 text-sm"
          />
          <button
            onClick={handleAdd}
            className="px-3 py-2 rounded-lg bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))] text-sm font-medium hover:opacity-90 transition-opacity"
          >
            添加
          </button>
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium text-[oklch(var(--foreground))]">现有清单（可拖拽排序）</label>
        <ul className="space-y-1 mt-2">
          {currentLists.map((list, index) => (
            <li
              key={list.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragEnter={(e) => handleDragEnter(e, index)}
              onDragEnd={handleDragEnd}
              onDragOver={(e) => e.preventDefault()}
              className={cn(
                'flex items-center justify-between py-2 px-3 rounded-lg border border-transparent hover:border-[oklch(var(--border))] transition-colors',
                list.is_hidden && 'opacity-50'
              )}
            >
              {editingList?.id === list.id ? (
                <>
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyUp={(e) => e.key === 'Enter' && handleSaveEdit()}
                    className="form-control mr-2 flex-1 px-2 py-1 text-sm"
                  />
                  <div className="flex gap-1">
                    <button onClick={handleSaveEdit} className="px-2 py-1 rounded text-xs bg-[oklch(var(--primary))] text-[oklch(var(--primary-foreground))] hover:opacity-90">保存</button>
                    <button onClick={() => setEditingList(null)} className="px-2 py-1 rounded text-xs border border-[oklch(var(--border))] hover:bg-[oklch(var(--muted))]">取消</button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-sm text-[oklch(var(--foreground))] flex-1">{list.name}</span>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingList(list); setEditingName(list.name) }} className="px-2 py-1 rounded text-xs border border-[oklch(var(--border))] hover:bg-[oklch(var(--muted))]">编辑</button>
                    <button onClick={() => handleToggleVisibility(list)} className="px-2 py-1 rounded text-xs border border-[oklch(var(--border))] hover:bg-[oklch(var(--muted))]">{list.is_hidden ? '显示' : '隐藏'}</button>
                    <button onClick={() => handleDelete(list.id)} className="px-2 py-1 rounded text-xs border border-[oklch(var(--destructive)/0.4)] text-[oklch(var(--destructive))] hover:bg-[oklch(var(--destructive)/0.1)]">删除</button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
