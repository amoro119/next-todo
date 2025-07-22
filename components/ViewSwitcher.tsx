// components/ViewSwitcher.tsx
import React, { memo, useRef, useState, MouseEvent } from 'react';
import type { List } from '../lib/types';

interface ViewSwitcherProps {
  currentView: string;
  setCurrentView: (view: string) => void;
  lists: List[];
  inboxCount: number;
  todosByList: Record<string, number>;
  todayCount?: number;
}

const ViewSwitcherComponent: React.FC<ViewSwitcherProps> = ({
  currentView,
  setCurrentView,
  lists,
  inboxCount,
  todosByList,
  todayCount,
}) => {
  const viewSwitcherRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [scrollLeft, setScrollLeft] = useState(0);

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

  const handleSetCurrentView = (view: string) => {
    if (view !== currentView) {
      setCurrentView(view);
    }
  };

  return (
    <div
      className={`view-switcher ${isDragging ? 'active-drag' : ''}`}
      ref={viewSwitcherRef}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeaveOrUp}
      onMouseUp={handleMouseLeaveOrUp}
      onMouseMove={handleMouseMove}
    >
      <button
        className={currentView === 'today' ? 'active' : ''}
        onClick={() => setCurrentView('today')}
      >
        今日待办
      </button>
      <button onClick={() => handleSetCurrentView('calendar')} className={currentView === 'calendar' ? 'active' : ''}>
        日历视图
      </button>
      <button onClick={() => handleSetCurrentView('inbox')} className={currentView === 'inbox' ? 'active' : ''}>
        收件箱 {inboxCount > 0 && <span className="badge">{inboxCount}</span>}
      </button>
      {lists
        .filter((l: List) => !l.is_hidden)
        .map((list: List) => (
          <button
            key={list.id}
            onClick={() => handleSetCurrentView(list.name)}
            className={currentView === list.name ? 'active' : ''}
          >
            {list.name} {(todosByList[list.name] || 0) > 0 && <span className="badge">{todosByList[list.name]}</span>}
          </button>
        ))}
    </div>
  );
};

export const ViewSwitcher = memo(ViewSwitcherComponent);