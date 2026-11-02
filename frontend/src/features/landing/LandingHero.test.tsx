import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { LandingHero } from './LandingHero';
import * as api from '../../lib/api';

vi.mock('../../lib/api', async () => {
  const actual = await vi.importActual('../../lib/api');
  return {
    ...actual,
    fetchConfig: vi.fn(),
  };
});

describe('LandingHero Demo Mode Gate & Placeholders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders "View live demo" button when demoMode is true', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValueOnce({ demoMode: true });

    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    await waitFor(() => {
      const demoBtn = screen.getByRole('link', { name: /view live demo/i });
      expect(demoBtn).toBeInTheDocument();
      expect(demoBtn).toHaveAttribute('href', '/demo');
    });
  });

  it('does NOT render "View live demo" button when demoMode is false (absent from DOM)', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValueOnce({ demoMode: false });

    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    // Initial render: absent
    expect(screen.queryByRole('link', { name: /view live demo/i })).toBeNull();

    // After resolution: still completely absent
    await waitFor(() => {
      expect(api.fetchConfig).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('link', { name: /view live demo/i })).toBeNull();
  });

  it('does NOT render "View live demo" button when config request fails (absent from DOM)', async () => {
    vi.mocked(api.fetchConfig).mockRejectedValueOnce(new Error('Network error'));

    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.fetchConfig).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByRole('link', { name: /view live demo/i })).toBeNull();
  });

  it('renders neutral illustrative placeholders and no invented invoice numbers or financial amounts', async () => {
    vi.mocked(api.fetchConfig).mockResolvedValueOnce({ demoMode: true });

    render(
      <MemoryRouter>
        <LandingHero />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(api.fetchConfig).toHaveBeenCalledTimes(1);
    });

    // Assert placeholder labels exist
    expect(screen.getByText('INV-••••')).toBeInTheDocument();
    expect(screen.getByText('ETB ••,•••.••')).toBeInTheDocument();
    expect(screen.getByText('USD •,•••.•• via Chapa')).toBeInTheDocument();
    expect(screen.getByText('ETB •••,•••.••')).toBeInTheDocument();
    expect(screen.getByText('USD •,•••.••')).toBeInTheDocument();

    // Assert invented numbers do not exist
    expect(screen.queryByText('INV-0007')).toBeNull();
    expect(screen.queryByText(/45,000/)).toBeNull();
    expect(screen.queryByText(/142,500/)).toBeNull();
  });
});
