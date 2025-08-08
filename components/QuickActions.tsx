// components/QuickActions.tsx
import { useState, useRef } from 'react';
import type { PGliteWithLive } from '@electric-sql/pglite/live';
import type { PGliteWithSync } from '@electric-sql/pglite-sync';
import { getAuthToken, getCachedAuthToken, invalidateToken } from '../lib/auth';

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
  onOpenSearch: () => void;
  onExport: () => void;
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
    onImport,
    onOpenSearch,
    onExport
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

  type PGliteWithExtensions = PGliteWithLive & PGliteWithSync;

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
                  <input className="btn-small action-search" type="button" value="搜索任务" onClick={onOpenSearch} />
              </li>
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
                <input type="button" value="导出数据" className="btn-small action-download" id="download" onClick={onExport} />
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
              <li>
                <input 
                  value="手动全量同步" 
                  type="button" 
                  className="btn-small action-sync" 
                  onClick={async () => {
                    try {
                      const win = window as unknown as { pg?: PGliteWithExtensions };
                      const pg = win.pg;
                      if (!pg) {
                        alert('数据库未初始化，无法同步');
                        return;
                      }
                      const mod = await import('../app/sync');
                      if (mod && typeof mod.forceFullTableSync === 'function') {
                        const electricProxyUrl = process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL;
                        let token = getCachedAuthToken && getCachedAuthToken();
                        if (!token && getAuthToken) {
                          token = await getAuthToken();
                        }
                        if (!electricProxyUrl || !token) {
                          alert('缺少同步配置');
                          return;
                        }
                        // lists表
                        await mod.forceFullTableSync({
                          table: 'lists',
                          columns: ['id', 'name', 'sort_order', 'is_hidden', 'modified'],
                          electricProxyUrl,
                          token,
                          pg,
                          upsertSql: `INSERT INTO lists (id, name, sort_order, is_hidden, modified) VALUES ($1, $2, $3, $4, $5)
                            ON CONFLICT(id) DO UPDATE SET name = $2, sort_order = $3, is_hidden = $4, modified = $5`
                        });
                        // todos表
                        await mod.forceFullTableSync({
                          table: 'todos',
                          columns: ['id', 'title', 'completed', 'deleted', 'sort_order', 'due_date', 'content', 'tags', 'priority', 'created_time', 'completed_time', 'start_date', 'list_id'],
                          electricProxyUrl,
                          token,
                          pg,
                          upsertSql: `INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id)
                            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                            ON CONFLICT(id) DO UPDATE SET title=$2, completed=$3, deleted=$4, sort_order=$5, due_date=$6, content=$7, tags=$8, priority=$9, created_time=$10, completed_time=$11, start_date=$12, list_id=$13`
                        });
                        alert('全量同步已完成');
                      } else {
                        alert('找不到同步方法');
                      }
                    } catch (e) {
                      alert('同步失败: ' + (e instanceof Error ? e.message : e));
                    }
                  }}
                />
              </li>
            </ul>
          </div>
        )}
      </div>
    </>
  );
}