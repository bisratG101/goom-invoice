import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'flat' | 'tinted';
}

export function Card({
  variant = 'default',
  className = '',
  children,
  ...props
}: CardProps) {
  const variantClasses = {
    default: 'bg-surface border border-line shadow-card',
    flat: 'bg-surface border border-line',
    tinted: 'bg-surface-2 border border-line/50',
  };

  return (
    <div
      className={`rounded-lg p-5 transition-colors duration-150 ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}
