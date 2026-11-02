import React, { useState, useId } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
  placement?: 'top' | 'bottom';
  className?: string;
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  className = '',
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const tooltipId = useId();

  const placementClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  }[placement];

  return (
    <div
      className="relative inline-flex items-center"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {React.cloneElement(children, {
        'aria-describedby': isVisible ? tooltipId : undefined,
      })}
      {isVisible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`absolute ${placementClasses} z-50 px-2.5 py-1 text-xs font-medium text-white bg-ink-950 rounded shadow-md whitespace-nowrap pointer-events-none animate-in fade-in duration-100 ${className}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
