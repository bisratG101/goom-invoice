import React, { useRef } from 'react';

export interface TabItem {
  id: string;
  label: React.ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function Tabs({ items, activeId, onChange, className = '' }: TabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = -1;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % items.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + items.length) % items.length;
    }

    if (nextIndex !== -1) {
      e.preventDefault();
      const nextTab = items[nextIndex];
      if (!nextTab.disabled) {
        onChange(nextTab.id);
        const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        buttons?.[nextIndex]?.focus();
      }
    }
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      className={`flex items-center gap-4 border-b border-line overflow-x-auto ${className}`}
    >
      {items.map((tab, idx) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`relative pb-3 text-sm font-medium transition-colors cursor-pointer select-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:rounded-sm disabled:cursor-not-allowed disabled:opacity-40 ${
              isActive ? 'text-blue-700 font-semibold' : 'text-ink-500 hover:text-ink-900'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.5 text-xs rounded-full ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'bg-surface-2 text-ink-500'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </span>
            {isActive && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-700 rounded-full" />
            )}
          </button>
        );
      })}
    </div>
  );
}

export function PillTabs({ items, activeId, onChange, className = '' }: TabsProps) {
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    let nextIndex = -1;
    if (e.key === 'ArrowRight') {
      nextIndex = (index + 1) % items.length;
    } else if (e.key === 'ArrowLeft') {
      nextIndex = (index - 1 + items.length) % items.length;
    }

    if (nextIndex !== -1) {
      e.preventDefault();
      const nextTab = items[nextIndex];
      if (!nextTab.disabled) {
        onChange(nextTab.id);
        const buttons = tabListRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
        buttons?.[nextIndex]?.focus();
      }
    }
  };

  return (
    <div
      ref={tabListRef}
      role="tablist"
      className={`inline-flex items-center gap-1 p-1 rounded-pill bg-surface-2 border border-line ${className}`}
    >
      {items.map((tab, idx) => {
        const isActive = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={isActive}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`px-3 py-1.5 text-xs sm:text-sm font-medium rounded-pill transition-all cursor-pointer select-none whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-40 ${
              isActive
                ? 'bg-surface text-ink-900 shadow-sm font-semibold'
                : 'text-ink-500 hover:text-ink-900'
            }`}
          >
            <span className="flex items-center gap-1.5">
              {tab.label}
              {tab.count !== undefined && (
                <span
                  className={`px-1.5 py-0.2 text-[11px] rounded-full ${
                    isActive ? 'bg-blue-50 text-blue-700' : 'bg-line text-ink-500'
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
