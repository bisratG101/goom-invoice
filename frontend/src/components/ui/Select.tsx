import React, { forwardRef, useId } from 'react';
import { ChevronDownIcon } from './icons';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  helperText?: string;
  options?: SelectOption[];
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    error,
    helperText,
    options,
    children,
    id: customId,
    className = '',
    disabled,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const selectId = customId || generatedId;
  const helperId = `${selectId}-helper`;
  const errorId = `${selectId}-error`;

  return (
    <div className="w-full flex flex-col gap-1.5 text-left">
      {label && (
        <label htmlFor={selectId} className="text-sm font-medium text-ink-900">
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? errorId : helperText ? helperId : undefined
          }
          className={`w-full appearance-none rounded-md bg-surface px-3 py-2 pr-9 text-sm text-ink-900 border border-border-input focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 disabled:opacity-50 disabled:bg-surface-2 disabled:cursor-not-allowed transition-colors duration-150 cursor-pointer ${
            error ? '!border-red-500 focus:!ring-red-500' : ''
          } ${className}`}
          {...props}
        >
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <div className="absolute right-3 flex items-center pointer-events-none text-ink-500">
          <ChevronDownIcon size={16} />
        </div>
      </div>
      {error && (
        <p id={errorId} className="text-xs font-medium text-red-500" role="alert">
          {error}
        </p>
      )}
      {!error && helperText && (
        <p id={helperId} className="text-xs text-ink-500">
          {helperText}
        </p>
      )}
    </div>
  );
});
