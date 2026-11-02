import React, { useState } from 'react';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';

interface PayerEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (payerData: { payerEmail: string; payerFirstName?: string; payerLastName?: string }) => Promise<void>;
  isSubmitting?: boolean;
}

export function PayerEmailModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}: PayerEmailModalProps) {
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Email address is required to receive payment confirmation');
      return;
    }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError('Please enter a valid email address');
      return;
    }

    setError(null);
    try {
      await onSubmit({
        payerEmail: trimmedEmail,
        payerFirstName: firstName.trim() || undefined,
        payerLastName: lastName.trim() || undefined,
      });
    } catch (err: any) {
      setError(err.message || 'Payment initiation failed. Please try again.');
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Payment Details"
      description="Please enter your email to receive your payment receipt."
      size="sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        {error && (
          <div
            role="alert"
            className="p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-md"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="payerEmail" className="block text-xs font-medium text-ink-700 mb-1">
            Email Address <span className="text-red-500">*</span>
          </label>
          <input
            id="payerEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            placeholder="payer@example.com"
            disabled={isSubmitting}
            className="w-full px-3 py-2 text-sm border border-line rounded-md bg-surface text-ink-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="payerFirstName" className="block text-xs font-medium text-ink-700 mb-1">
              First Name <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <input
              id="payerFirstName"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="First name"
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm border border-line rounded-md bg-surface text-ink-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label htmlFor="payerLastName" className="block text-xs font-medium text-ink-700 mb-1">
              Last Name <span className="text-ink-400 font-normal">(optional)</span>
            </label>
            <input
              id="payerLastName"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Last name"
              disabled={isSubmitting}
              className="w-full px-3 py-2 text-sm border border-line rounded-md bg-surface text-ink-900 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-line">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            loadingText="Processing..."
          >
            Continue to Pay
          </Button>
        </div>
      </form>
    </Modal>
  );
}
