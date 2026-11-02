import { useState, useId } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components/ui/Button';
import { StatusChip, InvoiceStatus } from '../../components/ui/StatusChip';
import { CopyButton } from '../../components/ui/CopyButton';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Skeleton } from '../../components/ui/Skeleton';
import { ToastContainer, ToastMessage } from '../../components/ui/Toast';
import {
  ArrowLeftIcon,
  DownloadIcon,
  SendIcon,
  ArchiveIcon,
  EditIcon,
  TrashIcon,
  CheckCircleIcon,
  ExternalLinkIcon,
  ClockIcon,
  ShareIcon,
  CreditCardIcon,
  AlertCircleIcon,
} from '../../components/ui/icons';
import {
  fetchInvoice,
  sendInvoice,
  voidInvoice,
  deleteInvoice,
  downloadInvoicePdf,
  ApiException,
} from '../../lib/api';
import { formatMoney, formatMilliToQuantity } from '../../lib/money';

export function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toastId = useId();

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isSendConfirmOpen, setIsSendConfirmOpen] = useState(false);
  const [isVoidConfirmOpen, setIsVoidConfirmOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const tid = `${toastId}-${Date.now()}`;
    setToasts((prev) => [...prev, { id: tid, type, title, message, duration: 4000 }]);
  };

  const dismissToast = (tid: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== tid));
  };

  // Fetch invoice details
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoice(id!),
    enabled: Boolean(id),
  });

  const invoice = data?.invoice;

  // Send Mutation
  const sendMutation = useMutation({
    mutationFn: () => sendInvoice(id!),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setIsSendConfirmOpen(false);
      addToast(
        'success',
        'Invoice sent',
        `Invoice ${res.invoice.displayNumber || ''} has been sent successfully. Public payment link is active.`
      );
    },
    onError: (err: unknown) => {
      if (err instanceof ApiException) {
        setActionError(err.error?.message || 'Failed to send invoice.');
      } else {
        setActionError('Failed to send invoice.');
      }
    },
  });

  // Void Mutation
  const voidMutation = useMutation({
    mutationFn: () => voidInvoice(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoice', id] });
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setIsVoidConfirmOpen(false);
      addToast(
        'info',
        'Invoice voided',
        'The invoice has been cancelled. Public payment has been disabled.'
      );
    },
    onError: (err: unknown) => {
      if (err instanceof ApiException) {
        setActionError(err.error?.message || 'Failed to void invoice.');
      } else {
        setActionError('Failed to void invoice.');
      }
    },
  });

  // Delete Draft Mutation
  const deleteMutation = useMutation({
    mutationFn: () => deleteInvoice(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setIsDeleteConfirmOpen(false);
      navigate('/app/invoices');
    },
    onError: (err: unknown) => {
      if (err instanceof ApiException) {
        setActionError(err.error?.message || 'Failed to delete draft invoice.');
      } else {
        setActionError('Failed to delete draft invoice.');
      }
    },
  });

  // PDF download handler
  const handleDownloadPdf = async () => {
    if (!invoice) return;
    setIsDownloadingPdf(true);
    setActionError(null);
    try {
      const fileName = `${invoice.displayNumber || `invoice-${invoice.id.slice(0, 8)}`}.pdf`;
      await downloadInvoicePdf(invoice.id, fileName);
      addToast('success', 'PDF downloaded', `Saved ${fileName}`);
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setActionError(err.error?.message || 'Failed to generate invoice PDF.');
      } else {
        setActionError('Failed to download invoice PDF.');
      }
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 text-left py-4" aria-busy="true" aria-label="Loading invoice details">
        <Skeleton className="h-8 w-36 rounded" />
        <Skeleton className="h-32 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !invoice) {
    return (
      <div className="max-w-2xl mx-auto text-left py-12 space-y-4">
        <div role="alert" className="p-6 rounded-xl bg-red-50 border border-red-500/20 space-y-3">
          <div className="flex items-center gap-2 text-red-800 font-bold">
            <AlertCircleIcon size={20} className="text-red-600" />
            <span>Invoice Not Found</span>
          </div>
          <p className="text-sm text-red-700">
            The requested invoice could not be found or belongs to another business.
          </p>
          <div className="pt-2 flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
            <Link to="/app/invoices">
              <Button variant="primary" size="sm">
                Back to invoices
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Derive status chip
  const displayStatus: InvoiceStatus =
    invoice.status === 'sent' && invoice.isOverdue ? 'overdue' : invoice.status;

  // Plain URL share intents (no sensitive information)
  const shareText = `Invoice ${invoice.displayNumber || ''} from your provider: ${invoice.publicUrl}`;
  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
  const telegramShareUrl = `https://t.me/share/url?url=${encodeURIComponent(
    invoice.publicUrl
  )}&text=${encodeURIComponent(`Invoice ${invoice.displayNumber || ''}`)}`;

  return (
    <div className="max-w-4xl mx-auto space-y-8 text-left pb-16">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Top Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/app/invoices"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors"
        >
          <ArrowLeftIcon size={16} />
          <span>Back to invoices</span>
        </Link>
      </div>

      {/* Action Error Alert */}
      {actionError && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-500/20 text-red-800 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircleIcon size={18} className="text-red-600 shrink-0" />
            <span className="text-sm font-medium">{actionError}</span>
          </div>
          <button
            onClick={() => setActionError(null)}
            className="text-xs font-semibold text-red-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Paid or Void Banner */}
      {invoice.status === 'paid' && (
        <div className="p-4 rounded-xl bg-green-50 border border-green-500/30 text-green-900 flex items-center gap-3">
          <CheckCircleIcon size={20} className="text-green-600 shrink-0" />
          <div className="text-sm">
            <span className="font-bold">Payment confirmed.</span> This invoice was paid on{' '}
            <span className="font-semibold">
              {invoice.paidAt ? new Date(invoice.paidAt).toLocaleDateString() : 'recently'}
            </span>
            .
          </div>
        </div>
      )}

      {invoice.status === 'void' && (
        <div className="p-4 rounded-xl bg-surface-2 border border-line text-ink-600 flex items-center gap-3">
          <AlertCircleIcon size={20} className="text-ink-400 shrink-0" />
          <div className="text-sm">
            <span className="font-bold text-ink-900">Invoice voided.</span> This invoice has been cancelled. Public payment link is disabled.
          </div>
        </div>
      )}

      {/* Header & Status Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 rounded-xl bg-surface border border-line shadow-card">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-ink-900 tracking-tight font-mono">
              {invoice.displayNumber || 'Draft Invoice'}
            </h1>
            <StatusChip status={displayStatus} size="md" />
          </div>
          <p className="text-sm text-ink-500 mt-1">
            Created on {new Date(invoice.createdAt).toLocaleDateString()} • Currency: {invoice.currency}
          </p>
        </div>

        {/* Status-Permitted Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Draft Actions */}
          {invoice.status === 'draft' && (
            <>
              <Link to={`/app/invoices/${invoice.id}/edit`}>
                <Button variant="secondary" size="sm" leftIcon={<EditIcon size={14} />}>
                  Edit draft
                </Button>
              </Link>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsSendConfirmOpen(true)}
                leftIcon={<SendIcon size={14} />}
              >
                Send invoice
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="text-red-700 hover:text-red-800 hover:bg-red-50"
                leftIcon={<TrashIcon size={14} />}
              >
                Delete
              </Button>
            </>
          )}

          {/* Sent Actions */}
          {invoice.status === 'sent' && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
                leftIcon={<DownloadIcon size={14} />}
              >
                {isDownloadingPdf ? 'Generating PDF...' : 'Download PDF'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsVoidConfirmOpen(true)}
                className="text-red-700 hover:text-red-800 hover:bg-red-50"
                leftIcon={<ArchiveIcon size={14} />}
              >
                Void invoice
              </Button>
            </>
          )}

          {/* Paid / Void Actions */}
          {(invoice.status === 'paid' || invoice.status === 'void') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handleDownloadPdf}
              disabled={isDownloadingPdf}
              leftIcon={<DownloadIcon size={14} />}
            >
              {isDownloadingPdf ? 'Generating PDF...' : 'Download PDF'}
            </Button>
          )}
        </div>
      </div>

      {/* Public Share Card (Active for sent and paid invoices) */}
      {invoice.status !== 'draft' && (
        <div className="p-6 rounded-xl bg-surface border border-line shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
              <ShareIcon size={18} className="text-blue-700" />
              <span>Public Payment Link</span>
            </h2>
            <a
              href={invoice.publicUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-blue-700 hover:text-blue-800 flex items-center gap-1 hover:underline"
            >
              <span>Preview payer view</span>
              <ExternalLinkIcon size={12} />
            </a>
          </div>

          <p className="text-xs text-ink-500">
            Share this link with your client. They can view the invoice, pay online, and download their PDF receipt without needing an account.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-2">
            <input
              type="text"
              readOnly
              value={invoice.publicUrl}
              className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-xs font-mono text-ink-700 truncate select-all focus:outline-none"
            />
            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
              <CopyButton textToCopy={invoice.publicUrl} label="Copy link" className="w-full sm:w-auto" />
              <a
                href={whatsappShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Share via WhatsApp"
                className="inline-flex items-center justify-center p-2 rounded-md bg-surface border border-line hover:bg-surface-2 text-ink-700 hover:text-green-700 transition-colors"
              >
                <span className="text-xs font-bold px-1 text-green-700">WhatsApp</span>
              </a>
              <a
                href={telegramShareUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="Share via Telegram"
                className="inline-flex items-center justify-center p-2 rounded-md bg-surface border border-line hover:bg-surface-2 text-ink-700 hover:text-blue-600 transition-colors"
              >
                <span className="text-xs font-bold px-1 text-blue-600">Telegram</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Overview: Client & Dates */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Client Card */}
        <div className="p-6 rounded-xl bg-surface border border-line shadow-card space-y-3">
          <h2 className="text-xs font-bold text-ink-500 uppercase tracking-wider">
            Bill To
          </h2>
          <div className="space-y-1">
            <p className="text-base font-bold text-ink-900">
              {invoice.clientName || 'Unnamed Client'}
            </p>
            {invoice.clientEmail && (
              <p className="text-sm text-ink-600 font-mono">
                {invoice.clientEmail}
              </p>
            )}
          </div>
        </div>

        {/* Dates & Status Card */}
        <div className="p-6 rounded-xl bg-surface border border-line shadow-card space-y-3">
          <h2 className="text-xs font-bold text-ink-500 uppercase tracking-wider">
            Invoice Dates
          </h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-ink-500">Issue Date</p>
              <p className="font-mono font-semibold text-ink-900">{invoice.issueDate}</p>
            </div>
            <div>
              <p className="text-xs text-ink-500">Due Date</p>
              <p className="font-mono font-semibold text-ink-900">{invoice.dueDate}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Line Items Table */}
      <div className="p-6 rounded-xl bg-surface border border-line shadow-card space-y-4">
        <h2 className="text-base font-bold text-ink-900">Line Items</h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm divide-y divide-line">
            <thead className="bg-surface-2 text-ink-600 font-semibold text-xs tracking-wider uppercase">
              <tr>
                <th scope="col" className="py-2.5 px-3">#</th>
                <th scope="col" className="py-2.5 px-3">Description</th>
                <th scope="col" className="py-2.5 px-3 text-right">Quantity</th>
                <th scope="col" className="py-2.5 px-3 text-right">Unit Price</th>
                <th scope="col" className="py-2.5 px-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60 bg-surface">
              {(invoice.items || []).map((item, idx) => (
                <tr key={item.id || idx}>
                  <td className="py-3 px-3 text-ink-400 font-mono text-xs">{item.position || idx + 1}</td>
                  <td className="py-3 px-3 font-medium text-ink-900">{item.description}</td>
                  <td className="py-3 px-3 text-right tabular-nums text-ink-700">
                    {formatMilliToQuantity(item.quantityMilli)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono tabular-nums text-ink-700">
                    {formatMoney(item.unitPriceMinor, invoice.currency)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-ink-900 tabular-nums">
                    {formatMoney(item.lineTotalMinor, invoice.currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Breakdown */}
        <div className="pt-4 border-t border-line flex flex-col items-end space-y-2 text-sm">
          <div className="flex items-center justify-between w-64 text-ink-600">
            <span>Subtotal</span>
            <span className="font-mono font-semibold tabular-nums">
              {formatMoney(invoice.subtotalMinor, invoice.currency)}
            </span>
          </div>
          <div className="flex items-center justify-between w-64 text-ink-600">
            <span>Tax ({invoice.taxRateBps / 100}%)</span>
            <span className="font-mono font-semibold tabular-nums">
              {formatMoney(invoice.taxMinor, invoice.currency)}
            </span>
          </div>
          <div className="flex items-center justify-between w-64 pt-2 border-t border-line text-base font-bold text-ink-900">
            <span>Total</span>
            <span className="font-mono text-xl text-blue-700 tabular-nums">
              {formatMoney(invoice.totalMinor, invoice.currency)}
            </span>
          </div>
        </div>
      </div>

      {/* Notes / Payment Terms (if present) */}
      {invoice.notes && (
        <div className="p-6 rounded-xl bg-surface border border-line shadow-card space-y-2">
          <h2 className="text-xs font-bold text-ink-500 uppercase tracking-wider">
            Notes & Instructions
          </h2>
          <p className="text-sm text-ink-700 whitespace-pre-line">{invoice.notes}</p>
        </div>
      )}

      {/* Status Timeline */}
      <div className="p-6 rounded-xl bg-surface border border-line shadow-card space-y-4">
        <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
          <ClockIcon size={18} className="text-ink-600" />
          <span>Status Timeline</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs">
          <div className="p-3 rounded-lg bg-surface-2 border border-line space-y-1">
            <span className="font-bold text-ink-700">1. Draft Created</span>
            <p className="font-mono text-ink-500">
              {new Date(invoice.createdAt).toLocaleString()}
            </p>
          </div>

          <div
            className={`p-3 rounded-lg border space-y-1 ${
              invoice.sentAt ? 'bg-blue-50/60 border-blue-600/20 text-blue-900' : 'bg-surface-2/40 border-line text-ink-400'
            }`}
          >
            <span className="font-bold">2. Sent to Client</span>
            <p className="font-mono">
              {invoice.sentAt ? new Date(invoice.sentAt).toLocaleString() : 'Not sent yet'}
            </p>
          </div>

          <div
            className={`p-3 rounded-lg border space-y-1 ${
              invoice.paidAt ? 'bg-green-50 border-green-500/30 text-green-900' : 'bg-surface-2/40 border-line text-ink-400'
            }`}
          >
            <span className="font-bold">3. Paid</span>
            <p className="font-mono">
              {invoice.paidAt ? new Date(invoice.paidAt).toLocaleString() : 'Not paid'}
            </p>
          </div>

          <div
            className={`p-3 rounded-lg border space-y-1 ${
              invoice.voidedAt ? 'bg-red-50 border-red-500/30 text-red-900' : 'bg-surface-2/40 border-line text-ink-400'
            }`}
          >
            <span className="font-bold">4. Voided</span>
            <p className="font-mono">
              {invoice.voidedAt ? new Date(invoice.voidedAt).toLocaleString() : 'Active (Not voided)'}
            </p>
          </div>
        </div>
      </div>

      {/* Payments History */}
      <div className="p-6 rounded-xl bg-surface border border-line shadow-card space-y-4">
        <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
          <CreditCardIcon size={18} className="text-ink-600" />
          <span>Payment Records</span>
        </h2>

        {invoice.payments && invoice.payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm divide-y divide-line">
              <thead className="bg-surface-2 text-ink-600 font-semibold text-xs tracking-wider uppercase">
                <tr>
                  <th scope="col" className="py-2.5 px-3">Date</th>
                  <th scope="col" className="py-2.5 px-3">Provider</th>
                  <th scope="col" className="py-2.5 px-3">Transaction Ref</th>
                  <th scope="col" className="py-2.5 px-3">Amount</th>
                  <th scope="col" className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60 bg-surface">
                {invoice.payments.map((p) => (
                  <tr key={p.id}>
                    <td className="py-3 px-3 font-mono text-xs text-ink-600">
                      {new Date(p.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-3 uppercase text-xs font-bold text-ink-800">{p.provider}</td>
                    <td className="py-3 px-3 font-mono text-xs text-ink-600">{p.txRef}</td>
                    <td className="py-3 px-3 font-mono font-bold text-ink-900 tabular-nums">
                      {formatMoney(p.amountMinor, p.currency)}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${
                          p.status === 'succeeded'
                            ? 'bg-green-50 text-green-700 border border-green-500/20'
                            : p.status === 'pending'
                            ? 'bg-amber-50 text-amber-700 border border-amber-500/20'
                            : 'bg-red-50 text-red-700 border border-red-500/20'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-ink-500 italic py-2">
            No payments have been received for this invoice yet.
          </p>
        )}
      </div>

      {/* Confirmation Modals */}

      {/* Send Confirmation */}
      <ConfirmDialog
        isOpen={isSendConfirmOpen}
        onClose={() => setIsSendConfirmOpen(false)}
        onConfirm={() => sendMutation.mutate()}
        title="Send Invoice to Client"
        description="Once sent, the sequential invoice number will be permanently assigned and line items can no longer be edited. The public payment link will become immediately active."
        confirmLabel={sendMutation.isPending ? 'Sending...' : 'Confirm & Send'}
        variant="primary"
        isLoading={sendMutation.isPending}
      />

      {/* Void Confirmation */}
      <ConfirmDialog
        isOpen={isVoidConfirmOpen}
        onClose={() => setIsVoidConfirmOpen(false)}
        onConfirm={() => voidMutation.mutate()}
        title="Void Invoice"
        description="Are you sure you want to void this sent invoice? Voiding permanently marks the invoice cancelled, disables the public checkout button, and cannot be undone. The invoice number is retained to prevent gaps in sequence."
        confirmLabel={voidMutation.isPending ? 'Voiding...' : 'Yes, void invoice'}
        variant="danger"
        isLoading={voidMutation.isPending}
      />

      {/* Delete Draft Confirmation */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Delete Draft Invoice"
        description="Are you sure you want to delete this draft invoice? Drafts are permanently deleted and cannot be recovered."
        confirmLabel={deleteMutation.isPending ? 'Deleting...' : 'Delete draft'}
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
