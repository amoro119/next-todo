// components/ManageListsModal.tsx
import { useState, useEffect, useRef, DragEvent } from 'react';
import type { List } from '../lib/types';

interface ManageListsModalProps {
  lists: List[];
  onClose: () => void;
  onAddList: (name: string) => Promise<List | null>;
  onDeleteList: (listId: string) => Promise<void>;
  onUpdateList: (listId: string, updates: Partial<List>) => Promise<void>;
  onUpdateListsOrder: (lists: List[]) => Promise<void>;
}

export default function ManageListsModal({ 
    lists, 
    onClose,
    onAddList,
    onDeleteList,
    onUpdateList,
    onUpdateListsOrder
}: ManageListsModalProps) {
  const [newListName, setNewListName] = useState('');
  const [editingList, setEditingList] = useState<List | null>(null);
  const [editingListName, setEditingListName] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  // Use local state to manage list order during drag-and-drop for better performance
  const [currentLists, setCurrentLists] = useState<List[]>([]);
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  useEffect(() => {
    // Initialize local list state when the modal opens
    setCurrentLists([...lists].sort((a, b) => a.sort_order - b.sort_order));
  }, [lists]);
  
  useEffect(() => {
    if (editingList && editInputRef.current) {
        editInputRef.current.focus();
    }
  }, [editingList]);

  const handleAdd = async () => {
    if (!newListName.trim()) return;
    const newList = await onAddList(newListName.trim());
    if (newList) {
        setCurrentLists(prev => [...prev, newList]);
        setNewListName('');
    }
  };

  const handleEdit = (list: List) => {
    setEditingList(list);
    setEditingListName(list.name);
  }

  const handleSaveEdit = async () => {
    if (!editingList || !editingListName.trim()) return;
    await onUpdateList(editingList.id, { name: editingListName.trim() });
    setEditingList(null);
  }
  
  const handleToggleVisibility = async (list: List) => {
    await onUpdateList(list.id, { is_hidden: !list.is_hidden });
  };

  const handleCancelEdit = () => {
    setEditingList(null);
  }
  
  // Drag and Drop Handlers
  const handleDragStart = (e: DragEvent<HTMLLIElement>, index: number) => {
    dragItem.current = index;
    // Optional: Add a class for visual feedback
    e.currentTarget.classList.add('opacity-50', 'bg-muted');
  };

  const handleDragEnter = (e: DragEvent<HTMLLIElement>, index: number) => {
    dragOverItem.current = index;
    const listsCopy = [...currentLists];
    const dragItemContent = listsCopy[dragItem.current!];
    listsCopy.splice(dragItem.current!, 1);
    listsCopy.splice(dragOverItem.current!, 0, dragItemContent);
    dragItem.current = dragOverItem.current;
    dragOverItem.current = null;
    setCurrentLists(listsCopy);
  };
  
  const handleDragEnd = (e: DragEvent<HTMLLIElement>) => {
    e.currentTarget.classList.remove('opacity-50', 'bg-muted');
    // Update the sort_order property for each list
    const reorderedLists = currentLists.map((list, index) => ({
      ...list,
      sort_order: index,
    }));
    // Call the parent handler to persist the new order
    onUpdateListsOrder(reorderedLists);
    dragItem.current = null;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-background border border-border rounded-lg p-6 w-full max-w-md shadow-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">管理清单</h2>
          <button className="p-1.5 rounded-md hover:bg-muted transition-colors duration-150 text-muted-foreground text-lg leading-none" onClick={onClose}>×</button>
        </div>
        <div className="space-y-4">
          <div className="mb-4">
            <label className="text-sm font-medium text-foreground mb-1 block">添加新清单</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyUp={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="新清单名称"
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button className="px-3 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity" onClick={handleAdd}>添加</button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-foreground mb-1 block">现有清单 (可拖拽排序)</label>
            <ul className="space-y-1">
              {currentLists.map((list, index) => (
                <li 
                  key={list.id} 
                  draggable 
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className={`flex items-center justify-between py-2 px-2 rounded-md border border-transparent hover:border-border transition-colors duration-150 ${list.is_hidden ? 'opacity-50' : ''}`}
                >
                  {editingList?.id === list.id ? (
                    <>
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingListName}
                        onChange={(e) => setEditingListName(e.target.value)}
                        onKeyUp={(e) => e.key === 'Enter' && handleSaveEdit()}
                        className="flex-1 px-2 py-1 rounded border border-border bg-background text-foreground text-sm focus:outline-none focus:ring-1 focus:ring-ring mr-2"
                      />
                      <div className="flex items-center gap-1">
                        <button className="px-2 py-1 rounded text-xs bg-foreground text-background hover:opacity-90 transition-opacity" onClick={handleSaveEdit}>保存</button>
                        <button className="px-2 py-1 rounded text-xs border border-border hover:bg-muted transition-colors duration-150" onClick={handleCancelEdit}>取消</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-foreground flex-1">{list.name}</span>
                      <div className="flex items-center gap-1">
                        <button className="px-2 py-1 rounded text-xs border border-border hover:bg-muted transition-colors duration-150" onClick={() => handleEdit(list)}>编辑</button>
                        <button className="px-2 py-1 rounded text-xs border border-border hover:bg-muted transition-colors duration-150" onClick={() => handleToggleVisibility(list)}>
                            {list.is_hidden ? '显示' : '隐藏'}
                        </button>
                        <button className="px-2 py-1 rounded text-xs border border-border text-destructive hover:bg-muted transition-colors duration-150" onClick={() => onDeleteList(list.id)}>删除</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="flex justify-end mt-4">
          <button className="px-4 py-2 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-90 transition-opacity" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}