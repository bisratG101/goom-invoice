import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MoneyInput } from './MoneyInput';

describe('MoneyInput Component', () => {
  it('renders with currency badge and formatted input', () => {
    render(<MoneyInput label="Total Amount" currency="ETB" value="125.50" readOnly />);
    expect(screen.getByText('ETB')).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toHaveValue('125.50');
  });

  it('calculates minor units on text entry', () => {
    const handleValueChange = vi.fn();
    render(<MoneyInput label="Amount" currency="USD" onValueChange={handleValueChange} />);

    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '45.25' } });

    expect(handleValueChange).toHaveBeenCalledWith('45.25', 4525);
  });

  it('allows currency toggle when enabled', () => {
    const handleCurrencyChange = vi.fn();
    render(
      <MoneyInput
        label="Amount"
        currency="ETB"
        allowCurrencyToggle={true}
        onCurrencyChange={handleCurrencyChange}
      />
    );

    const toggleBtn = screen.getByRole('button', { name: /Current currency ETB/i });
    fireEvent.click(toggleBtn);
    expect(handleCurrencyChange).toHaveBeenCalledWith('USD');
  });
});
