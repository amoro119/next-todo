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
    e.currentTarget.classList.add('dragging');
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
    e.currentTarget.classList.remove('dragging');
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>管理清单</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label>添加新清单</label>
            <div className="add-list-wrapper">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyUp={(e) => e.key === 'Enter' && handleAdd()}
                placeholder="新清单名称"
              />
              <button className="btn-small confirm" onClick={handleAdd}>添加</button>
            </div>
          </div>
          <div className="form-group">
            <label>现有清单 (可拖拽排序)</label>
            <ul className="manage-lists-list">
              {currentLists.map((list, index) => (
                <li 
                  key={list.id} 
                  draggable 
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                  className={list.is_hidden ? 'list-hidden' : ''}
                >
                  {editingList?.id === list.id ? (
                    <>
                      <input
                        ref={editInputRef}
                        type="text"
                        value={editingListName}
                        onChange={(e) => setEditingListName(e.target.value)}
                        onKeyUp={(e) => e.key === 'Enter' && handleSaveEdit()}
                      />
                      <div className="list-actions">
                        <button className="btn-small confirm" onClick={handleSaveEdit}>保存</button>
                        <button className="btn-small" onClick={handleCancelEdit}>取消</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <span>{list.name}</span>
                      <div className="list-actions">
                        <button className="btn-small" onClick={() => handleEdit(list)}>编辑</button>
                        <button className="btn-small" onClick={() => handleToggleVisibility(list)}>
                            {list.is_hidden ? '显示' : '隐藏'}
                        </button>
                        <button className="btn-small delete" onClick={() => onDeleteList(list.id)}>删除</button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-small confirm" onClick={onClose}>完成</button>
        </div>
      </div>
    </div>
  );
}