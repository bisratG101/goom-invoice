import React from 'react';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  className = '',
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-lg border border-dashed border-border-input bg-surface-2/40 ${className}`}
    >
      {icon && (
        <div className="mb-4 flex items-center justify-center w-14 h-14 rounded-2xl bg-surface border border-line text-blue-700 shadow-sm" aria-hidden="true">
          {icon}
        </div>
      )}
      <h3 className="text-base sm:text-lg font-bold font-heading text-ink-900">
        {title}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-ink-500 leading-relaxed">
        {description}
      </p>
      {actionLabel && onAction && (
        <div className="mt-6">
          <Button variant="primary" size="md" onClick={onAction}>
            {actionLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
