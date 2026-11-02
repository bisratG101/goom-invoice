import React from 'react';
import { Card } from './Card';

export interface MobileCardProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  statusBadge?: React.ReactNode;
  amount?: React.ReactNode;
  metadata?: Array<{ label: string; value: React.ReactNode }>;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
}

export function MobileCard({
  title,
  subtitle,
  statusBadge,
  amount,
  metadata,
  onClick,
  className = '',
  children,
}: MobileCardProps) {
  const isClickable = Boolean(onClick);

  return (
    <Card
      onClick={onClick}
      className={`flex flex-col gap-3 transition-colors ${
        isClickable ? 'cursor-pointer hover:border-ink-500 active:bg-surface-2' : ''
      } ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <div className="font-semibold text-ink-900 text-sm">{title}</div>
          {subtitle && <div className="text-xs text-ink-500">{subtitle}</div>}
        </div>
        {statusBadge && <div>{statusBadge}</div>}
      </div>

      {amount && (
        <div className="text-lg font-bold font-heading text-ink-900 tabular-nums">
          {amount}
        </div>
      )}

      {metadata && metadata.length > 0 && (
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-line/60 text-xs">
          {metadata.map((item, idx) => (
            <div key={idx} className="flex flex-col">
              <span className="text-ink-500 text-[11px]">{item.label}</span>
              <span className="font-medium text-ink-900">{item.value}</span>
            </div>
          ))}
        </div>
      )}

      {children}
    </Card>
  );
}
