// components/ModeSwitcher.tsx
import { useState, useRef, useCallback } from "react";
import type { PGliteWithLive } from "@electric-sql/pglite/live";
import type { PGliteWithSync } from "@electric-sql/pglite-sync";
import { getAuthToken, getCachedAuthToken } from "../lib/auth";
import { useAppConfig } from "../lib/hooks/useAppConfig";
import { updateUserState } from "../lib/user/userState";
import { SyncControlButton } from "./SyncControlButton";

type AppMode = 'todo' | 'goals';

interface ShortcutSwitchProps {
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

export default function ShortcutSwitch({
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
  onExport,
}: ShortcutSwitchProps) {
  // 模式状态管理和持久化
  const [currentMode, setCurrentMode] = useState<AppMode>(() => {
    if (typeof window !== 'undefined') {
      const savedMode = localStorage.getItem('app_mode') as AppMode;
      return savedMode || 'todo';
    }
    return 'todo';
  });

  const [isTransitioning, setIsTransitioning] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const sqlInputRef = useRef<HTMLInputElement>(null);
  const { sync } = useAppConfig();

  // 持久化模式状态
  const persistMode = useCallback((mode: AppMode) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_mode', mode);
    }
  }, []);

  // 模式切换处理
  const handleModeSwitch = useCallback(() => {
    if (isTransitioning) return;
    
    setIsTransitioning(true);
    const newMode = currentMode === 'todo' ? 'goals' : 'todo';
    
    // 添加切换动画
    setTimeout(() => {
      setCurrentMode(newMode);
      persistMode(newMode);
      
      // 触发模式切换事件
      window.dispatchEvent(new CustomEvent('modeChanged', { 
        detail: { mode: newMode, previousMode: currentMode } 
      }));
      
      // 如果切换到目标模式，设置视图为目标主界面
      if (newMode === 'goals') {
        setCurrentView('goals-main');
      } else {
        // 切换回待办模式时，默认显示今日视图
        setCurrentView('today');
      }
      
      setIsTransitioning(false);
    }, 150);
  }, [currentMode, isTransitioning, persistMode, setCurrentView]);

  // 文件上传处理
  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onImport(file);
    }
    event.target.value = "";
  };

  type PGliteWithExtensions = PGliteWithLive & PGliteWithSync;

  const handleUpgradeClick = () => {
    window.dispatchEvent(new CustomEvent('showUpgradeDialog'));
  };

  // 获取模式图标
  const getModeIcon = () => {
    if (currentMode === 'todo') {
      return '☰'; // 列表图标
    } else {
      return '🎯'; // 目标图标
    }
  };

  // 获取模式标题
  const getModeTitle = () => {
    if (currentMode === 'todo') {
      return '待办模式';
    } else {
      return '目标模式';
    }
  };

  return (
    <>
      <input
        type="file"
        ref={csvInputRef}
        style={{ display: "none" }}
        accept=".csv"
        onChange={handleFileChange}
      />
      <input
        type="file"
        ref={sqlInputRef}
        style={{ display: "none" }}
        accept=".sql"
        onChange={handleFileChange}
      />

      <div className={`footer side-bar`}>
        <div className="side-shortcut" onClick={handleModeSwitch}>
          <div className="shortcut-switch">
            <span className="shortcut-title">{getModeIcon()}{getModeTitle()}</span>
          </div>
        </div>

        <div className="todo-footer-box">

            {/* 只在待办模式下显示原有功能 */}
            {currentMode === 'todo' && (
              <>
                <ul className="todo-func-list filter">
                  <li>
                    <input
                      className="btn-small action-search"
                      type="button"
                      value="搜索任务"
                      onClick={onOpenSearch}
                    />
                  </li>
                  <li>
                    <input
                      className="btn-small"
                      type="button"
                      value="管理清单"
                      onClick={onManageLists}
                    />
                  </li>
                  {sync.enabled && (
                    <li>
                      <SyncControlButton />
                    </li>
                  )}
                  {recycleBinCount > 0 && (
                    <li>
                      <input
                        className={`btn-small action-deleted ${
                          currentView === "recycle" ? "selected" : ""
                        }`}
                        type="button"
                        value={`回收站 (${recycleBinCount})`}
                        onClick={() => setCurrentView("recycle")}
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
                    <input
                      type="button"
                      value="备份数据(sql)"
                      className="btn-small action-download"
                      id="download"
                      onClick={onExport}
                    />
                  </li>
                  <li>
                    <input
                      value="恢复数据(sql)"
                      type="button"
                      className="btn-small action-import"
                      onClick={() => sqlInputRef.current?.click()}
                    />
                  </li>
                  <li>
                    <input
                      value="导入滴答(csv)"
                      type="button"
                      className="btn-small action-import"
                      onClick={() => csvInputRef.current?.click()}
                    />
                  </li>
                  {process.env.NODE_ENV === "development" && (
                    <li>
                      <input
                        value="数据库REPL"
                        type="button"
                        className="btn-small action-repl"
                        onClick={() =>
                          window.open("/pg-repl-standalone.html", "_blank")
                        }
                      />
                    </li>
                  )}
                  {sync.enabled && (
                    <li>
                      <input
                        value="手动全量同步"
                        type="button"
                        className="btn-small action-sync"
                        onClick={async () => {
                          try {
                            const win = window as unknown as {
                              pg?: PGliteWithExtensions;
                            };
                            const pg = win.pg;
                            if (!pg) {
                              alert("数据库未初始化，无法同步");
                              return;
                            }
                            const mod = await import("../app/sync");
                            if (mod && typeof mod.forceFullTableSync === "function") {
                              const electricProxyUrl =
                                process.env.NEXT_PUBLIC_ELECTRIC_PROXY_URL;
                              let token = getCachedAuthToken && getCachedAuthToken();
                              if (!token && getAuthToken) {
                                token = await getAuthToken();
                              }
                              if (!electricProxyUrl || !token) {
                                alert("缺少同步配置");
                                return;
                              }
                              // lists表
                              await mod.forceFullTableSync({
                                table: "lists",
                                columns: [
                                  "id",
                                  "name",
                                  "sort_order",
                                  "is_hidden",
                                  "modified",
                                ],
                                electricProxyUrl,
                                token,
                                pg,
                                upsertSql: `INSERT INTO lists (id, name, sort_order, is_hidden, modified) VALUES ($1, $2, $3, $4, $5)
                                  ON CONFLICT(id) DO UPDATE SET name = $2, sort_order = $3, is_hidden = $4, modified = $5`,
                              });
                              // todos表
                              await mod.forceFullTableSync({
                                table: "todos",
                                columns: [
                                  "id",
                                  "title",
                                  "completed",
                                  "deleted",
                                  "sort_order",
                                  "due_date",
                                  "content",
                                  "tags",
                                  "priority",
                                  "created_time",
                                  "completed_time",
                                  "start_date",
                                  "list_id",
                                ],
                                electricProxyUrl,
                                token,
                                pg,
                                upsertSql: `INSERT INTO todos (id, title, completed, deleted, sort_order, due_date, content, tags, priority, created_time, completed_time, start_date, list_id)
                                  VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                                  ON CONFLICT(id) DO UPDATE SET title=$2, completed=$3, deleted=$4, sort_order=$5, due_date=$6, content=$7, tags=$8, priority=$9, created_time=$10, completed_time=$11, start_date=$12, list_id=$13`,
                              });
                              alert("全量同步已完成");
                            } else {
                              alert("找不到同步方法");
                            }
                          } catch (e) {
                            alert(
                              "同步失败: " + (e instanceof Error ? e.message : e)
                            );
                          }
                        }}
                      />
                    </li>
                  )}
                  {!sync.enabled && sync.reason === 'free_user' && (
                    <li>
                      <input
                        value="升级解锁同步"
                        type="button"
                        className="btn-small action-upgrade"
                        onClick={() => handleUpgradeClick()}
                      />
                    </li>
                  )}
                </ul>
              </>
            )}

            {/* 目标模式下的简化功能 */}
            {currentMode === 'goals' && (
              <ul className="todo-func-list filter">
                <li>
                  <input
                    className="btn-small action-search"
                    type="button"
                    value="搜索目标"
                    onClick={onOpenSearch}
                  />
                </li>
                <li>
                  <input
                    className="btn-small"
                    type="button"
                    value="管理清单"
                    onClick={onManageLists}
                  />
                </li>
              </ul>
            )}
          </div>
      </div>
    </>
  );
}