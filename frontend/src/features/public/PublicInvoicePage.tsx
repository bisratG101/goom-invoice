import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchPublicInvoice,
  payPublicInvoice,
  downloadPublicInvoicePdf,
  fetchConfigApi,
  PublicInvoice,
  ApiException,
} from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { StatusChip } from '../../components/ui/StatusChip';
import { Button } from '../../components/ui/Button';
import { PayerEmailModal } from './PayerEmailModal';
import { DownloadIcon, Spinner } from '../../components/ui/icons';

export function PublicInvoicePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [invoice, setInvoice] = useState<PublicInvoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  // Demo mode configuration from public config endpoint
  const [demoMode, setDemoMode] = useState(false);

  // Pay button loading states
  const [isPaying, setIsPaying] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);

  // Payer email modal state (for Chapa payments when client email is missing)
  const [showEmailModal, setShowEmailModal] = useState(false);

  useEffect(() => {
    if (!token) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function loadData() {
      setIsLoading(true);
      setError(null);
      setNotFound(false);

      try {
        const [configRes, invoiceRes] = await Promise.all([
          fetchConfigApi().catch(() => ({ demoMode: false })),
          fetchPublicInvoice(token!),
        ]);

        if (isMounted) {
          setDemoMode(configRes.demoMode);
          setInvoice(invoiceRes.invoice);
          // Set generic document title (never private data)
          document.title = invoiceRes.invoice.displayNumber
            ? `Invoice ${invoiceRes.invoice.displayNumber} | Goom Invoice`
            : 'Invoice | Goom Invoice';
        }
      } catch (err: any) {
        if (isMounted) {
          if (err instanceof ApiException && err.status === 404) {
            setNotFound(true);
          } else {
            setError(err.message || 'Failed to load invoice. Please try again.');
          }
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [token]);

  // Handle standard payment initiation
  const handlePay = async (payerInfo?: { payerEmail: string; payerFirstName?: string; payerLastName?: string }) => {
    if (!token || !invoice) return;
    setIsPaying(true);
    setPayError(null);

    try {
      const res = await payPublicInvoice(token, payerInfo);
      setShowEmailModal(false);

      if (res.checkoutUrl) {
        // If it's an internal relative route (e.g. simulated payment in demo)
        if (res.checkoutUrl.startsWith('/')) {
          navigate(`${res.checkoutUrl}?token=${token}`);
        } else {
          // External payment gateway (e.g. Chapa checkout)
          window.location.href = res.checkoutUrl;
        }
      }
    } catch (err: any) {
      if (err instanceof ApiException && err.error?.code === 'PAYER_EMAIL_REQUIRED') {
        setShowEmailModal(true);
      } else {
        setPayError(err.message || 'Unable to initiate payment. Please try again.');
      }
    } finally {
      setIsPaying(false);
    }
  };

  // Handle explicit demo payment initiation
  const handleDemoPay = async () => {
    if (!token || !invoice) return;
    setIsPaying(true);
    setPayError(null);

    try {
      const res = await payPublicInvoice(token, { provider: 'simulated' });
      const targetUrl = res.demoCheckoutUrl || res.checkoutUrl;
      if (targetUrl) {
        if (targetUrl.startsWith('/')) {
          navigate(`${targetUrl}?token=${token}`);
        } else {
          window.location.href = targetUrl;
        }
      }
    } catch (err: any) {
      setPayError(err.message || 'Demo payment initiation failed.');
    } finally {
      setIsPaying(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!token || !invoice) return;
    setIsDownloadingPdf(true);
    try {
      await downloadPublicInvoicePdf(
        token,
        `Invoice-${invoice.displayNumber || token}.pdf`
      );
    } catch (err: any) {
      setPayError('Failed to download invoice PDF. Please try again.');
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-surface-2 flex flex-col items-center justify-center p-4">
        <Spinner size={32} className="text-blue-600 mb-3" />
        <p className="text-sm text-ink-500 font-medium animate-pulse">Loading invoice...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface rounded-xl shadow-card border border-line p-8 text-center">
          <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 font-bold text-xl">
            !
          </div>
          <h1 className="text-xl font-bold text-ink-900 mb-2">Invoice Not Found</h1>
          <p className="text-sm text-ink-600 mb-6">
            This invoice link is invalid, has expired, or the invoice is still a draft and has not been sent.
          </p>
          <Button variant="secondary" size="md" onClick={() => navigate('/')}>
            Go to Homepage
          </Button>
        </div>
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-surface rounded-xl shadow-card border border-line p-8 text-center">
          <h1 className="text-xl font-bold text-ink-900 mb-2">Error Loading Invoice</h1>
          <p className="text-sm text-ink-600 mb-6">{error || 'Unable to display invoice.'}</p>
          <Button variant="primary" size="md" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  const isPaid = invoice.status === 'paid';
  const isVoid = invoice.status === 'void';

  return (
    <div className="min-h-screen bg-surface-2 py-10 px-4 sm:px-6 flex flex-col justify-between">
      <main className="max-w-2xl w-full mx-auto">
        <div className="bg-surface rounded-xl shadow-card border border-line p-6 sm:p-8">
          {/* Top Bar: Business & Display Number */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-6 border-b border-line gap-2">
            <div>
              <span className="text-xs uppercase tracking-wider font-semibold text-ink-500">
                Invoice from
              </span>
              <h1 className="text-xl font-bold text-ink-900">{invoice.businessName}</h1>
            </div>
            <div className="sm:text-right">
              <span className="text-xs uppercase tracking-wider font-semibold text-ink-500 block">
                Invoice Number
              </span>
              <span className="text-base font-semibold text-ink-900 font-mono">
                {invoice.displayNumber || 'Draft'}
              </span>
            </div>
          </div>

          {/* Paid Banner */}
          {isPaid && (
            <div
              role="status"
              className="mt-6 p-4 bg-green-50 border border-green-500/20 rounded-md flex items-center gap-3 text-green-800"
            >
              <div className="w-5 h-5 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                ✓
              </div>
              <div>
                <p className="text-sm font-semibold">Payment Received</p>
                <p className="text-xs text-green-700">
                  {invoice.paidAt
                    ? `Paid on ${new Date(invoice.paidAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                      })}`
                    : 'This invoice has been fully paid.'}
                </p>
              </div>
            </div>
          )}

          {/* Void Banner */}
          {isVoid && (
            <div
              role="alert"
              className="mt-6 p-4 bg-red-50 border border-red-500/20 rounded-md text-red-800 text-sm"
            >
              <span className="font-semibold block">Invoice Voided</span>
              This invoice has been voided and is no longer payable.
            </div>
          )}

          {/* Header Summary: Amount Due & Status */}
          <div className="py-6 border-b border-line">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <span className="text-xs font-medium text-ink-500 uppercase tracking-wider block mb-1">
                  {isPaid ? 'Total Amount' : 'Amount Due'}
                </span>
                <div className="text-3xl sm:text-4xl font-extrabold text-ink-950 font-mono tracking-tight">
                  {formatMoney(invoice.total, invoice.currency)}
                </div>
              </div>
              <div className="flex flex-col sm:items-end gap-1.5">
                <StatusChip status={invoice.status} size="md" />
                <span className="text-xs text-ink-500">
                  Due {invoice.dueDate}
                </span>
              </div>
            </div>
          </div>

          {/* Invoice Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 py-6 border-b border-line text-sm">
            <div>
              <span className="text-xs text-ink-500 block mb-0.5">Billed to</span>
              <span className="font-semibold text-ink-900 block">{invoice.clientName}</span>
            </div>
            <div>
              <span className="text-xs text-ink-500 block mb-0.5">Issue Date</span>
              <span className="text-ink-800 font-mono">{invoice.issueDate}</span>
            </div>
            <div>
              <span className="text-xs text-ink-500 block mb-0.5">Due Date</span>
              <span className="text-ink-800 font-mono">{invoice.dueDate}</span>
            </div>
          </div>

          {/* Items Table */}
          <div className="py-6 border-b border-line">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-500 mb-3">
              Items & Services
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs font-semibold text-ink-500 uppercase">
                    <th scope="col" className="pb-2">Description</th>
                    <th scope="col" className="pb-2 text-right">Qty</th>
                    <th scope="col" className="pb-2 text-right">Unit Price</th>
                    <th scope="col" className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/60">
                  {invoice.items.map((item, idx) => (
                    <tr key={idx} className="text-ink-900">
                      <td className="py-3 font-medium pr-2">{item.description}</td>
                      <td className="py-3 text-right font-mono text-ink-600">{item.quantity}</td>
                      <td className="py-3 text-right font-mono text-ink-600">
                        {formatMoney(item.unitPrice, invoice.currency)}
                      </td>
                      <td className="py-3 text-right font-mono font-medium">
                        {formatMoney(item.amount, invoice.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals Section */}
            <div className="pt-4 flex flex-col items-end text-sm">
              <div className="w-full sm:w-64 space-y-2">
                <div className="flex justify-between text-ink-600">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatMoney(invoice.subtotal, invoice.currency)}</span>
                </div>
                {invoice.taxTotal > 0 && (
                  <div className="flex justify-between text-ink-600">
                    <span>Tax</span>
                    <span className="font-mono">{formatMoney(invoice.taxTotal, invoice.currency)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-ink-950 pt-2 border-t border-line">
                  <span>Total</span>
                  <span className="font-mono">{formatMoney(invoice.total, invoice.currency)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Notes (if any) */}
          {invoice.notes && (
            <div className="py-4 border-b border-line text-sm">
              <span className="text-xs font-semibold uppercase tracking-wider text-ink-500 block mb-1">
                Notes
              </span>
              <p className="text-ink-700 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Error Message */}
          {payError && (
            <div
              role="alert"
              className="mt-4 p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-md"
            >
              {payError}
            </div>
          )}

          {/* Actions Bar */}
          <div className="pt-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="md"
              onClick={handleDownloadPdf}
              isLoading={isDownloadingPdf}
              leftIcon={<DownloadIcon className="w-4 h-4" />}
            >
              Download PDF
            </Button>

            {!isPaid && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {demoMode && !isVoid && (
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={handleDemoPay}
                    disabled={isPaying || isVoid}
                    className="border-blue-600/30 text-blue-700 hover:bg-blue-50"
                  >
                    Pay (demo)
                  </Button>
                )}
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => handlePay()}
                  isLoading={isPaying}
                  disabled={isPaying || isVoid}
                >
                  {isVoid ? 'Invoice Void' : `Pay now`}
                </Button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Public Footer */}
      <footer className="mt-8 text-center">
        <p className="text-xs text-ink-500">
          Invoice created with <span className="font-medium text-ink-700">Goom Invoice</span>
        </p>
      </footer>

      {/* Payer Email Modal */}
      <PayerEmailModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        onSubmit={handlePay}
        isSubmitting={isPaying}
      />
    </div>
  );
}
