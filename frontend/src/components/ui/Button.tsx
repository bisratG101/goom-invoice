import React, { forwardRef } from 'react';
import { Spinner } from './icons';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  loadingText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

/**
 * Accessible button component supporting Grey-inspired pill styling.
 * 
 * Note on Accessibility & Contrast:
 * - Variant 'primary' uses the required token --blue-700 (#1A5FE0) with white text.
 *   The actual contrast ratio is ~4.26:1, which is below the WCAG AA 4.5:1 requirement
 *   for normal-sized text (< 18pt / 24px bold). We preserve #1A5FE0 as required by brand specs,
 *   and provide a high-contrast focus indicator (2px offset ring) for full keyboard accessibility.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    isLoading = false,
    loadingText,
    leftIcon,
    rightIcon,
    children,
    disabled,
    className = '',
    type = 'button',
    ...props
  },
  ref
) {
  const baseClasses =
    'relative inline-flex items-center justify-center font-medium rounded-pill select-none transition-all duration-150 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2';

  const sizeClasses = {
    sm: 'text-xs px-3 py-1.5 min-h-[36px] gap-1.5',
    md: 'text-sm px-4 py-2 min-h-[42px] gap-2',
    lg: 'text-base px-6 py-2.5 min-h-[48px] gap-2.5',
  };

  const variantClasses = {
    // Primary: Required #1A5FE0 background (~4.26:1 contrast with white text)
    primary:
      'bg-blue-700 hover:bg-blue-600 text-white shadow-sm active:translate-y-[1px]',
    // Secondary: Outlined with accessible border (>= 3:1 contrast against surface)
    secondary:
      'bg-surface hover:bg-surface-2 text-ink-900 border border-border-input active:translate-y-[1px]',
    // Ghost: Transparent background with subtle hover
    ghost:
      'bg-transparent hover:bg-surface-2 text-ink-700 hover:text-ink-900',
    // Danger: High contrast white on red-500
    danger:
      'bg-red-500 hover:bg-red-700 text-white shadow-sm active:translate-y-[1px]',
  };

  const isDisabled = disabled || isLoading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      aria-busy={isLoading ? 'true' : undefined}
      className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}
      {...props}
    >
      {isLoading && (
        <Spinner
          size={size === 'sm' ? 14 : size === 'lg' ? 18 : 16}
          className="shrink-0 text-current"
        />
      )}
      {!isLoading && leftIcon && <span className="shrink-0" aria-hidden="true">{leftIcon}</span>}
      <span>{isLoading && loadingText ? loadingText : children}</span>
      {!isLoading && rightIcon && <span className="shrink-0" aria-hidden="true">{rightIcon}</span>}
    </button>
  );
});
