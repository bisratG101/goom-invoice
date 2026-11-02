import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardAnalytics } from './DashboardAnalytics';
import * as api from '../../lib/api';

describe('DashboardAnalytics Component', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  const renderComponent = (props = {}) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <DashboardAnalytics defaultCurrency="ETB" {...props} />
      </QueryClientProvider>
    );
  };

  it('renders the shared timeline selector with all 6 options and default 6M', async () => {
    vi.spyOn(api, 'fetchDashboardAnalytics').mockResolvedValue({
      period: '6m',
      interval: 'month',
      timezone: 'Africa/Addis_Ababa',
      series: {
        ETB: [
          { key: '2026-06', label: 'Jun 2026', paidMinor: 100000, paidCount: 1, invoicedMinor: 150000, invoicedCount: 2 },
          { key: '2026-07', label: 'Jul 2026', paidMinor: 200000, paidCount: 2, invoicedMinor: 200000, invoicedCount: 2 },
        ],
        USD: [],
      },
      totals: {
        ETB: { totalPaidMinor: 300000, totalPaidCount: 3, totalInvoicedMinor: 350000, totalInvoicedCount: 4, collectionRatePercent: 85.7 },
        USD: { totalPaidMinor: 0, totalPaidCount: 0, totalInvoicedMinor: 0, totalInvoicedCount: 0, collectionRatePercent: 0 },
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Financial Analytics')).toBeInTheDocument();
      expect(screen.getByText('Revenue Trend')).toBeInTheDocument();
      expect(screen.getByText('Invoiced vs Collected')).toBeInTheDocument();
    });

    // Check all 6 timeline options
    const periods = ['7D', '30D', '3M', '6M', '12M', 'All time'];
    periods.forEach((p) => {
      expect(screen.getByRole('button', { name: p })).toBeInTheDocument();
    });

    // 6M should be selected by default
    expect(screen.getByRole('button', { name: '6M' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('triggers analytics re-fetch when selecting a different timeline period', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchDashboardAnalytics').mockResolvedValue({
      period: '30d',
      interval: 'day',
      timezone: 'Africa/Addis_Ababa',
      series: { ETB: [], USD: [] },
      totals: {
        ETB: { totalPaidMinor: 0, totalPaidCount: 0, totalInvoicedMinor: 0, totalInvoicedCount: 0, collectionRatePercent: 0 },
        USD: { totalPaidMinor: 0, totalPaidCount: 0, totalInvoicedMinor: 0, totalInvoicedCount: 0, collectionRatePercent: 0 },
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Financial Analytics')).toBeInTheDocument();
    });

    const button7d = screen.getByRole('button', { name: '7D' });
    fireEvent.click(button7d);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('7d');
      expect(button7d).toHaveAttribute('aria-pressed', 'true');
    });

    const button12m = screen.getByRole('button', { name: '12M' });
    fireEvent.click(button12m);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('12m');
      expect(button12m).toHaveAttribute('aria-pressed', 'true');
    });
  });

  it('gracefully renders empty state messages when no data exists for the selected period', async () => {
    vi.spyOn(api, 'fetchDashboardAnalytics').mockResolvedValue({
      period: '7d',
      interval: 'day',
      timezone: 'Africa/Addis_Ababa',
      series: { ETB: [], USD: [] },
      totals: {
        ETB: { totalPaidMinor: 0, totalPaidCount: 0, totalInvoicedMinor: 0, totalInvoicedCount: 0, collectionRatePercent: 0 },
        USD: { totalPaidMinor: 0, totalPaidCount: 0, totalInvoicedMinor: 0, totalInvoicedCount: 0, collectionRatePercent: 0 },
      },
    });

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No revenue collected yet')).toBeInTheDocument();
      expect(screen.getByText('No invoicing activity yet')).toBeInTheDocument();
    });
  });

  it('allows switching currency between ETB and USD', async () => {
    vi.spyOn(api, 'fetchDashboardAnalytics').mockResolvedValue({
      period: '6m',
      interval: 'month',
      timezone: 'Africa/Addis_Ababa',
      series: {
        ETB: [{ key: '2026-10', label: 'Oct 2026', paidMinor: 500000, paidCount: 1, invoicedMinor: 500000, invoicedCount: 1 }],
        USD: [{ key: '2026-10', label: 'Oct 2026', paidMinor: 150000, paidCount: 1, invoicedMinor: 200000, invoicedCount: 1 }],
      },
      totals: {
        ETB: { totalPaidMinor: 500000, totalPaidCount: 1, totalInvoicedMinor: 500000, totalInvoicedCount: 1, collectionRatePercent: 100 },
        USD: { totalPaidMinor: 150000, totalPaidCount: 1, totalInvoicedMinor: 200000, totalInvoicedCount: 1, collectionRatePercent: 75 },
      },
    });

    renderComponent({ currenciesInUse: ['ETB', 'USD'] });

    await waitFor(() => {
      expect(screen.getByText('ETB 5,000.00')).toBeInTheDocument();
    });

    const usdTab = screen.getByRole('tab', { name: 'USD' });
    fireEvent.click(usdTab);

    await waitFor(() => {
      expect(screen.getByText('USD 1,500.00')).toBeInTheDocument();
      expect(screen.getByText('USD 2,000.00 billed')).toBeInTheDocument();
    });
  });

  it('displays error alert with retry button when query fails', async () => {
    vi.spyOn(api, 'fetchDashboardAnalytics').mockRejectedValue(new Error('Network failure'));

    renderComponent();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByText(/Could not load analytics data/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });
});
