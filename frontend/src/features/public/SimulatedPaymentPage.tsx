import { useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { completeSimulatedPayment, ApiException } from '../../lib/api';
import { Button } from '../../components/ui/Button';

export function SimulatedPaymentPage() {
  const { txRef } = useParams<{ txRef: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirmPay = async () => {
    if (!txRef) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await completeSimulatedPayment(txRef);
      if (res.status === 'ok') {
        // Navigate to the return URL to begin polling confirmation
        if (token) {
          navigate(`/i/${token}/return`);
        } else {
          navigate('/');
        }
      } else {
        setError('Payment simulator reported an unexpected result.');
      }
    } catch (err: any) {
      if (err instanceof ApiException && err.status === 404) {
        setError('Simulated payment session not found or demo mode is disabled.');
      } else {
        setError(err.message || 'Failed to complete simulated payment. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    if (token) {
      navigate(`/i/${token}`);
    } else {
      navigate(-1);
    }
  };

  return (
    <div className="min-h-screen bg-surface-2 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-surface rounded-xl shadow-card border border-line overflow-hidden">
        {/* Prominent Demo Warning Banner */}
        <div className="bg-amber-500 text-ink-950 font-bold text-xs uppercase tracking-widest px-4 py-2 text-center">
          ⚡ DEMO MODE — Simulated Payment Gateway
        </div>

        <div className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <div className="w-12 h-12 bg-blue-50 text-blue-700 rounded-full flex items-center justify-center mx-auto mb-3 text-xl font-bold">
              💳
            </div>
            <h1 className="text-xl font-bold text-ink-900 mb-1">
              Simulated Checkout
            </h1>
            <p className="text-xs text-ink-500">
              Test mode is active. No real credit card or bank credentials will be used.
            </p>
          </div>

          {/* Transaction Metadata Card */}
          <div className="bg-surface-2 rounded-lg p-4 mb-6 border border-line text-xs space-y-2">
            <div className="flex justify-between">
              <span className="text-ink-500 font-medium">Gateway</span>
              <span className="text-ink-900 font-semibold">Goom Simulated Provider</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500 font-medium">Reference</span>
              <span className="font-mono text-ink-900 truncate max-w-[200px]">{txRef}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-500 font-medium">Status</span>
              <span className="text-amber-700 font-semibold">Awaiting Simulation</span>
            </div>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-6 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
            >
              {error}
            </div>
          )}

          <div className="flex flex-col gap-3">
            <Button
              variant="primary"
              size="md"
              onClick={handleConfirmPay}
              isLoading={isSubmitting}
              loadingText="Simulating webhook..."
              className="w-full bg-blue-700 hover:bg-blue-600"
            >
              Pay (demo)
            </Button>
            <Button
              variant="secondary"
              size="md"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
