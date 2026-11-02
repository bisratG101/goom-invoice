import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  fetchPublicInvoiceStatus,
  downloadPublicInvoicePdf,
  PublicInvoiceStatus,
} from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { StatusChip } from '../../components/ui/StatusChip';
import { Button } from '../../components/ui/Button';
import { Spinner, DownloadIcon } from '../../components/ui/icons';

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_DURATION_MS = 30000; // 30 seconds timeout per spec

export function PaymentReturnPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [statusData, setStatusData] = useState<PublicInvoiceStatus | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [isTimedOut, setIsTimedOut] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [ariaMessage, setAriaMessage] = useState('Checking payment status...');

  const startTimeRef = useRef<number>(Date.now());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollStatus = async () => {
    if (!token) return;

    try {
      const data = await fetchPublicInvoiceStatus(token);
      setStatusData(data);

      if (data.status === 'paid') {
        setIsPolling(false);
        setAriaMessage('Payment confirmed. Invoice has been marked as paid.');
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }

      if (data.status === 'void') {
        setIsPolling(false);
        setAriaMessage('This invoice has been voided.');
        if (timerRef.current) clearInterval(timerRef.current);
        return;
      }

      // Check timeout
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed >= MAX_POLL_DURATION_MS) {
        setIsPolling(false);
        setIsTimedOut(true);
        setAriaMessage('Payment confirmation timed out. The payment is still processing.');
        if (timerRef.current) clearInterval(timerRef.current);
      }
    } catch {
      // If error occurs, let polling retry until timeout
      const elapsed = Date.now() - startTimeRef.current;
      if (elapsed >= MAX_POLL_DURATION_MS) {
        setIsPolling(false);
        setIsTimedOut(true);
        setAriaMessage('Unable to confirm payment at this time.');
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }
  };

  const startPolling = () => {
    setIsPolling(true);
    setIsTimedOut(false);
    startTimeRef.current = Date.now();
    setAriaMessage('Checking payment status...');

    // Initial check immediately
    pollStatus();

    // Set interval
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(pollStatus, POLL_INTERVAL_MS);
  };

  useEffect(() => {
    if (!token) {
      setIsPolling(false);
      return;
    }

    startPolling();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [token]);

  const handleDownloadPdf = async () => {
    if (!token) return;
    setIsDownloadingPdf(true);
    try {
      await downloadPublicInvoicePdf(token, `Invoice-${token}.pdf`);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const isPaid = statusData?.status === 'paid';

  return (
    <div className="min-h-screen bg-surface-2 flex flex-col justify-between p-4 sm:p-6">
      <main className="max-w-md w-full mx-auto my-auto">
        {/* Accessible aria-live status container */}
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {ariaMessage}
        </div>

        <div className="bg-surface rounded-xl shadow-card border border-line p-8 text-center">
          {/* 1. Polling / In Progress */}
          {isPolling && (
            <div>
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Spinner size={32} />
              </div>
              <h1 className="text-xl font-bold text-ink-900 mb-2">
                Verifying Payment...
              </h1>
              <p className="text-sm text-ink-600 mb-6">
                Please wait while we confirm your payment with the payment gateway.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-surface-2 text-xs text-ink-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping" />
                Polling payment status every 2s
              </div>
            </div>
          )}

          {/* 2. Success / Payment Confirmed */}
          {!isPolling && isPaid && (
            <div>
              <div className="w-16 h-16 bg-green-50 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold shadow-sm">
                ✓
              </div>
              <h1 className="text-2xl font-bold text-ink-950 mb-2">
                Payment confirmed
              </h1>
              <p className="text-sm text-ink-600 mb-6">
                Thank you! Your payment has been received and verified successfully.
              </p>

              <div className="bg-surface-2 rounded-lg p-4 mb-6 flex items-center justify-between">
                <div className="text-left">
                  <span className="text-xs text-ink-500 block">Status</span>
                  <StatusChip status="paid" label="Paid" size="sm" />
                </div>
                {statusData?.total !== undefined && (
                  <div className="text-right">
                    <span className="text-xs text-ink-500 block">Amount Paid</span>
                    <span className="text-base font-bold text-ink-900 font-mono">
                      {formatMoney(statusData.total, statusData.currency)}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2.5">
                <Button
                  variant="primary"
                  size="md"
                  onClick={() => navigate(`/i/${token}`)}
                >
                  View Invoice
                </Button>
                <Button
                  variant="secondary"
                  size="md"
                  onClick={handleDownloadPdf}
                  isLoading={isDownloadingPdf}
                  leftIcon={<DownloadIcon className="w-4 h-4" />}
                >
                  Download Receipt (PDF)
                </Button>
              </div>
            </div>
          )}

          {/* 3. Timed out / Pending Confirmation */}
          {!isPolling && !isPaid && isTimedOut && (
            <div>
              <div className="w-16 h-16 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                ⏳
              </div>
              <h1 className="text-xl font-bold text-ink-900 mb-2">
                Payment Still Processing
              </h1>
              <p className="text-sm text-ink-600 mb-6">
                We haven't received confirmation from your payment provider yet. Your transaction may still complete shortly.
              </p>
              <div className="flex flex-col gap-2.5">
                <Button variant="primary" size="md" onClick={startPolling}>
                  Check Status Again
                </Button>
                <Button variant="secondary" size="md" onClick={() => navigate(`/i/${token}`)}>
                  Return to Invoice
                </Button>
              </div>
            </div>
          )}

          {/* 4. Other state (e.g. void or error) */}
          {!isPolling && !isPaid && !isTimedOut && (
            <div>
              <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                !
              </div>
              <h1 className="text-xl font-bold text-ink-900 mb-2">
                Payment Status Unknown
              </h1>
              <p className="text-sm text-ink-600 mb-6">
                {statusData?.status === 'void'
                  ? 'This invoice has been voided.'
                  : 'Unable to verify payment status.'}
              </p>
              <Button variant="secondary" size="md" onClick={() => navigate(`/i/${token}`)}>
                Back to Invoice
              </Button>
            </div>
          )}
        </div>
      </main>

      <footer className="text-center mt-6">
        <Link to="/" className="text-xs text-ink-500 hover:text-ink-700">
          Goom Invoice
        </Link>
      </footer>
    </div>
  );
}
