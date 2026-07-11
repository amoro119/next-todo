// components/ManageListsModal.tsx
import { useState, useEffect, useRef, DragEvent } from 'react';
import { toast } from 'sonner';
import type { List } from '../lib/types';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';

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
    try {
      const newList = await onAddList(newListName.trim());
      if (newList) {
        setCurrentLists(prev => [...prev, newList]);
        setNewListName('');
        toast.success('清单已添加');
      }
    } catch (error) {
      toast.error('添加清单失败');
      throw error;
    }
  };

  const handleEdit = (list: List) => {
    setEditingList(list);
    setEditingListName(list.name);
  }

  const handleSaveEdit = async () => {
    if (!editingList || !editingListName.trim()) return;
    try {
      await onUpdateList(editingList.id, { name: editingListName.trim() });
      setEditingList(null);
      toast.success('清单已更新');
    } catch (error) {
      toast.error('更新清单失败');
      throw error;
    }
  }
  
  const handleToggleVisibility = async (list: List) => {
    await onUpdateList(list.id, { is_hidden: !list.is_hidden });
  };

  const handleDeleteList = async (listId: string) => {
    try {
      await onDeleteList(listId);
      toast.success('清单已删除');
    } catch (error) {
      toast.error('删除清单失败');
      throw error;
    }
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
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="flex h-[min(90vh,620px)] max-w-lg flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-[oklch(var(--border))] px-5 py-4 text-left">
          <DialogTitle>管理清单</DialogTitle>
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-5 px-5 py-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-[oklch(var(--foreground))]">添加新清单</label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  onKeyUp={(e) => e.key === 'Enter' && handleAdd()}
                  placeholder="新清单名称"
                  className="flex-1"
                />
                <Button type="button" onClick={handleAdd}>添加</Button>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-[oklch(var(--foreground))]">现有清单</label>
              <ul className="space-y-1">
                {currentLists.map((list, index) => (
                  <li
                    key={list.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragEnd={handleDragEnd}
                    onDragOver={(e) => e.preventDefault()}
                    className={`flex items-center justify-between gap-2 rounded-md border border-transparent px-2 py-2 transition-colors hover:border-[oklch(var(--border))] ${list.is_hidden ? 'opacity-50' : ''}`}
                  >
                    {editingList?.id === list.id ? (
                      <>
                        <Input
                          ref={editInputRef}
                          type="text"
                          value={editingListName}
                          onChange={(e) => setEditingListName(e.target.value)}
                          onKeyUp={(e) => e.key === 'Enter' && handleSaveEdit()}
                          className="h-8 flex-1"
                        />
                        <div className="flex items-center gap-1">
                          <Button type="button" size="sm" onClick={handleSaveEdit}>保存</Button>
                          <Button type="button" size="sm" variant="outline" onClick={handleCancelEdit}>取消</Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 truncate text-sm text-[oklch(var(--foreground))]">{list.name}</span>
                        <div className="flex items-center gap-1">
                          <Button type="button" size="sm" variant="outline" onClick={() => handleEdit(list)}>编辑</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => handleToggleVisibility(list)}>
                            {list.is_hidden ? '显示' : '隐藏'}
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button type="button" size="sm" variant="destructive">删除</Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>删除清单？</AlertDialogTitle>
                                <AlertDialogDescription>清单删除后，相关任务不会被删除，但会失去清单归属。</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>取消</AlertDialogCancel>
                                <AlertDialogAction className="bg-[oklch(var(--destructive))] text-[oklch(var(--destructive-foreground))] hover:bg-[oklch(var(--destructive)/0.9)]" onClick={() => handleDeleteList(list.id)}>删除</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="border-t border-[oklch(var(--border))] px-5 py-4">
          <Button type="button" onClick={onClose}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
