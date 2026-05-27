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

  const inputBase = 'w-full text-sm border-0 border-t border-border rounded-none shadow-none py-2.5 px-5 cursor-pointer transition-colors duration-150 bg-transparent';
  const modeTitleBase = 'bg-muted text-center box-border w-full font-bold select-none whitespace-nowrap p-2.5 block border-b-2 border-border';

  return (
    <>
      <input
        type="file"
        ref={csvInputRef}
        style={{ display: "none" }}
        accept=".csv"
        onChange={handleFileChange}
      />
      <div className="absolute left-[calc(100%+28px)] top-0 flex justify-start items-start flex-col border border-border bg-background rounded-xl shadow-lg text-center transition-all duration-300 overflow-hidden z-[999] select-none">
        <div className="block w-full" onClick={handleModeSwitch}>
          <div className="overflow-hidden cursor-pointer w-full">
            <span className={modeTitleBase}>{getModeIcon()}{getModeTitle()}</span>
          </div>
        </div>

        <div className="relative h-full w-full">

            {/* 只在待办模式下显示原有功能 */}
            {currentMode === 'todo' && (
              <>
                <ul className="flex flex-col justify-start items-start w-full p-0 text-sm">
                  <li className="first:border-t-0 cursor-pointer mx-auto transition-all duration-250 w-full">
                    <input
                      className={`${inputBase} hover:bg-[#e0f2fe]`}
                      type="button"
                      value="搜索任务"
                      onClick={onOpenSearch}
                    />
                  </li>
                  <li className="cursor-pointer mx-auto transition-all duration-250 w-full">
                    <input
                      className={inputBase}
                      type="button"
                      value="管理清单"
                      onClick={onManageLists}
                    />
                  </li>
                  {recycleBinCount > 0 && (
                    <li className="cursor-pointer mx-auto transition-all duration-250 w-full">
                      <input
                        className={`${inputBase} ${currentView === "recycle" ? 'shadow-[4px_4px_0px_#33322e] translate-x-[-2px] translate-y-[-2px] bg-[#f6a89e]' : 'hover:bg-[#f6a89e]'}`}
                        type="button"
                        value={`回收站 (${recycleBinCount})`}
                        onClick={() => setCurrentView("recycle")}
                      />
                    </li>
                  )}
                </ul>
                <ul className="flex flex-col justify-start items-start w-full p-0 text-sm">
                  <li className="cursor-pointer mx-auto transition-all duration-250 w-full">
                    <input
                      className={`${inputBase} hover:bg-[#f5d99e] disabled:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-60`}
                      type="button"
                      value="撤销"
                      onClick={onUndo}
                      disabled={!canUndo}
                    />
                  </li>
                  {showMarkAllCompleted && (
                    <li className="cursor-pointer mx-auto transition-all duration-250 w-full">
                      <input
                        type="button"
                        className={`${inputBase} hover:bg-[#8cd4cb]`}
                        value="全部标为已完成"
                        onClick={onMarkAllCompleted}
                      />
                    </li>
                  )}
                </ul>
                <ul className="flex flex-col justify-start items-start w-full p-0 text-sm">
                  <li className="first:border-t-0 cursor-pointer mx-auto transition-all duration-250 w-full">
                    <input
                      value="导入滴答(csv)"
                      type="button"
                      className={`${inputBase} hover:bg-[#f8d966]`}
                      onClick={() => csvInputRef.current?.click()}
                    />
                  </li>
                  <li className="cursor-pointer mx-auto transition-all duration-250 w-full">
                    <input
                      type="button"
                      value="数据与备份"
                      className={inputBase}
                      onClick={onOpenSettings}
                    />
                  </li>
                </ul>
              </>
            )}

            {/* 目标模式下的简化功能 */}
            {currentMode === 'goals' && (
              <ul className="flex flex-col justify-start items-start w-full p-0 text-sm">
                <li className="first:border-t-0 cursor-pointer mx-auto transition-all duration-250 w-full">
                  <input
                    className={`${inputBase} hover:bg-[#e0f2fe]`}
                    type="button"
                    value="搜索目标"
                    onClick={onOpenSearch}
                  />
                </li>
                <li className="cursor-pointer mx-auto transition-all duration-250 w-full">
                  <input
                    className={inputBase}
                    type="button"
                    value="管理清单"
                    onClick={onManageLists}
                  />
                </li>
                <li className="cursor-pointer mx-auto transition-all duration-250 w-full">
                  <input
                    type="button"
                    value="数据与备份设置"
                    className={inputBase}
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
