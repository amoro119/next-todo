// components/QuickActions.tsx
import { useState, useRef } from 'react';

interface QuickActionsProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  onUndo: () => void;
  canUndo: boolean;
  recycleBinCount: number;
  onMarkAllCompleted: () => void;
  showMarkAllCompleted: boolean;
  onManageLists: () => void;
  onImport: (file: File) => void;
}

export default function QuickActions({ 
    currentView, 
    setCurrentView, 
    onUndo, 
    canUndo, 
    recycleBinCount,
    onMarkAllCompleted,
    showMarkAllCompleted,
    onManageLists,
    onImport
}: QuickActionsProps) {
  const [isFolded, setIsFolded] = useState(false);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
    }
    // Reset input value to allow selecting the same file again
    event.target.value = ''; 
  };

  return (
    <>
      <input 
        type="file" 
        ref={jsonInputRef} 
        style={{ display: 'none' }} 
        accept=".json,.txt"
        onChange={handleFileChange}
      />
      <input 
        type="file" 
        ref={csvInputRef} 
        style={{ display: 'none' }} 
        accept=".csv"
        onChange={handleFileChange}
      />

      <div className={`footer side-bar ${isFolded ? 'fold' : ''}`}>
        <div className="side-shortcut" onClick={() => setIsFolded(!isFolded)}>
          <div className="shortcut-switch">
            <span className="shortcut-title">{isFolded ? '开' : '关'}</span>
            <span className="shortcut-name">快捷操作</span>
          </div>
        </div>
        
        {!isFolded && (
          <div className="todo-footer-box">
            <ul className="todo-func-list filter">
              <li>
                  <input className="btn-small" type="button" value="管理清单" onClick={onManageLists} />
              </li>
              {recycleBinCount > 0 && (
                <li>
                  <input
                    className={`btn-small action-deleted ${currentView === 'recycle' ? 'selected' : ''}`}
                    type="button"
                    value={`回收站 (${recycleBinCount})`}
                    onClick={() => setCurrentView('recycle')}
                  />
                </li>
              )}
            </ul>
            <ul className="todo-func-list batch">
              <li>
                <input
                  className="btn-small action-undo"
                  type="button"
                  value="撤销"
                  onClick={onUndo}
                  disabled={!canUndo}
                />
              </li>
              {showMarkAllCompleted && (
                <li>
                  <input
                    type="button"
                    className="btn-small completed-all"
                    value="全部标为已完成"
                    onClick={onMarkAllCompleted}
                  />
                </li>
              )}
            </ul>
            <ul className="todo-func-list datasave">
              <li>
                <input type="button" value="导出数据" className="btn-small action-download" id="download" />
              </li>
              <li>
                <input value="导入(txt/json)" type="button" className="btn-small action-import" onClick={() => jsonInputRef.current?.click()} />
              </li>
              <li>
                <input value="导入(csv)" type="button" className="btn-small action-import" onClick={() => csvInputRef.current?.click()} />
              </li>
              <li>
                <input 
                  value="数据库REPL" 
                  type="button" 
                  className="btn-small action-repl" 
                  onClick={() => window.open('/pg-repl-standalone.html', '_blank')} 
                />
              </li>
            </ul>
          </div>
        )}
      </div>
    </>
  );
}