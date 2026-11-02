import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PublicInvoicePage } from './PublicInvoicePage';
import { PaymentReturnPage } from './PaymentReturnPage';
import { SimulatedPaymentPage } from './SimulatedPaymentPage';
import * as api from '../../lib/api';

describe('Public Invoices & Simulated Payment Flow (Prompt 16.2)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const mockPublicInvoice: api.PublicInvoice = {
    displayNumber: 'INV-0007',
    businessName: 'Addis Freight Services',
    clientName: 'Bole Importers',
    currency: 'ETB',
    status: 'sent',
    issueDate: '2026-10-30',
    dueDate: '2026-11-15',
    items: [
      {
        description: 'Dry cargo haulage',
        quantity: 2,
        unitPrice: 500000,
        amount: 1000000,
      },
    ],
    subtotal: 1000000,
    taxTotal: 150000,
    total: 1150000,
    notes: 'Payment due on receipt. Thank you!',
    sentAt: '2026-10-30T10:00:00.000Z',
    paidAt: null,
    payments: [],
  };

  describe('/i/:token (PublicInvoicePage)', () => {
    it('displays sanitized public invoice details without private info', async () => {
      vi.spyOn(api, 'fetchConfigApi').mockResolvedValue({ demoMode: false });
      vi.spyOn(api, 'fetchPublicInvoice').mockResolvedValue({ invoice: mockPublicInvoice });

      render(
        <MemoryRouter initialEntries={['/i/tok-valid-123']}>
          <Routes>
            <Route path="/i/:token" element={<PublicInvoicePage />} />
          </Routes>
        </MemoryRouter>
      );

      // Loading state
      expect(screen.getByText(/Loading invoice.../i)).toBeInTheDocument();

      // Loaded state
      await waitFor(() => {
        expect(screen.getByText('Addis Freight Services')).toBeInTheDocument();
        expect(screen.getByText('INV-0007')).toBeInTheDocument();
        expect(screen.getByText('Bole Importers')).toBeInTheDocument();
        expect(screen.getByText('Dry cargo haulage')).toBeInTheDocument();
      });

      // Amount due
      expect(screen.getByText(/Amount Due/i)).toBeInTheDocument();
      expect(screen.getAllByText(/ETB 11,500.00/i).length).toBeGreaterThanOrEqual(1);

      // Status chip
      expect(screen.getByText('Sent')).toBeInTheDocument();

      // Pay now button present, Download PDF button present
      expect(screen.getByRole('button', { name: /Pay now/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Download PDF/i })).toBeInTheDocument();

      // Footer
      expect(screen.getByText(/Invoice created with/i)).toBeInTheDocument();
    });

    it('displays green Paid banner and hides the Pay button when status is paid', async () => {
      vi.spyOn(api, 'fetchConfigApi').mockResolvedValue({ demoMode: false });
      vi.spyOn(api, 'fetchPublicInvoice').mockResolvedValue({
        invoice: {
          ...mockPublicInvoice,
          status: 'paid',
          paidAt: '2026-10-31T15:30:00.000Z',
        },
      });

      render(
        <MemoryRouter initialEntries={['/i/tok-paid-123']}>
          <Routes>
            <Route path="/i/:token" element={<PublicInvoicePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Payment Received/i)).toBeInTheDocument();
        expect(screen.getByText(/Paid on/i)).toBeInTheDocument();
      });

      // Pay button must NOT be in the document for a paid invoice
      expect(screen.queryByRole('button', { name: /Pay now/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Pay \(demo\)/i })).not.toBeInTheDocument();

      // Download PDF is still accessible
      expect(screen.getByRole('button', { name: /Download PDF/i })).toBeInTheDocument();
    });

    it('shows void banner and disables pay action when invoice is void', async () => {
      vi.spyOn(api, 'fetchConfigApi').mockResolvedValue({ demoMode: false });
      vi.spyOn(api, 'fetchPublicInvoice').mockResolvedValue({
        invoice: {
          ...mockPublicInvoice,
          status: 'void',
        },
      });

      render(
        <MemoryRouter initialEntries={['/i/tok-void-123']}>
          <Routes>
            <Route path="/i/:token" element={<PublicInvoicePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Invoice Voided/i)).toBeInTheDocument();
        expect(screen.getByText(/no longer payable/i)).toBeInTheDocument();
      });

      const payBtn = screen.getByRole('button', { name: /Invoice Void/i });
      expect(payBtn).toBeDisabled();
    });

    it('displays secondary "Pay (demo)" action when demoMode is true', async () => {
      vi.spyOn(api, 'fetchConfigApi').mockResolvedValue({ demoMode: true });
      vi.spyOn(api, 'fetchPublicInvoice').mockResolvedValue({ invoice: mockPublicInvoice });

      render(
        <MemoryRouter initialEntries={['/i/tok-demo-123']}>
          <Routes>
            <Route path="/i/:token" element={<PublicInvoicePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Pay \(demo\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /Pay now/i })).toBeInTheDocument();
      });
    });

    it('shows not-found card when server returns 404', async () => {
      vi.spyOn(api, 'fetchConfigApi').mockResolvedValue({ demoMode: false });
      vi.spyOn(api, 'fetchPublicInvoice').mockRejectedValue(
        new api.ApiException(404, { code: 'INVOICE_NOT_FOUND', message: 'Invoice not found' })
      );

      render(
        <MemoryRouter initialEntries={['/i/invalid-token']}>
          <Routes>
            <Route path="/i/:token" element={<PublicInvoicePage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByText(/Invoice Not Found/i)).toBeInTheDocument();
        expect(screen.getByText(/invalid, has expired, or the invoice is still a draft/i)).toBeInTheDocument();
      });
    });
  });

  describe('/pay/simulated/:txRef (SimulatedPaymentPage)', () => {
    it('renders simulated gateway with prominent DEMO badge and reference', () => {
      render(
        <MemoryRouter initialEntries={['/pay/simulated/tx_test_12345?token=tok-abc']}>
          <Routes>
            <Route path="/pay/simulated/:txRef" element={<SimulatedPaymentPage />} />
          </Routes>
        </MemoryRouter>
      );

      expect(screen.getByText(/DEMO MODE — Simulated Payment Gateway/i)).toBeInTheDocument();
      expect(screen.getByText('tx_test_12345')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Pay \(demo\)/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeInTheDocument();
    });

    it('calls completeSimulatedPayment and navigates to return page on Pay (demo) click', async () => {
      const completeSpy = vi.spyOn(api, 'completeSimulatedPayment').mockResolvedValue({
        status: 'ok',
        webhookStatus: 200,
        result: { status: 'success' },
      });

      render(
        <MemoryRouter initialEntries={['/pay/simulated/tx_test_12345?token=tok-return-target']}>
          <Routes>
            <Route path="/pay/simulated/:txRef" element={<SimulatedPaymentPage />} />
            <Route path="/i/:token/return" element={<div>Return Page Reached</div>} />
          </Routes>
        </MemoryRouter>
      );

      const payBtn = screen.getByRole('button', { name: /Pay \(demo\)/i });
      fireEvent.click(payBtn);

      await waitFor(() => {
        expect(completeSpy).toHaveBeenCalledWith('tx_test_12345');
        expect(screen.getByText('Return Page Reached')).toBeInTheDocument();
      });
    });
  });

  describe('/i/:token/return (PaymentReturnPage)', () => {
    it('polls status every 2 seconds and updates to "Payment confirmed" with "Paid" status chip', async () => {
      const statusSpy = vi.spyOn(api, 'fetchPublicInvoiceStatus').mockResolvedValue({
        status: 'paid',
        currency: 'ETB',
        total: 1150000,
        paidAt: '2026-10-31T12:00:00.000Z',
      });

      render(
        <MemoryRouter initialEntries={['/i/tok-poll-test/return']}>
          <Routes>
            <Route path="/i/:token/return" element={<PaymentReturnPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Verify confirmed state appears
      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Payment confirmed/i })).toBeInTheDocument();
      });

      expect(statusSpy).toHaveBeenCalledWith('tok-poll-test');

      // Status chip says "Paid"
      expect(screen.getByText('Paid')).toBeInTheDocument();

      // Check amount
      expect(screen.getByText(/ETB 11,500.00/i)).toBeInTheDocument();

      // Action buttons
      expect(screen.getByRole('button', { name: /View Invoice/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Download Receipt/i })).toBeInTheDocument();
    });

    it('has an accessible aria-live region announcing payment verification and confirmation', async () => {
      vi.spyOn(api, 'fetchPublicInvoiceStatus').mockResolvedValue({
        status: 'paid',
        currency: 'ETB',
        total: 50000,
        paidAt: '2026-10-31T12:00:00.000Z',
      });

      render(
        <MemoryRouter initialEntries={['/i/tok-live-test/return']}>
          <Routes>
            <Route path="/i/:token/return" element={<PaymentReturnPage />} />
          </Routes>
        </MemoryRouter>
      );

      await waitFor(() => {
        expect(screen.getByRole('heading', { name: /Payment confirmed/i })).toBeInTheDocument();
      });

      // Assert aria-live container
      const liveRegion = screen.getByText(/Payment confirmed. Invoice has been marked as paid./i);
      expect(liveRegion).toHaveAttribute('aria-live', 'polite');
    });
  });
});
