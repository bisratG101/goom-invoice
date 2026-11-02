import React, { forwardRef, useId } from 'react';

export interface DateInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  {
    label,
    error,
    helperText,
    id: customId,
    className = '',
    disabled,
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = customId || generatedId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;

  return (
    <div className="w-full flex flex-col gap-1.5 text-left">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink-900">
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        type="date"
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
        className={`w-full rounded-md bg-surface px-3 py-2 text-sm text-ink-900 border border-border-input focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 disabled:opacity-50 disabled:bg-surface-2 disabled:cursor-not-allowed transition-colors duration-150 ${
          error ? '!border-red-500 focus:!ring-red-500' : ''
        } ${className}`}
        {...props}
      />
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
