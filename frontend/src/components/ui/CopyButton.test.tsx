import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyButton } from './CopyButton';

describe('CopyButton Component', () => {
  it('renders copy button and updates to copied state on click', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });

    render(<CopyButton textToCopy="INV-SAMPLE" label="Copy Link" />);
    const btn = screen.getByRole('button');
    expect(btn).toHaveTextContent('Copy Link');

    fireEvent.click(btn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('INV-SAMPLE');

    await waitFor(() => {
      expect(screen.getByText('Copied!')).toBeInTheDocument();
      expect(screen.getByText('Copied to clipboard')).toBeInTheDocument();
    });
  });
});
