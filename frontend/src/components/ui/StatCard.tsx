import React from 'react';
import { Card } from './Card';

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  trend?: {
    value: string;
    positive?: boolean;
  };
  className?: string;
}

export function StatCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  className = '',
}: StatCardProps) {
  return (
    <Card className={`flex flex-col justify-between gap-3 ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-ink-500">
          {title}
        </span>
        {icon && <span className="text-ink-500" aria-hidden="true">{icon}</span>}
      </div>
      <div>
        <div className="text-2xl sm:text-3xl font-bold font-heading tracking-tight text-ink-900 tabular-nums">
          {value}
        </div>
        {subtitle && (
          <div className="mt-1 text-xs text-ink-500">{subtitle}</div>
        )}
        {trend && (
          <div className="mt-2 flex items-center gap-1 text-xs">
            <span
              className={`font-semibold ${
                trend.positive ? 'text-green-700' : 'text-red-700'
              }`}
            >
              {trend.value}
            </span>
            <span className="text-ink-500">vs last period</span>
          </div>
        )}
      </div>
    </Card>
  );
}
