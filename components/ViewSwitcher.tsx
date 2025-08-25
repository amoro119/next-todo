// components/ViewSwitcher.tsx
import React, { memo, useRef, useState, MouseEvent, useCallback } from 'react';
import type { List } from '../lib/types';
import { useViewSwitchMonitoring } from './ViewSwitchOptimizer';

interface ViewSwitcherProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  lists: List[];
  inboxCount: number;
  todosByList: Record<string, number>;
  todayCount?: number;
  mode?: 'todo' | 'goals'; // 添加模式属性
  goalsByList?: Record<string, number>; // 目标模式下各清单的目标数量
}

const ViewSwitcherComponent: React.FC<ViewSwitcherProps> = ({
  currentView,
  setCurrentView,
  lists,
  inboxCount,
  todosByList,
  todayCount,
  mode = 'todo', // 默认为待办模式
  goalsByList = {}, // 目标模式下各清单的目标数量
}) => {
  const viewSwitcherRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);
  
  // 视图切换性能监控
  const { recordSwitch } = useViewSwitchMonitoring();

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!viewSwitcherRef.current) return;
    setIsDragging(true);
    setStartX(e.pageX - viewSwitcherRef.current.offsetLeft);
    setScrollLeft(viewSwitcherRef.current.scrollLeft);
  };

  const handleMouseLeaveOrUp = () => {
    setIsDragging(false);
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !viewSwitcherRef.current) return;
    e.preventDefault();
    const x = e.pageX - viewSwitcherRef.current.offsetLeft;
    const walk = (x - startX) * 2; // scroll-fast
    viewSwitcherRef.current.scrollLeft = scrollLeft - walk;
  };

  // 优化的视图切换处理
  const handleOptimizedViewChange = useCallback((newView: string) => {
    if (newView === currentView) return;
    
    const startTime = performance.now();
    
    // 使用requestAnimationFrame确保非阻塞切换
    requestAnimationFrame(() => {
      setCurrentView(newView);
      
      // 记录切换性能
      requestAnimationFrame(() => {
        const duration = performance.now() - startTime;
        recordSwitch(currentView, newView, duration);
      });
    });
  }, [currentView, setCurrentView, recordSwitch]);

  // 简化的按钮点击处理器
  const createButtonHandler = useCallback((viewName: string) => {
    return () => handleOptimizedViewChange(viewName);
  }, [handleOptimizedViewChange]);

  return (
    <div
      className={`view-switcher ${isDragging ? 'active-drag' : ''}`}
      ref={viewSwitcherRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeaveOrUp}
      onMouseUp={handleMouseLeaveOrUp}
      onMouseMove={handleMouseMove}
    >
      {mode === 'todo' ? (
        // 待办模式：显示所有选项
        <>
          <button
            className={currentView === 'today' ? 'active' : ''}
            onClick={createButtonHandler('today')}
            data-view="today"
          >
            今日待办
          </button>
          <button 
            className={currentView === 'calendar' ? 'active' : ''}
            onClick={createButtonHandler('calendar')}
            data-view="calendar"
          >
            日历视图
          </button>
          <button 
            className={currentView === 'inbox' ? 'active' : ''}
            onClick={createButtonHandler('inbox')}
            data-view="inbox"
          >
            收件箱 {inboxCount > 0 && <span className="badge">{inboxCount}</span>}
          </button>
          {lists
            .filter((l: List) => !l.is_hidden)
            .map((list: List) => (
              <button
                key={list.id}
                className={currentView === list.name ? 'active' : ''}
                onClick={createButtonHandler(list.name)}
                data-view={list.name}
              >
                {list.name} {(todosByList[list.name] || 0) > 0 && <span className="badge">{todosByList[list.name]}</span>}
              </button>
            ))}
        </>
      ) : (
        // 目标模式：只显示“全部”和动态清单分类
        <>
          <button
            className={currentView === 'goals-main' ? 'active' : ''}
            onClick={createButtonHandler('goals-main')}
            data-view="goals-main"
          >
            全部
          </button>
          {lists
            .filter((l: List) => !l.is_hidden)
            .map((list: List) => (
              <button
                key={list.id}
                className={currentView === list.name ? 'active' : ''}
                onClick={createButtonHandler(list.name)}
                data-view={list.name}
              >
                {list.name} {(goalsByList[list.name] || 0) > 0 && <span className="badge">{goalsByList[list.name]}</span>}
              </button>
            ))}
        </>
      )}
    </div>
  );
};

export const ViewSwitcher = memo(ViewSwitcherComponent);