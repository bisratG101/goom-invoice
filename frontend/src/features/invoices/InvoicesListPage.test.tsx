import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoicesListPage } from './InvoicesListPage';
import { ThemeProvider } from '../../context/ThemeContext';
import * as api from '../../lib/api';

describe('Prompt 15: Invoice List (/app/invoices)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  const renderInvoicesList = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/app/invoices']}>
            <InvoicesListPage />
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };

  it('renders invoice list with formatted numbers, amounts, clients, and status chips', async () => {
    vi.spyOn(api, 'fetchInvoices').mockResolvedValue({
      invoices: [
        {
          id: 'inv-1',
          businessId: 'biz-1',
          clientId: 'client-1',
          clientName: 'Acme Corp',
          clientEmail: 'billing@acme.com',
          number: 1,
          displayNumber: 'INV-2026-0001',
          issueDate: '2026-01-15',
          dueDate: '2026-02-15',
          currency: 'USD',
          subtotalMinor: 10000,
          taxRateBps: 1500,
          taxMinor: 1500,
          totalMinor: 11500,
          status: 'sent',
          notes: 'Thanks for your business',
          publicToken: 'tok_abc123',
          publicUrl: 'http://localhost/pay/tok_abc123',
          sentAt: '2026-01-15T10:00:00Z',
          paidAt: null,
          voidedAt: null,
          isOverdue: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          items: [],
          payments: [],
        },
        {
          id: 'inv-2',
          businessId: 'biz-1',
          clientId: 'client-2',
          clientName: 'Bole Digital Ltd',
          clientEmail: 'finance@boledigital.et',
          number: null,
          displayNumber: null,
          issueDate: '2026-02-01',
          dueDate: '2026-02-10',
          currency: 'ETB',
          subtotalMinor: 500000,
          taxRateBps: 0,
          taxMinor: 0,
          totalMinor: 500000,
          status: 'draft',
          notes: null,
          publicToken: '',
          publicUrl: '',
          sentAt: null,
          paidAt: null,
          voidedAt: null,
          isOverdue: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          items: [],
          payments: [],
        },
      ],
      pagination: { page: 1, limit: 20, total: 2, totalPages: 1 },
    });

    renderInvoicesList();

    await waitFor(() => {
      // Numbers or fallback
      expect(screen.getAllByText('INV-2026-0001').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);

      // Clients
      expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Bole Digital Ltd').length).toBeGreaterThan(0);

      // Money amounts
      expect(screen.getAllByText('USD 115.00').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ETB 5,000.00').length).toBeGreaterThan(0);

      // Status chips
      expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
    });
  });

  it('renders overdue badge when server marks invoice as isOverdue', async () => {
    vi.spyOn(api, 'fetchInvoices').mockResolvedValue({
      invoices: [
        {
          id: 'inv-overdue',
          businessId: 'biz-1',
          clientId: 'client-1',
          clientName: 'Overdue Client',
          clientEmail: 'late@client.com',
          number: 99,
          displayNumber: 'INV-2026-0099',
          issueDate: '2026-01-01',
          dueDate: '2026-01-10',
          currency: 'USD',
          subtotalMinor: 5000,
          taxRateBps: 0,
          taxMinor: 0,
          totalMinor: 5000,
          status: 'sent',
          notes: null,
          publicToken: 'tok_late',
          publicUrl: 'http://localhost/pay/tok_late',
          sentAt: '2026-01-01T10:00:00Z',
          paidAt: null,
          voidedAt: null,
          isOverdue: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          items: [],
          payments: [],
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1 },
    });

    renderInvoicesList();

    await waitFor(() => {
      expect(screen.getAllByText('Overdue').length).toBeGreaterThan(0);
    });
  });

  it('filters invoices when selecting status tabs', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchInvoices').mockResolvedValue({
      invoices: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    renderInvoicesList();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ status: undefined, page: 1 }));
    });

    // Click Paid tab
    const paidTab = screen.getByRole('tab', { name: 'Paid' });
    fireEvent.click(paidTab);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid', page: 1 }));
    });

    // Click Overdue tab
    const overdueTab = screen.getByRole('tab', { name: 'Overdue' });
    fireEvent.click(overdueTab);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ status: 'overdue', page: 1 }));
    });
  });

  it('filters invoices with search input and debounces requests', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchInvoices').mockResolvedValue({
      invoices: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    renderInvoicesList();

    const searchInput = screen.getByPlaceholderText(/search by client or invoice #/i);
    fireEvent.change(searchInput, { target: { value: 'Acme' } });

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ search: 'Acme', page: 1 }));
    });
  });

  it('renders empty state when no invoices exist', async () => {
    vi.spyOn(api, 'fetchInvoices').mockResolvedValue({
      invoices: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    renderInvoicesList();

    await waitFor(() => {
      expect(screen.getByText('No invoices created yet')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /create invoice/i })).toBeInTheDocument();
    });
  });

  it('renders filtered empty state when search finds no matches', async () => {
    vi.spyOn(api, 'fetchInvoices').mockResolvedValue({
      invoices: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    renderInvoicesList();

    const searchInput = screen.getByPlaceholderText(/search by client or invoice #/i);
    fireEvent.change(searchInput, { target: { value: 'NonexistentClient' } });

    await waitFor(() => {
      expect(screen.getByText('No invoices matching "NonexistentClient"')).toBeInTheDocument();
    });
  });

  it('renders error state with retry button on API failure', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchInvoices').mockRejectedValue(new Error('Network disconnected'));

    renderInvoicesList();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load invoices/i)).toBeInTheDocument();
    });

    const retryBtn = screen.getByRole('button', { name: /retry/i });
    expect(retryBtn).toBeInTheDocument();

    fetchSpy.mockResolvedValueOnce({
      invoices: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
    });

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(2);
    });
  });

  it('handles pagination navigation', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchInvoices').mockImplementation(async (params) => {
      const page = params?.page ?? 1;
      return {
        invoices: [
          {
            id: `inv-${page}`,
            businessId: 'biz-1',
            clientId: 'client-1',
            clientName: `Client Page ${page}`,
            clientEmail: 'test@page.com',
            number: page,
            displayNumber: `INV-2026-000${page}`,
            issueDate: '2026-01-01',
            dueDate: '2026-01-15',
            currency: 'USD',
            subtotalMinor: 1000,
            taxRateBps: 0,
            taxMinor: 0,
            totalMinor: 1000,
            status: 'sent',
            notes: null,
            publicToken: `tok_${page}`,
            publicUrl: `http://localhost/pay/tok_${page}`,
            sentAt: '2026-01-01T10:00:00Z',
            paidAt: null,
            voidedAt: null,
            isOverdue: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            items: [],
            payments: [],
          },
        ],
        pagination: { page, limit: 20, total: 40, totalPages: 2 },
      };
    });

    renderInvoicesList();

    await waitFor(() => {
      expect(screen.getAllByText('Client Page 1').length).toBeGreaterThan(0);
      expect(screen.getByText(/showing page/i)).toBeInTheDocument();
    });

    const nextBtn = screen.getByRole('button', { name: /next page/i });
    expect(nextBtn).not.toBeDisabled();

    fireEvent.click(nextBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
      expect(screen.getAllByText('Client Page 2').length).toBeGreaterThan(0);
    });
  });
});
