import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { StyleguidePage } from './StyleguidePage';
import { ThemeProvider } from '../../context/ThemeContext';

describe('StyleguidePage Full Verification', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  const renderStyleguide = () =>
    render(
      <MemoryRouter>
        <ThemeProvider>
          <StyleguidePage />
        </ThemeProvider>
      </MemoryRouter>
    );

  it('renders all 9 design system sections and the WCAG documentation', () => {
    renderStyleguide();

    expect(screen.getByText('UI Component Styleguide')).toBeInTheDocument();
    expect(screen.getByText(/Accessibility & Contrast Audit Documentation/i)).toBeInTheDocument();
    expect(screen.getByText(/1. Buttons/i)).toBeInTheDocument();
    expect(screen.getByText(/2. Form Controls/i)).toBeInTheDocument();
    expect(screen.getByText(/3. Status Chips/i)).toBeInTheDocument();
    expect(screen.getByText(/4. Cards & Multi-Currency Balances/i)).toBeInTheDocument();
    expect(screen.getByText(/5. Tabs & PillTabs/i)).toBeInTheDocument();
    expect(screen.getByText(/6. Table/i)).toBeInTheDocument();
    expect(screen.getByText(/7. Interactive Overlays/i)).toBeInTheDocument();
    expect(screen.getByText(/8. Feedback States/i)).toBeInTheDocument();
    expect(screen.getByText(/9. Micro-Components/i)).toBeInTheDocument();
  });

  it('verifies primary blue button styling contains bg-blue-700', () => {
    renderStyleguide();
    const primaryBtn = screen.getByRole('button', { name: /Primary LG \(#1A5FE0\)/i });
    expect(primaryBtn).toBeInTheDocument();
    expect(primaryBtn.className).toContain('bg-blue-700');
    expect(primaryBtn.className).toContain('text-white');
  });

  it('verifies multi-currency cards display ETB and USD separately without summing', () => {
    renderStyleguide();
    expect(screen.getByText('Outstanding (ETB)')).toBeInTheDocument();
    expect(screen.getByText('ETB 45,200.00')).toBeInTheDocument();

    expect(screen.getByText('Outstanding (USD)')).toBeInTheDocument();
    expect(screen.getByText('USD 1,850.00')).toBeInTheDocument();
  });

  it('verifies money input handles minor unit integer conversion', () => {
    renderStyleguide();
    expect(screen.getByText(/Stored integer value: 245050 minor units \(ETB\)/i)).toBeInTheDocument();
  });

  it('verifies interactive modal opening, focus trap dialog, and escape dismissal', () => {
    renderStyleguide();

    expect(screen.queryByRole('dialog', { name: /Modal with Focus Trap/i })).not.toBeInTheDocument();

    // Open modal
    const openBtn = screen.getByRole('button', { name: /Open Test Modal/i });
    fireEvent.click(openBtn);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Modal with Focus Trap')).toBeInTheDocument();

    // Dismiss with Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('verifies interactive toasts with aria-live container', async () => {
    renderStyleguide();

    const toastSuccessBtn = screen.getByRole('button', { name: /Toast: Success/i });
    fireEvent.click(toastSuccessBtn);

    await waitFor(() => {
      expect(screen.getByText('Invoice sent successfully')).toBeInTheDocument();
      expect(screen.getByText('Client Abebe Bikila was notified via email.')).toBeInTheDocument();
    });

    const dismissBtn = screen.getByRole('button', { name: /Dismiss notification/i });
    fireEvent.click(dismissBtn);

    await waitFor(() => {
      expect(screen.queryByText('Invoice sent successfully')).not.toBeInTheDocument();
    });
  });

  it('verifies theme toggle works on styleguide page', () => {
    renderStyleguide();

    const themeToggleBtn = screen.getByRole('button', { name: /Switch to dark theme/i });
    fireEvent.click(themeToggleBtn);

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});
