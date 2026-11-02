import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoiceEditorPage } from './InvoiceEditorPage';
import { ThemeProvider } from '../../context/ThemeContext';
import * as AuthContextModule from '../../context/AuthContext';
import * as api from '../../lib/api';

describe('Prompt 15: Invoice Editor (/app/invoices/new, /app/invoices/:id/edit)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

    vi.spyOn(AuthContextModule, 'useAuth').mockReturnValue({
      user: { id: 'u1', name: 'Test User', email: 'user@example.com' },
      business: {
        id: 'b1',
        name: 'Test Business PLC',
        defaultCurrency: 'USD',
        invoicePrefix: 'INV',
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

    vi.spyOn(api, 'fetchClients').mockResolvedValue({
      clients: [
        {
          id: 'c1',
          businessId: 'b1',
          name: 'Acme Corporation',
          email: 'acme@example.com',
          phone: null,
          address: null,
          archivedAt: null,
          createdAt: new Date().toISOString(),
        },
      ],
      pagination: { page: 1, limit: 100, total: 1, totalPages: 1 },
    });
  });

  const renderNewInvoice = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={['/app/invoices/new']}>
            <Routes>
              <Route path="/app/invoices/new" element={<InvoiceEditorPage />} />
              <Route path="/app/invoices" element={<div>Invoices List Page</div>} />
              <Route path="/app/invoices/:id" element={<div>Invoice Detail Page</div>} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };

  const renderEditInvoice = (invoiceId: string) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={[`/app/invoices/${invoiceId}/edit`]}>
            <Routes>
              <Route path="/app/invoices/:id/edit" element={<InvoiceEditorPage />} />
              <Route path="/app/invoices/:id" element={<div>Invoice Detail Page</div>} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };

  it('renders invoice editor with default single line item and calculates live totals', async () => {
    renderNewInvoice();

    await waitFor(() => {
      expect(screen.getByText('New Invoice')).toBeInTheDocument();
      expect(screen.getByLabelText(/client/i)).toBeInTheDocument();
      expect(screen.getByLabelText(/currency/i)).toBeInTheDocument();
    });

    // Enter unit price for the default line item
    const descInput = screen.getByPlaceholderText(/item description/i);
    const priceInput = screen.getByPlaceholderText('Price');

    fireEvent.change(descInput, { target: { value: 'Frontend Development' } });
    fireEvent.change(priceInput, { target: { value: '150.00' } });

    // Live preview subtotal: 1 * 150 = 150.00 -> USD 150.00
    await waitFor(() => {
      expect(screen.getAllByText('USD 150.00').length).toBeGreaterThan(0);
    });

    // Change tax rate to 15%
    const taxInput = screen.getByLabelText(/tax rate/i);
    fireEvent.change(taxInput, { target: { value: '15' } });

    // Tax = 22.50, Total = 172.50
    await waitFor(() => {
      expect(screen.getByText('USD 22.50')).toBeInTheDocument();
      expect(screen.getByText('USD 172.50')).toBeInTheDocument();
    });
  });

  it('adds and removes dynamic line items', async () => {
    renderNewInvoice();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add line item/i })).toBeInTheDocument();
    });

    const addLineBtn = screen.getByRole('button', { name: /add line item/i });
    fireEvent.click(addLineBtn);

    const descInputs = screen.getAllByPlaceholderText(/item description/i);
    expect(descInputs.length).toBe(2);

    // Remove the second line item
    const removeButtons = screen.getAllByTitle(/remove item/i);
    expect(removeButtons.length).toBe(2);
    fireEvent.click(removeButtons[1]);

    expect(screen.getAllByPlaceholderText(/item description/i).length).toBe(1);
  });

  it('validates client selection, item details, and due date >= issue date', async () => {
    renderNewInvoice();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save as draft/i })).toBeInTheDocument();
    });

    // Try saving without selecting client
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(() => {
      expect(screen.getByText('Please select a client for this invoice')).toBeInTheDocument();
    });

    // Select client
    const clientSelect = screen.getByLabelText(/client/i);
    fireEvent.change(clientSelect, { target: { value: 'c1' } });

    // Set invalid due date earlier than issue date
    const issueDateInput = screen.getByLabelText(/issue date/i);
    const dueDateInput = screen.getByLabelText(/due date/i);

    fireEvent.change(issueDateInput, { target: { value: '2026-03-20' } });
    fireEvent.change(dueDateInput, { target: { value: '2026-03-10' } });

    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(() => {
      expect(screen.getByText('Due date must be on or after issue date')).toBeInTheDocument();
    });
  });

  it('opens inline Add Client modal and auto-selects newly created client', async () => {
    const createClientSpy = vi.spyOn(api, 'createClient').mockResolvedValue({
      client: {
        id: 'c-new',
        businessId: 'b1',
        name: 'Ethio Telecom HQ',
        email: 'billing@ethiotelecom.et',
        phone: '+251 11 550 0000',
        address: 'Churchill Road, Addis Ababa',
        archivedAt: null,
        createdAt: new Date().toISOString(),
      },
    });

    renderNewInvoice();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add new client/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /add new client/i }));

    expect(screen.getByText('Add New Client')).toBeInTheDocument();

    const nameInput = screen.getByLabelText(/client name/i);
    fireEvent.change(nameInput, { target: { value: 'Ethio Telecom HQ' } });

    const emailInput = screen.getByLabelText(/email address/i);
    fireEvent.change(emailInput, { target: { value: 'billing@ethiotelecom.et' } });

    const submitBtn = screen.getByRole('button', { name: /create and select client/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(createClientSpy).toHaveBeenCalledWith(expect.objectContaining({
        name: 'Ethio Telecom HQ',
        email: 'billing@ethiotelecom.et',
      }));
      // Dialog closed
      expect(screen.queryByText('Add New Client')).not.toBeInTheDocument();
    });
  });

  it('submits valid draft invoice with minor units and redirects', async () => {
    const createSpy = vi.spyOn(api, 'createInvoice').mockResolvedValue({
      invoice: {
        id: 'new-inv-123',
        businessId: 'b1',
        clientId: 'c1',
        clientName: 'Acme Corporation',
        clientEmail: 'acme@example.com',
        number: null,
        displayNumber: null,
        issueDate: '2026-03-01',
        dueDate: '2026-03-15',
        currency: 'USD',
        subtotalMinor: 25000,
        taxRateBps: 1000,
        taxMinor: 2500,
        totalMinor: 27500,
        status: 'draft',
        notes: 'Payment terms: Net 15',
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
    });

    renderNewInvoice();

    await waitFor(() => {
      expect(screen.getByText(/Acme Corporation/i)).toBeInTheDocument();
    });

    // Select client
    fireEvent.change(screen.getByLabelText(/client/i), { target: { value: 'c1' } });

    // Set line item
    const descInput = screen.getByPlaceholderText(/item description/i);
    const priceInput = screen.getByPlaceholderText('Price');
    fireEvent.change(descInput, { target: { value: 'Cloud Architecture' } });
    fireEvent.change(priceInput, { target: { value: '250.00' } });

    // Set dates
    fireEvent.change(screen.getByLabelText(/issue date/i), { target: { value: '2026-03-01' } });
    fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-03-15' } });

    // Set notes
    const notesInput = screen.getByPlaceholderText(/bank transfer to cbe/i);
    fireEvent.change(notesInput, { target: { value: 'Payment terms: Net 15' } });

    // Click Save as draft
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }));

    await waitFor(() => {
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
        clientId: 'c1',
        currency: 'USD',
        issueDate: '2026-03-01',
        dueDate: '2026-03-15',
        notes: 'Payment terms: Net 15',
        items: [
          expect.objectContaining({
            description: 'Cloud Architecture',
            unitPrice: '250.00',
          }),
        ],
      }));
    });
  });

  it('enforces draft-only editing guard when navigating to edit a sent invoice', async () => {
    vi.spyOn(api, 'fetchInvoice').mockResolvedValue({
      invoice: {
        id: 'sent-inv-1',
        businessId: 'b1',
        clientId: 'c1',
        clientName: 'Acme Corporation',
        clientEmail: 'acme@example.com',
        number: 5,
        displayNumber: 'INV-2026-0005',
        issueDate: '2026-01-01',
        dueDate: '2026-01-15',
        currency: 'USD',
        subtotalMinor: 50000,
        taxRateBps: 0,
        taxMinor: 0,
        totalMinor: 50000,
        status: 'sent', // IMMUTABLE
        notes: null,
        publicToken: 'tok_sent',
        publicUrl: 'http://localhost/pay/tok_sent',
        sentAt: '2026-01-01T10:00:00Z',
        paidAt: null,
        voidedAt: null,
        isOverdue: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [
          {
            id: 'item-1',
            invoiceId: 'sent-inv-1',
            position: 1,
            description: 'Consulting',
            quantityMilli: 1000,
            unitPriceMinor: 50000,
            lineTotalMinor: 50000,
          },
        ],
        payments: [],
      },
    });

    renderEditInvoice('sent-inv-1');

    await waitFor(() => {
      expect(screen.getByText('Invoice cannot be edited')).toBeInTheDocument();
      expect(screen.getByText(/Only draft invoices can be edited/i)).toBeInTheDocument();
    });

    // Form buttons to save or submit should be hidden
    expect(screen.queryByRole('button', { name: /save changes/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save as draft/i })).not.toBeInTheDocument();
  });

  it('preserves form inputs and shows error banner when server rejects draft update', async () => {
    vi.spyOn(api, 'fetchInvoice').mockResolvedValue({
      invoice: {
        id: 'draft-inv-1',
        businessId: 'b1',
        clientId: 'c1',
        clientName: 'Acme Corporation',
        clientEmail: 'acme@example.com',
        number: null,
        displayNumber: null,
        issueDate: '2026-03-01',
        dueDate: '2026-03-15',
        currency: 'USD',
        subtotalMinor: 10000,
        taxRateBps: 0,
        taxMinor: 0,
        totalMinor: 10000,
        status: 'draft',
        notes: 'Initial notes',
        publicToken: '',
        publicUrl: '',
        sentAt: null,
        paidAt: null,
        voidedAt: null,
        isOverdue: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        items: [
          {
            id: 'item-1',
            invoiceId: 'draft-inv-1',
            position: 1,
            description: 'Web development',
            quantityMilli: 1000,
            unitPriceMinor: 10000,
            lineTotalMinor: 10000,
          },
        ],
        payments: [],
      },
    });

    vi.spyOn(api, 'updateInvoice').mockRejectedValue(
      new api.ApiException(500, { code: 'DATABASE_ERROR', message: 'Database lock error' })
    );

    renderEditInvoice('draft-inv-1');

    await waitFor(() => {
      expect(screen.getByText(/Edit Draft Invoice/i)).toBeInTheDocument();
      expect(screen.getByDisplayValue('Web development')).toBeInTheDocument();
    });

    // Update description
    const descInput = screen.getByDisplayValue('Web development');
    fireEvent.change(descInput, { target: { value: 'Web development & QA' } });

    // Submit
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Database lock error')).toBeInTheDocument();
      // Form input preserved
      expect(screen.getByDisplayValue('Web development & QA')).toBeInTheDocument();
    });
  });
});
