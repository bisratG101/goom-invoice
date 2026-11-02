import React, { forwardRef, useId } from 'react';

export interface MoneyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label?: string;
  error?: string;
  helperText?: string;
  currency?: 'ETB' | 'USD';
  onCurrencyChange?: (currency: 'ETB' | 'USD') => void;
  allowCurrencyToggle?: boolean;
  value?: string;
  minorUnitValue?: number;
  onValueChange?: (value: string, minorUnits: number) => void;
}

/**
 * MoneyInput handles decimal text entry and automatically computes
 * integer minor units (e.g. cents: 125.50 -> 12550).
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  {
    label,
    error,
    helperText,
    currency = 'ETB',
    onCurrencyChange,
    allowCurrencyToggle = false,
    value,
    minorUnitValue,
    onValueChange,
    id: customId,
    className = '',
    disabled,
    placeholder = '0.00',
    ...props
  },
  ref
) {
  const generatedId = useId();
  const inputId = customId || generatedId;
  const helperId = `${inputId}-helper`;
  const errorId = `${inputId}-error`;

  const displayValue =
    value !== undefined
      ? value
      : minorUnitValue !== undefined
      ? (minorUnitValue / 100).toFixed(2)
      : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // Allow digits and up to one decimal point with 2 decimals
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) {
      const floatVal = parseFloat(raw) || 0;
      const minorUnits = Math.round(floatVal * 100);
      onValueChange?.(raw, minorUnits);
    }
  };

  return (
    <div className="w-full flex flex-col gap-1.5 text-left">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-ink-900">
          {label}
        </label>
      )}
      <div className="relative flex items-center w-full">
        {/* Currency badge / toggle button */}
        <div className="absolute left-1.5 flex items-center z-10">
          {allowCurrencyToggle && onCurrencyChange ? (
            <button
              type="button"
              onClick={() => onCurrencyChange(currency === 'ETB' ? 'USD' : 'ETB')}
              title={`Switch currency from ${currency}`}
              aria-label={`Current currency ${currency}. Click to switch.`}
              disabled={disabled}
              className="px-2 py-1 text-xs font-semibold rounded bg-surface-2 hover:bg-line text-ink-900 border border-border-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              {currency} ▾
            </button>
          ) : (
            <span className="px-2 py-1 text-xs font-semibold rounded bg-surface-2 text-ink-700 border border-border-input select-none">
              {currency}
            </span>
          )}
        </div>

        <input
          ref={ref}
          id={inputId}
          type="text"
          inputMode="decimal"
          disabled={disabled}
          value={displayValue}
          onChange={handleChange}
          placeholder={placeholder}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={`w-full rounded-md bg-surface pl-16 pr-3 py-2 text-sm text-ink-900 placeholder:text-ink-500 tabular-nums font-mono border border-border-input focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-1 disabled:opacity-50 disabled:bg-surface-2 disabled:cursor-not-allowed transition-colors duration-150 ${
            error ? '!border-red-500 focus:!ring-red-500' : ''
          } ${className}`}
          {...props}
        />
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
