import React from 'react';

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shape?: 'text' | 'rect' | 'circle';
  className?: string;
}

/**
 * Skeleton placeholder that displays a subtle shimmer animation matching content shapes.
 * Automatically respects prefers-reduced-motion by disabling the shimmer animation.
 */
export function Skeleton({
  shape = 'rect',
  className = '',
  ...props
}: SkeletonProps) {
  const shapeClasses = {
    text: 'h-4 w-full rounded',
    rect: 'h-24 w-full rounded-md',
    circle: 'rounded-full',
  }[shape];

  return (
    <div
      aria-hidden="true"
      className={`relative overflow-hidden bg-surface-2 border border-line/40 animate-pulse ${shapeClasses} ${className}`}
      {...props}
    >
      <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-line/30 to-transparent motion-safe:animate-[shimmer_1.5s_infinite]" />
    </div>
  );
}
