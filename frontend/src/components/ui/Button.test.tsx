import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from './Button';

describe('Button Component', () => {
  it('renders primary variant with --blue-700 background class', () => {
    render(<Button variant="primary">Create Invoice</Button>);
    const btn = screen.getByRole('button', { name: /create invoice/i });
    expect(btn).toBeInTheDocument();
    expect(btn.className).toContain('bg-blue-700');
    expect(btn.className).toContain('text-white');
  });

  it('renders loading state with aria-busy and spinner', () => {
    render(<Button isLoading loadingText="Processing...">Submit</Button>);
    const btn = screen.getByRole('button');
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(btn).toBeDisabled();
    expect(screen.getByText('Processing...')).toBeInTheDocument();
  });

  it('renders secondary variant with accessible border', () => {
    render(<Button variant="secondary">Cancel</Button>);
    const btn = screen.getByRole('button', { name: /cancel/i });
    expect(btn.className).toContain('border-border-input');
  });

  it('handles click events when enabled and ignores when disabled', () => {
    const handleClick = vi.fn();
    const { rerender } = render(<Button onClick={handleClick}>Clickable</Button>);
    fireEvent.click(screen.getByRole('button', { name: /clickable/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);

    rerender(<Button onClick={handleClick} disabled>Clickable</Button>);
    fireEvent.click(screen.getByRole('button', { name: /clickable/i }));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
