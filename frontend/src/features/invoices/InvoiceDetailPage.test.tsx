import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InvoiceDetailPage } from './InvoiceDetailPage';
import { ThemeProvider } from '../../context/ThemeContext';
import * as api from '../../lib/api';
import * as urls from '../../lib/urls';

describe('Prompt 15: Invoice Detail Page (/app/invoices/:id)', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });
  });

  const renderInvoiceDetail = (invoiceId: string) => {
    return render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <MemoryRouter initialEntries={[`/app/invoices/${invoiceId}`]}>
            <Routes>
              <Route path="/app/invoices/:id" element={<InvoiceDetailPage />} />
              <Route path="/app/invoices" element={<div>Invoices List Page</div>} />
              <Route path="/app/invoices/:id/edit" element={<div>Edit Invoice Page</div>} />
            </Routes>
          </MemoryRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
  };

  const sampleDraftInvoice: api.InvoiceResponse = {
    invoice: {
      id: 'inv-draft-1',
      businessId: 'biz-1',
      clientId: 'c1',
      clientName: 'Bole Technologies',
      clientEmail: 'billing@boletech.et',
      number: null,
      displayNumber: null,
      issueDate: '2026-03-01',
      dueDate: '2026-03-15',
      currency: 'ETB',
      subtotalMinor: 100000,
      taxRateBps: 1500,
      taxMinor: 15000,
      totalMinor: 115000,
      status: 'draft',
      notes: 'Please transfer to CBE account 100012345678.',
      publicToken: '',
      publicUrl: '',
      sentAt: null,
      paidAt: null,
      voidedAt: null,
      isOverdue: false,
      createdAt: '2026-03-01T08:00:00.000Z',
      updatedAt: '2026-03-01T08:00:00.000Z',
      items: [
        {
          id: 'item-1',
          invoiceId: 'inv-draft-1',
          position: 1,
          description: 'Server Migration & Setup',
          quantityMilli: 1000,
          unitPriceMinor: 100000,
          lineTotalMinor: 100000,
        },
      ],
      payments: [],
    },
  };

  const sampleSentInvoice: api.InvoiceResponse = {
    invoice: {
      id: 'inv-sent-1',
      businessId: 'biz-1',
      clientId: 'c1',
      clientName: 'Bole Technologies',
      clientEmail: 'billing@boletech.et',
      number: 42,
      displayNumber: 'INV-2026-0042',
      issueDate: '2026-03-01',
      dueDate: '2026-03-15',
      currency: 'ETB',
      subtotalMinor: 100000,
      taxRateBps: 1500,
      taxMinor: 15000,
      totalMinor: 115000,
      status: 'sent',
      notes: null,
      publicToken: 'tok_sent42',
      publicUrl: 'http://localhost:5173/pay/tok_sent42',
      sentAt: '2026-03-01T08:30:00.000Z',
      paidAt: null,
      voidedAt: null,
      isOverdue: false,
      createdAt: '2026-03-01T08:00:00.000Z',
      updatedAt: '2026-03-01T09:00:00.000Z',
      items: [
        {
          id: 'item-1',
          invoiceId: 'inv-sent-1',
          position: 1,
          description: 'Server Migration & Setup',
          quantityMilli: 1000,
          unitPriceMinor: 100000,
          lineTotalMinor: 100000,
        },
      ],
      payments: [],
    },
  };

  const samplePaidInvoice: api.InvoiceResponse = {
    invoice: {
      id: 'inv-paid-1',
      businessId: 'biz-1',
      clientId: 'c1',
      clientName: 'Bole Technologies',
      clientEmail: 'billing@boletech.et',
      number: 30,
      displayNumber: 'INV-2026-0030',
      issueDate: '2026-02-01',
      dueDate: '2026-02-15',
      currency: 'USD',
      subtotalMinor: 50000,
      taxRateBps: 0,
      taxMinor: 0,
      totalMinor: 50000,
      status: 'paid',
      notes: null,
      publicToken: 'tok_paid30',
      publicUrl: 'http://localhost:5173/pay/tok_paid30',
      sentAt: '2026-02-01T08:30:00.000Z',
      paidAt: '2026-02-05T10:00:00.000Z',
      voidedAt: null,
      isOverdue: false,
      createdAt: '2026-02-01T08:00:00.000Z',
      updatedAt: '2026-02-05T10:00:00.000Z',
      items: [
        {
          id: 'item-1',
          invoiceId: 'inv-paid-1',
          position: 1,
          description: 'Full-Stack Development',
          quantityMilli: 1000,
          unitPriceMinor: 50000,
          lineTotalMinor: 50000,
        },
      ],
      payments: [
        {
          id: 'pay-1',
          businessId: 'biz-1',
          invoiceId: 'inv-paid-1',
          amountMinor: 50000,
          currency: 'USD',
          provider: 'simulated',
          txRef: 'TXN-987654',
          status: 'succeeded',
          failureReason: null,
          createdAt: '2026-02-05T10:00:00.000Z',
          confirmedAt: '2026-02-05T10:00:00.000Z',
        },
      ],
    },
  };

  it('renders draft invoice with Edit, Send, and Delete Draft actions', async () => {
    vi.spyOn(api, 'fetchInvoice').mockResolvedValue(sampleDraftInvoice);

    renderInvoiceDetail('inv-draft-1');

    await waitFor(() => {
      expect(screen.getAllByText('Draft Invoice').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Bole Technologies').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Server Migration & Setup').length).toBeGreaterThan(0);
      expect(screen.getAllByText('ETB 1,150.00').length).toBeGreaterThan(0);
    });

    // Draft permitted actions
    expect(screen.getByRole('button', { name: /send invoice/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /edit draft/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();

    // Sent actions should not be visible
    expect(screen.queryByRole('button', { name: /void invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Public Payment Link/i)).not.toBeInTheDocument();
  });

  it('renders sent invoice with Download PDF, Copy Link, Share intents, and Void action', async () => {
    vi.spyOn(api, 'fetchInvoice').mockResolvedValue(sampleSentInvoice);

    renderInvoiceDetail('inv-sent-1');

    await waitFor(() => {
      expect(screen.getAllByText('INV-2026-0042').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Sent').length).toBeGreaterThan(0);
    });

    // Permitted actions
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /void invoice/i })).toBeInTheDocument();
    expect(screen.getByText('Public Payment Link')).toBeInTheDocument();
    expect(screen.getByDisplayValue('http://localhost:5173/pay/tok_sent42')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();
    expect(screen.getByTitle('Share via WhatsApp')).toBeInTheDocument();
    expect(screen.getByTitle('Share via Telegram')).toBeInTheDocument();

    // Draft actions must not be visible
    expect(screen.queryByRole('link', { name: /edit invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /delete draft/i })).not.toBeInTheDocument();
  });

  it('renders paid invoice with Paid banner, payments history, and disables mutating actions', async () => {
    vi.spyOn(api, 'fetchInvoice').mockResolvedValue(samplePaidInvoice);

    renderInvoiceDetail('inv-paid-1');

    await waitFor(() => {
      expect(screen.getByText(/Payment confirmed/i)).toBeInTheDocument();
      expect(screen.getByText('Payment Records')).toBeInTheDocument();
      expect(screen.getByText('simulated')).toBeInTheDocument();
      expect(screen.getByText('TXN-987654')).toBeInTheDocument();
    });

    // Download PDF is available
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();

    // Void and Edit should NOT be available
    expect(screen.queryByRole('button', { name: /void invoice/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /edit invoice/i })).not.toBeInTheDocument();
  });

  it('handles Send Invoice confirmation dialog flow', async () => {
    vi.spyOn(api, 'fetchInvoice').mockResolvedValue(sampleDraftInvoice);
    const sendSpy = vi.spyOn(api, 'sendInvoice').mockResolvedValue({
      invoice: {
        ...sampleDraftInvoice.invoice,
        status: 'sent',
        displayNumber: 'INV-2026-0001',
      },
    });

    renderInvoiceDetail('inv-draft-1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /send invoice/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /send invoice/i }));

    // Confirmation dialog open
    expect(screen.getByText('Send Invoice to Client')).toBeInTheDocument();
    expect(screen.getByText(/Once sent, the sequential invoice number will be permanently assigned/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Confirm & Send' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(sendSpy).toHaveBeenCalledWith('inv-draft-1');
    });
  });

  it('handles Void Invoice confirmation dialog flow', async () => {
    vi.spyOn(api, 'fetchInvoice').mockResolvedValue(sampleSentInvoice);
    const voidSpy = vi.spyOn(api, 'voidInvoice').mockResolvedValue({
      invoice: {
        ...sampleSentInvoice.invoice,
        status: 'void',
      },
    });

    renderInvoiceDetail('inv-sent-1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /void invoice/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /void invoice/i }));

    expect(screen.getByText('Void Invoice')).toBeInTheDocument();
    expect(screen.getByText(/Are you sure you want to void this sent invoice/i)).toBeInTheDocument();

    const confirmBtn = screen.getByRole('button', { name: 'Yes, void invoice' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(voidSpy).toHaveBeenCalledWith('inv-sent-1');
    });
  });

  it('triggers PDF download when clicking Download PDF button', async () => {
    vi.spyOn(api, 'fetchInvoice').mockResolvedValue(sampleSentInvoice);
    const pdfSpy = vi.spyOn(api, 'downloadInvoicePdf').mockResolvedValue(undefined);

    renderInvoiceDetail('inv-sent-1');

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /download pdf/i }));

    await waitFor(() => {
      expect(pdfSpy).toHaveBeenCalledWith('inv-sent-1', 'INV-2026-0042.pdf');
    });
  });

  describe('Canonical Public Invoice URL Generation (Production vs Development)', () => {
    it('proves production generates goom-invoice.vercel.app URLs for input, preview, copy, WhatsApp, and Telegram', async () => {
      vi.spyOn(urls, 'getPublicInvoiceUrl').mockImplementation(
        (token) => `https://goom-invoice.vercel.app/i/${token}`
      );
      vi.spyOn(api, 'fetchInvoice').mockResolvedValue(sampleSentInvoice);

      renderInvoiceDetail('inv-sent-1');

      await waitFor(() => {
        expect(screen.getByText('Public Payment Link')).toBeInTheDocument();
      });

      const expectedProdUrl = 'https://goom-invoice.vercel.app/i/tok_sent42';

      // 1. Text input displays canonical production URL
      const inputEl = screen.getByDisplayValue(expectedProdUrl) as HTMLInputElement;
      expect(inputEl).toBeInTheDocument();
      expect(inputEl.value).toBe(expectedProdUrl);
      expect(inputEl.value).not.toContain('localhost');

      // 2. Preview payer view link points to canonical production URL
      const previewLink = screen.getByRole('link', { name: /preview payer view/i });
      expect(previewLink).toHaveAttribute('href', expectedProdUrl);
      expect(previewLink.getAttribute('href')).not.toContain('localhost');

      // 3. WhatsApp share intent uses canonical production URL
      const whatsappLink = screen.getByTitle('Share via WhatsApp');
      const whatsappHref = whatsappLink.getAttribute('href') || '';
      expect(whatsappHref).toContain(encodeURIComponent(expectedProdUrl));
      expect(whatsappHref).toContain('wa.me');
      expect(whatsappHref).not.toContain('localhost');

      // 4. Telegram share intent uses canonical production URL
      const telegramLink = screen.getByTitle('Share via Telegram');
      const telegramHref = telegramLink.getAttribute('href') || '';
      expect(telegramHref).toContain(encodeURIComponent(expectedProdUrl));
      expect(telegramHref).toContain('t.me');
      expect(telegramHref).not.toContain('localhost');
    });

    it('proves local development generates and preserves localhost URLs', async () => {
      vi.spyOn(urls, 'getPublicInvoiceUrl').mockImplementation(
        (token, backendUrl) => backendUrl || `http://localhost:5173/i/${token}`
      );
      vi.spyOn(api, 'fetchInvoice').mockResolvedValue(sampleSentInvoice);

      renderInvoiceDetail('inv-sent-1');

      await waitFor(() => {
        expect(screen.getByText('Public Payment Link')).toBeInTheDocument();
      });

      const expectedDevUrl = 'http://localhost:5173/pay/tok_sent42';

      // Input, WhatsApp and Telegram use localhost in dev
      expect(screen.getByDisplayValue(expectedDevUrl)).toBeInTheDocument();
      const whatsappLink = screen.getByTitle('Share via WhatsApp');
      expect(whatsappLink.getAttribute('href')).toContain('localhost');
      const telegramLink = screen.getByTitle('Share via Telegram');
      expect(telegramLink.getAttribute('href')).toContain('localhost');
    });
  });
});
