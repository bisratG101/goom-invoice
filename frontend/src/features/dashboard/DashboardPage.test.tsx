import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardPage } from './DashboardPage';
import { ThemeProvider } from '../../context/ThemeContext';
import * as AuthContextModule from '../../context/AuthContext';
import * as api from '../../lib/api';

describe('Prompt 14: Dashboard (/app)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', name: 'Almaz Ayana', email: 'almaz@example.com' },
      business: {
        id: 'b1',
        name: 'Almaz Running Gear',
        defaultCurrency: 'ETB',
        invoicePrefix: 'ALG',
        timezone: 'Africa/Addis_Ababa',
      },
      token: 'mock-token',
      isAuthenticated: true,
      isLoading: false,
      isDemo: false,
      login: vi.fn(),
      register: vi.fn(),
      loginDemo: vi.fn(),
      logout: vi.fn(),
      updateBusinessState: vi.fn(),
    });

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  const renderDashboard = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/app']}>
            <DashboardPage />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };

  it('renders personalized greeting and business info', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 100000, overdueMinor: 20000, paidThisMonthMinor: 50000 },
        USD: { outstandingMinor: 50000, overdueMinor: 0, paidThisMonthMinor: 10000 },
      },
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({
      months: 6,
      revenue: {
        ETB: [{ month: '2026-10', revenueMinor: 50000 }],
        USD: [{ month: '2026-10', revenueMinor: 10000 }],
      },
    });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({
      activity: [],
    });

    renderDashboard();

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/Almaz/i);
    expect(screen.getByText(/Almaz Running Gear/i)).toBeInTheDocument();
    expect(screen.getByText('ALG')).toBeInTheDocument();
  });

  it('displays ETB and USD balance cards side-by-side without summing them', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 125050, overdueMinor: 25000, paidThisMonthMinor: 80000 },
        USD: { outstandingMinor: 45000, overdueMinor: 10000, paidThisMonthMinor: 30000 },
      },
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({
      months: 6,
      revenue: { ETB: [], USD: [] },
    });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({
      activity: [],
    });

    renderDashboard();

    await waitFor(() => {
      // Both currency cards present
      expect(screen.getByText('Outstanding (ETB)')).toBeInTheDocument();
      expect(screen.getByText('Outstanding (USD)')).toBeInTheDocument();
      // Numbers formatted properly in minor units
      expect(screen.getByText('ETB 1,250.50')).toBeInTheDocument();
      expect(screen.getByText('USD 450.00')).toBeInTheDocument();
      expect(screen.getByText('ETB 250.00')).toBeInTheDocument();
      expect(screen.getByText('USD 100.00')).toBeInTheDocument();
    });
  });

  it('renders quick action buttons linking to correct routes', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
        USD: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
      },
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({ months: 6, revenue: { ETB: [], USD: [] } });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({ activity: [] });

    renderDashboard();

    await waitFor(() => {
      const newInvoiceLink = screen.getAllByRole('link', { name: /new invoice/i })[0];
      expect(newInvoiceLink).toHaveAttribute('href', '/app/invoices/new');

      const addClientLink = screen.getByRole('link', { name: /add client/i });
      expect(addClientLink).toHaveAttribute('href', '/app/clients');

      const allInvoicesLink = screen.getByRole('link', { name: /all invoices/i });
      expect(allInvoicesLink).toHaveAttribute('href', '/app/invoices');
    });
  });

  it('renders recent activity feed with status dot and text', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 50000, overdueMinor: 0, paidThisMonthMinor: 0 },
        USD: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
      },
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({ months: 6, revenue: { ETB: [], USD: [] } });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({
      activity: [
        {
          invoiceId: 'inv-123',
          displayNumber: 'ALG-0007',
          clientName: 'Dibaba Training Camp',
          currency: 'ETB',
          totalMinor: 750000,
          eventType: 'paid',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Recent Activity')).toBeInTheDocument();
      expect(screen.getByText('ALG-0007')).toBeInTheDocument();
      expect(screen.getByText('Dibaba Training Camp')).toBeInTheDocument();
      expect(screen.getByText('paid')).toBeInTheDocument();
      expect(screen.getByText('ETB 7,500.00')).toBeInTheDocument();
    });
  });

  it('shows truthful first-invoice banner for brand new accounts with zero invoices', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
        USD: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
      },
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({ months: 6, revenue: { ETB: [], USD: [] } });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({ activity: [] });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Create your first invoice/i)).toBeInTheDocument();
      expect(screen.getByText(/Manage clients/i)).toBeInTheDocument();
    });
  });

  it('renders only default ETB card when account only uses ETB', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 50000, overdueMinor: 0, paidThisMonthMinor: 0 },
        USD: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
      },
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({
      months: 6,
      revenue: { ETB: [{ month: '2026-10', revenueMinor: 50000 }], USD: [] },
    });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({ activity: [] });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Outstanding (ETB)')).toBeInTheDocument();
      expect(screen.queryByText('Outstanding (USD)')).not.toBeInTheDocument();
    });
  });

  it('renders only USD card when business default is USD and ETB has no activity', async () => {
    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', name: 'Almaz Ayana', email: 'almaz@example.com' },
      business: {
        id: 'b1',
        name: 'Almaz Running Gear',
        defaultCurrency: 'USD',
        invoicePrefix: 'ALG',
        timezone: 'Africa/Addis_Ababa',
      },
      token: 'mock-token',
      isAuthenticated: true,
      isLoading: false,
      isDemo: false,
      login: vi.fn(),
      register: vi.fn(),
      loginDemo: vi.fn(),
      logout: vi.fn(),
      updateBusinessState: vi.fn(),
    });

    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
        USD: { outstandingMinor: 20000, overdueMinor: 0, paidThisMonthMinor: 0 },
      },
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({ months: 6, revenue: { ETB: [], USD: [] } });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({ activity: [] });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('Outstanding (USD)')).toBeInTheDocument();
      expect(screen.queryByText('Outstanding (ETB)')).not.toBeInTheDocument();
    });
  });

  it('renders default currency card with zero balance on new account', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
        USD: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
      },
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({ months: 6, revenue: { ETB: [], USD: [] } });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({ activity: [] });

    renderDashboard();

    await waitFor(() => {
      // Default currency (ETB) card is rendered with 0 balance
      expect(screen.getByText('Outstanding (ETB)')).toBeInTheDocument();
      expect(screen.getAllByText('ETB 0.00').length).toBeGreaterThan(0);
      // Unused USD card is not rendered
      expect(screen.queryByText('Outstanding (USD)')).not.toBeInTheDocument();
    });
  });

  it('renders historical currency card when backend currenciesInUse includes it even with zero current balances', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 50000, overdueMinor: 0, paidThisMonthMinor: 0 },
        USD: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
      },
      currenciesInUse: ['ETB', 'USD'],
      hasInvoices: true,
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({ months: 6, revenue: { ETB: [], USD: [] } });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({ activity: [] });

    renderDashboard();

    await waitFor(() => {
      // Both ETB and USD cards are rendered because USD was used historically
      expect(screen.getByText('Outstanding (ETB)')).toBeInTheDocument();
      expect(screen.getByText('Outstanding (USD)')).toBeInTheDocument();
      // Onboarding banner is hidden because hasInvoices is true
      expect(screen.queryByText(/Create your first invoice/i)).not.toBeInTheDocument();
    });
  });

  it('does not display onboarding banner when account has existing invoices', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 100000, overdueMinor: 0, paidThisMonthMinor: 0 },
        USD: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
      },
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({ months: 6, revenue: { ETB: [], USD: [] } });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({
      activity: [
        {
          invoiceId: 'inv-1',
          displayNumber: 'ALG-0001',
          clientName: 'Nile Corp',
          currency: 'ETB',
          totalMinor: 100000,
          eventType: 'sent',
          timestamp: new Date().toISOString(),
        },
      ],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('ALG-0001')).toBeInTheDocument();
      expect(screen.queryByText(/Create your first invoice/i)).not.toBeInTheDocument();
    });
  });

  it('displays inline retry alert when dashboard queries fail', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockRejectedValue(new Error('Network error'));
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({ months: 6, revenue: { ETB: [], USD: [] } });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({ activity: [] });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
    });
  });

  it('allows switching revenue chart between ETB and USD', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 100000, overdueMinor: 0, paidThisMonthMinor: 0 },
        USD: { outstandingMinor: 50000, overdueMinor: 0, paidThisMonthMinor: 0 },
      },
    });
    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({
      months: 6,
      revenue: {
        ETB: [{ month: '2026-10', revenueMinor: 250000 }],
        USD: [{ month: '2026-10', revenueMinor: 80000 }],
      },
    });
    vi.spyOn(api, 'fetchDashboardAnalytics').mockResolvedValue({
      period: '6m',
      interval: 'month',
      timezone: 'Africa/Addis_Ababa',
      series: {
        ETB: [{ key: '2026-10', label: 'Oct 2026', paidMinor: 250000, paidCount: 1, invoicedMinor: 300000, invoicedCount: 2 }],
        USD: [{ key: '2026-10', label: 'Oct 2026', paidMinor: 80000, paidCount: 1, invoicedMinor: 100000, invoicedCount: 1 }],
      },
      totals: {
        ETB: { totalPaidMinor: 250000, totalPaidCount: 1, totalInvoicedMinor: 300000, totalInvoicedCount: 2, collectionRatePercent: 83.3 },
        USD: { totalPaidMinor: 80000, totalPaidCount: 1, totalInvoicedMinor: 100000, totalInvoicedCount: 1, collectionRatePercent: 80 },
      },
    });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({ activity: [] });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText(/Revenue Trend/i)).toBeInTheDocument();
      expect(screen.getByText(/Invoiced vs Collected/i)).toBeInTheDocument();
    });

    const usdTab = screen.getByRole('tab', { name: 'USD' });
    fireEvent.click(usdTab);

    expect(usdTab).toHaveAttribute('aria-selected', 'true');
  });

  it('renders dual analytics charts and responds to shared timeline selector changes', async () => {
    vi.spyOn(api, 'fetchDashboardSummary').mockResolvedValue({
      summary: {
        ETB: { outstandingMinor: 150000, overdueMinor: 0, paidThisMonthMinor: 50000 },
        USD: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
      },
      currenciesInUse: ['ETB', 'USD'],
    });

    const analyticsSpy = vi.spyOn(api, 'fetchDashboardAnalytics').mockImplementation(async (period) => {
      return {
        period: period || '6m',
        interval: period === '7d' || period === '30d' ? 'day' : 'month',
        timezone: 'Africa/Addis_Ababa',
        series: {
          ETB: [
            { key: 'p1', label: 'Period 1', paidMinor: 50000, paidCount: 1, invoicedMinor: 100000, invoicedCount: 1 },
          ],
          USD: [],
        },
        totals: {
          ETB: { totalPaidMinor: 50000, totalPaidCount: 1, totalInvoicedMinor: 100000, totalInvoicedCount: 1, collectionRatePercent: 50 },
          USD: { totalPaidMinor: 0, totalPaidCount: 0, totalInvoicedMinor: 0, totalInvoicedCount: 0, collectionRatePercent: 0 },
        },
      };
    });

    vi.spyOn(api, 'fetchDashboardRevenue').mockResolvedValue({ months: 6, revenue: { ETB: [], USD: [] } });
    vi.spyOn(api, 'fetchDashboardActivity').mockResolvedValue({ activity: [] });

    renderDashboard();

    // Verify both charts render
    await waitFor(() => {
      expect(screen.getByText('Revenue Trend')).toBeInTheDocument();
      expect(screen.getByText('Invoiced vs Collected')).toBeInTheDocument();
    });

    // Check all timeline buttons are present
    const t7d = screen.getByRole('button', { name: '7D' });
    const t30d = screen.getByRole('button', { name: '30D' });
    const t3m = screen.getByRole('button', { name: '3M' });
    const t6m = screen.getByRole('button', { name: '6M' });
    const t12m = screen.getByRole('button', { name: '12M' });
    const tAll = screen.getByRole('button', { name: 'All time' });

    expect(t7d).toBeInTheDocument();
    expect(t30d).toBeInTheDocument();
    expect(t3m).toBeInTheDocument();
    expect(t6m).toBeInTheDocument();
    expect(t12m).toBeInTheDocument();
    expect(tAll).toBeInTheDocument();

    // Default selected is 6M
    expect(t6m).toHaveAttribute('aria-pressed', 'true');

    // Click 30D button
    fireEvent.click(t30d);

    await waitFor(() => {
      expect(analyticsSpy).toHaveBeenCalledWith('30d');
      expect(t30d).toHaveAttribute('aria-pressed', 'true');
    });

    // Click 7D button
    fireEvent.click(t7d);

    await waitFor(() => {
      expect(analyticsSpy).toHaveBeenCalledWith('7d');
      expect(t7d).toHaveAttribute('aria-pressed', 'true');
    });
  });
});
