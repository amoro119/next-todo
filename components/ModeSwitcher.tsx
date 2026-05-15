// components/ModeSwitcher.tsx
import { useState, useRef, useCallback } from "react";

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
  onOpenSettings: () => void;
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
  onOpenSettings,
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
                      value="导入滴答(csv)"
                      type="button"
                      className="btn-small action-import"
                      onClick={() => csvInputRef.current?.click()}
                    />
                  </li>
                  <li>
                    <input
                      type="button"
                      value="数据与备份"
                      className="btn-small"
                      onClick={onOpenSettings}
                    />
                  </li>
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
                <li>
                  <input
                    type="button"
                    value="数据与备份设置"
                    className="btn-small"
                    onClick={onOpenSettings}
                  />
                </li>
              </ul>
            )}
          </div>
      </div>
    </>
  );
}
