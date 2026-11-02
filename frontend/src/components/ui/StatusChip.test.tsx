import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusChip, InvoiceStatus } from './StatusChip';

describe('StatusChip Component', () => {
  const statuses: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'void', 'pending'];

  it.each(statuses)('renders dot and text for status "%s"', (status) => {
    const { container } = render(<StatusChip status={status} />);
    const chip = screen.getByRole('status');
    expect(chip).toBeInTheDocument();

    // Verify dot element exists
    const dot = container.querySelector('[aria-hidden="true"]');
    expect(dot).toBeInTheDocument();

    // Verify text content is not empty
    expect(chip.textContent).toBeTruthy();
  });

  it('uses accessible darkened green text for paid status', () => {
    render(<StatusChip status="paid" />);
    const textSpan = screen.getByText('Paid');
    expect(textSpan.className).toContain('text-green-700');
  });

  it('uses accessible darkened amber text for pending status', () => {
    render(<StatusChip status="pending" />);
    const textSpan = screen.getByText('Pending');
    expect(textSpan.className).toContain('text-amber-800');
  });

  it('uses accessible darkened red text for overdue status', () => {
    render(<StatusChip status="overdue" />);
    const textSpan = screen.getByText('Overdue');
    expect(textSpan.className).toContain('text-red-700');
  });

  it('renders line-through for void status', () => {
    render(<StatusChip status="void" />);
    const textSpan = screen.getByText('Void');
    expect(textSpan.className).toContain('line-through');
  });
});
