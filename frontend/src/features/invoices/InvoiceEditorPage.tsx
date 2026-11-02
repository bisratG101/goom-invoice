import { useState, useEffect, useId, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Textarea } from '../../components/ui/Textarea';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { ToastContainer, ToastMessage } from '../../components/ui/Toast';
import {
  PlusIcon,
  TrashIcon,
  ArrowLeftIcon,
  AlertCircleIcon,
  CheckCircleIcon,
  FileTextIcon,
  CalculatorIcon,
} from '../../components/ui/icons';
import {
  fetchInvoice,
  createInvoice,
  updateInvoice,
  fetchClients,
  createClient,
  ApiException,
} from '../../lib/api';
import {
  calculateInvoiceTotals,
  formatMoney,
  parseDecimalToMinor,
  parseQuantityToMilli,
  formatMinorToDecimal,
  formatMilliToQuantity,
} from '../../lib/money';

interface LineItemFormState {
  id: string; // client-side temp id for key
  description: string;
  quantity: string;
  unitPrice: string;
}

export function InvoiceEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEditMode = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { business } = useAuth();
  const toastId = useId();

  // Toast state
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  // Form state
  const [clientId, setClientId] = useState<string>('');
  const [currency, setCurrency] = useState<'ETB' | 'USD'>('ETB');
  const [issueDate, setIssueDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [taxRatePct, setTaxRatePct] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');
  const [items, setItems] = useState<LineItemFormState[]>([
    { id: 'item-1', description: '', quantity: '1', unitPrice: '' },
  ]);

  // Validation & Error states
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState<string | null>(null);

  // Inline Client Modal state
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientEmail, setNewClientEmail] = useState('');
  const [newClientPhone, setNewClientPhone] = useState('');
  const [newClientAddress, setNewClientAddress] = useState('');
  const [newClientError, setNewClientError] = useState<string | null>(null);
  const [isCreatingClient, setIsCreatingClient] = useState(false);

  // Default currency from business settings
  useEffect(() => {
    if (!isEditMode && business?.defaultCurrency) {
      setCurrency(business.defaultCurrency);
    }
  }, [business?.defaultCurrency, isEditMode]);

  // Fetch clients for dropdown
  const clientsQuery = useQuery({
    queryKey: ['clients', 'active-list'],
    queryFn: () => fetchClients({ archived: 'false', limit: 100 }),
  });

  const activeClients = clientsQuery.data?.clients || [];

  // Fetch existing invoice if in edit mode
  const invoiceQuery = useQuery({
    queryKey: ['invoice', id],
    queryFn: () => fetchInvoice(id!),
    enabled: isEditMode,
  });

  // Populate form with existing invoice data
  useEffect(() => {
    if (invoiceQuery.data?.invoice) {
      const inv = invoiceQuery.data.invoice;
      setClientId(inv.clientId);
      setCurrency(inv.currency);
      setIssueDate(inv.issueDate);
      setDueDate(inv.dueDate);
      setTaxRatePct(String(inv.taxRateBps / 100));
      setNotes(inv.notes || '');

      if (inv.items && inv.items.length > 0) {
        setItems(
          inv.items.map((it, idx) => ({
            id: `item-${it.id || idx}`,
            description: it.description,
            quantity: formatMilliToQuantity(it.quantityMilli),
            unitPrice: formatMinorToDecimal(it.unitPriceMinor),
          }))
        );
      }
    }
  }, [invoiceQuery.data]);

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const tid = `${toastId}-${Date.now()}`;
    setToasts((prev) => [...prev, { id: tid, type, title, message, duration: 4000 }]);
  };

  const dismissToast = (tid: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== tid));
  };

  // Line item helpers
  const handleAddItem = () => {
    setItems((prev) => [
      ...prev,
      { id: `item-${Date.now()}`, description: '', quantity: '1', unitPrice: '' },
    ]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleItemChange = (index: number, field: keyof LineItemFormState, val: string) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
    // Clear item-level field errors when edited
    if (fieldErrors[`item-${index}-${field}`]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[`item-${index}-${field}`];
        return next;
      });
    }
  };

  // Live preview totals calculation using shared money utilities
  const previewTotals = useMemo(() => {
    const taxRateBps = Math.min(10000, Math.max(0, Math.round((parseFloat(taxRatePct) || 0) * 100)));
    const normalizedItems = items.map((it) => {
      let quantityMilli = 1000;
      try {
        quantityMilli = parseQuantityToMilli(it.quantity || '1');
      } catch {
        quantityMilli = 1000;
      }

      let unitPriceMinor = 0;
      try {
        unitPriceMinor = parseDecimalToMinor(it.unitPrice || '0');
      } catch {
        unitPriceMinor = 0;
      }

      return { quantityMilli, unitPriceMinor };
    });

    try {
      return calculateInvoiceTotals(normalizedItems, taxRateBps);
    } catch {
      return { lineTotals: items.map(() => 0), subtotalMinor: 0, taxMinor: 0, totalMinor: 0 };
    }
  }, [items, taxRatePct]);

  // Client-side pre-validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!clientId) {
      errors.clientId = 'Please select a client for this invoice';
    }

    if (!issueDate) {
      errors.issueDate = 'Issue date is required';
    }

    if (!dueDate) {
      errors.dueDate = 'Due date is required';
    } else if (issueDate && dueDate < issueDate) {
      errors.dueDate = 'Due date must be on or after issue date';
    }

    if (items.length === 0) {
      errors.items = 'At least one line item is required';
    }

    items.forEach((it, idx) => {
      if (!it.description.trim()) {
        errors[`item-${idx}-description`] = 'Description is required';
      } else if (it.description.length > 200) {
        errors[`item-${idx}-description`] = 'Max 200 characters';
      }

      if (!it.quantity.trim()) {
        errors[`item-${idx}-quantity`] = 'Quantity is required';
      } else {
        const qNum = parseFloat(it.quantity);
        if (isNaN(qNum) || qNum <= 0) {
          errors[`item-${idx}-quantity`] = 'Quantity must be > 0';
        } else if (qNum > 1000) {
          errors[`item-${idx}-quantity`] = 'Quantity cannot exceed 1,000';
        }
      }

      if (it.unitPrice === undefined || it.unitPrice.trim() === '') {
        errors[`item-${idx}-unitPrice`] = 'Unit price is required';
      } else {
        const pNum = parseFloat(it.unitPrice);
        if (isNaN(pNum) || pNum < 0) {
          errors[`item-${idx}-unitPrice`] = 'Unit price cannot be negative';
        } else if (pNum > 10000000) {
          errors[`item-${idx}-unitPrice`] = 'Unit price exceeds limit';
        }
      }
    });

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Create or Update mutation
  const saveInvoiceMutation = useMutation({
    mutationFn: async () => {
      const taxRateBps = Math.min(10000, Math.max(0, Math.round((parseFloat(taxRatePct) || 0) * 100)));
      const payloadItems = items.map((it) => ({
        description: it.description.trim(),
        quantity: it.quantity.trim() || '1',
        unitPrice: it.unitPrice.trim() || '0',
      }));

      const payload = {
        clientId,
        currency,
        issueDate,
        dueDate,
        taxRateBps,
        notes: notes.trim() ? notes.trim() : null,
        items: payloadItems,
      };

      if (isEditMode) {
        return updateInvoice(id!, payload);
      } else {
        return createInvoice(payload);
      }
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['invoice', res.invoice.id] });
      addToast(
        'success',
        isEditMode ? 'Invoice updated' : 'Invoice created',
        `Draft invoice saved successfully.`
      );
      navigate(`/app/invoices/${res.invoice.id}`);
    },
    onError: (err: unknown) => {
      if (err instanceof ApiException) {
        setApiError(err.error?.message || 'Failed to save invoice.');
        if (err.error?.details) {
          const mapped: Record<string, string> = {};
          Object.entries(err.error.details).forEach(([k, msgs]) => {
            if (msgs && msgs[0]) mapped[k] = msgs[0];
          });
          setFieldErrors((prev) => ({ ...prev, ...mapped }));
        }
      } else if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError('An unexpected error occurred while saving the invoice.');
      }
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    if (!validateForm()) return;
    saveInvoiceMutation.mutate();
  };

  // Inline Client Creation Handler
  const handleCreateClientInline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClientName.trim()) {
      setNewClientError('Client name is required');
      return;
    }

    setIsCreatingClient(true);
    setNewClientError(null);

    try {
      const res = await createClient({
        name: newClientName.trim(),
        email: newClientEmail.trim() || null,
        phone: newClientPhone.trim() || null,
        address: newClientAddress.trim() || null,
      });

      // Refetch clients list & select the newly created client
      await queryClient.invalidateQueries({ queryKey: ['clients'] });
      setClientId(res.client.id);
      setIsAddClientOpen(false);
      setNewClientName('');
      setNewClientEmail('');
      setNewClientPhone('');
      setNewClientAddress('');
      addToast('success', 'Client created', `${res.client.name} has been selected.`);
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setNewClientError(err.error?.message || 'Failed to create client.');
      } else {
        setNewClientError('Failed to create client.');
      }
    } finally {
      setIsCreatingClient(false);
    }
  };

  // Draft-Only Guard: If in edit mode and invoice is not 'draft', forbid editing
  if (isEditMode && invoiceQuery.data?.invoice && invoiceQuery.data.invoice.status !== 'draft') {
    const inv = invoiceQuery.data.invoice;
    return (
      <div className="max-w-3xl mx-auto space-y-6 text-left py-8">
        <Link to={`/app/invoices/${inv.id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-600 hover:text-ink-900">
          <ArrowLeftIcon size={16} />
          <span>Back to invoice details</span>
        </Link>

        <div role="alert" className="p-6 rounded-xl bg-amber-50 border border-amber-500/30 space-y-4">
          <div className="flex items-start gap-3">
            <AlertCircleIcon size={24} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-amber-900">
                Invoice cannot be edited
              </h2>
              <p className="text-sm text-amber-800">
                Only draft invoices can be edited per product rules. Invoice{' '}
                <span className="font-mono font-bold">{inv.displayNumber || inv.id}</span> has status{' '}
                <span className="font-bold uppercase tracking-wider">{inv.status}</span> and is permanently immutable.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Link to={`/app/invoices/${inv.id}`}>
              <Button variant="primary" size="sm">
                View invoice details
              </Button>
            </Link>
            <Link to="/app/invoices">
              <Button variant="secondary" size="sm">
                Return to invoices list
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // Loading state for edit mode
  if (isEditMode && invoiceQuery.isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 text-left" aria-busy="true" aria-label="Loading invoice editor">
        <Skeleton className="h-10 w-48 rounded" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 text-left pb-16">
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to={isEditMode ? `/app/invoices/${id}` : '/app/invoices'}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-600 hover:text-ink-900 transition-colors"
        >
          <ArrowLeftIcon size={16} />
          <span>{isEditMode ? 'Cancel and back to invoice' : 'Back to invoices'}</span>
        </Link>
      </div>

      {/* Page Title */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-ink-900 tracking-tight">
          {isEditMode ? `Edit Draft Invoice ${invoiceQuery.data?.invoice.displayNumber || ''}` : 'New Invoice'}
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          {isEditMode
            ? 'Update line items, dates, and client information before sending.'
            : 'Draft a new invoice. Totals are automatically computed and securely verified server-side.'}
        </p>
      </div>

      {/* API Error Alert */}
      {apiError && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-500/20 text-red-800 flex items-start gap-3">
          <AlertCircleIcon size={18} className="text-red-600 shrink-0 mt-0.5" />
          <div className="text-sm font-medium">{apiError}</div>
        </div>
      )}

      {/* Editor Form */}
      <form onSubmit={handleSubmit} className="space-y-8" noValidate>
        {/* Section 1: Client & Currency */}
        <div className="p-6 rounded-xl bg-surface border border-line shadow-card space-y-6">
          <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
            <FileTextIcon size={18} className="text-blue-700" />
            <span>Invoice Details</span>
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Client Selection with inline Add Client action */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="client-select" className="text-sm font-medium text-ink-900">
                  Client <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsAddClientOpen(true)}
                  className="text-xs font-semibold text-blue-700 hover:text-blue-800 hover:underline flex items-center gap-1"
                >
                  <PlusIcon size={12} />
                  <span>Add new client</span>
                </button>
              </div>

              <select
                id="client-select"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  if (fieldErrors.clientId) {
                    setFieldErrors((prev) => {
                      const next = { ...prev };
                      delete next.clientId;
                      return next;
                    });
                  }
                }}
                className={`w-full rounded-md bg-surface px-3 py-2 text-sm text-ink-900 border ${
                  fieldErrors.clientId ? 'border-red-500' : 'border-border-input'
                } focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors`}
              >
                <option value="">Select a client...</option>
                {activeClients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.email ? `(${c.email})` : ''}
                  </option>
                ))}
              </select>
              {fieldErrors.clientId && (
                <p className="text-xs text-red-600">{fieldErrors.clientId}</p>
              )}
            </div>

            {/* Currency Selector */}
            <div className="space-y-1.5">
              <label htmlFor="currency-select" className="text-sm font-medium text-ink-900">
                Currency <span className="text-red-500">*</span>
              </label>
              <select
                id="currency-select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as 'ETB' | 'USD')}
                className="w-full rounded-md bg-surface px-3 py-2 text-sm text-ink-900 border border-border-input focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors font-semibold"
              >
                <option value="ETB">ETB (Ethiopian Birr)</option>
                <option value="USD">USD (US Dollar)</option>
              </select>
              <p className="text-xs text-ink-500">
                Amounts in ETB and USD are handled separately and never combined.
              </p>
            </div>

            {/* Issue Date */}
            <Input
              id="issue-date"
              type="date"
              label="Issue Date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              error={fieldErrors.issueDate}
              required
            />

            {/* Due Date */}
            <Input
              id="due-date"
              type="date"
              label="Due Date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              error={fieldErrors.dueDate}
              required
            />
          </div>
        </div>

        {/* Section 2: Dynamic Line Items */}
        <div className="p-6 rounded-xl bg-surface border border-line shadow-card space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-ink-900">Line Items</h2>
              <p className="text-xs text-ink-500">At least one item with description and price is required.</p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddItem}
              leftIcon={<PlusIcon size={14} />}
            >
              Add line item
            </Button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => {
              const lineTotalMinor = previewTotals.lineTotals[index] || 0;

              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-lg border border-line bg-surface-2/40 flex flex-col sm:flex-row items-start sm:items-center gap-3 transition-colors"
                >
                  <div className="w-full sm:flex-1 space-y-1">
                    <input
                      type="text"
                      placeholder="Item description (e.g. Website Design)"
                      value={item.description}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      aria-label={`Item ${index + 1} description`}
                      className={`w-full rounded-md bg-surface px-3 py-2 text-sm text-ink-900 border ${
                        fieldErrors[`item-${index}-description`] ? 'border-red-500' : 'border-border-input'
                      } focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors`}
                    />
                    {fieldErrors[`item-${index}-description`] && (
                      <p className="text-xs text-red-600">{fieldErrors[`item-${index}-description`]}</p>
                    )}
                  </div>

                  <div className="w-24 shrink-0 space-y-1">
                    <input
                      type="text"
                      placeholder="Qty"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                      aria-label={`Item ${index + 1} quantity`}
                      className={`w-full rounded-md bg-surface px-3 py-2 text-sm text-ink-900 border tabular-nums ${
                        fieldErrors[`item-${index}-quantity`] ? 'border-red-500' : 'border-border-input'
                      } focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors text-right`}
                    />
                    {fieldErrors[`item-${index}-quantity`] && (
                      <p className="text-xs text-red-600">{fieldErrors[`item-${index}-quantity`]}</p>
                    )}
                  </div>

                  <div className="w-32 shrink-0 space-y-1">
                    <input
                      type="text"
                      placeholder="Price"
                      inputMode="decimal"
                      value={item.unitPrice}
                      onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                      aria-label={`Item ${index + 1} unit price`}
                      className={`w-full rounded-md bg-surface px-3 py-2 text-sm text-ink-900 border tabular-nums font-mono ${
                        fieldErrors[`item-${index}-unitPrice`] ? 'border-red-500' : 'border-border-input'
                      } focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors text-right`}
                    />
                    {fieldErrors[`item-${index}-unitPrice`] && (
                      <p className="text-xs text-red-600">{fieldErrors[`item-${index}-unitPrice`]}</p>
                    )}
                  </div>

                  {/* Line Total Live Preview */}
                  <div className="w-32 shrink-0 text-right font-mono font-bold text-sm text-ink-900 tabular-nums pt-2 sm:pt-0">
                    {formatMoney(lineTotalMinor, currency)}
                  </div>

                  {/* Delete Item Button */}
                  <div className="shrink-0 pt-1 sm:pt-0">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(index)}
                      disabled={items.length <= 1}
                      title="Remove item"
                      aria-label={`Remove line item ${index + 1}`}
                      className="text-ink-400 hover:text-red-700 hover:bg-red-50"
                      leftIcon={<TrashIcon size={16} />}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Section 3: Tax, Notes & Authoritative Calculations Preview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Notes & Tax inputs */}
          <div className="p-6 rounded-xl bg-surface border border-line shadow-card space-y-4">
            <h2 className="text-base font-bold text-ink-900">Tax & Notes</h2>

            <div className="space-y-1.5">
              <label htmlFor="tax-rate-input" className="text-sm font-medium text-ink-900">
                Tax Rate (%)
              </label>
              <div className="relative">
                <input
                  id="tax-rate-input"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={taxRatePct}
                  onChange={(e) => setTaxRatePct(e.target.value)}
                  placeholder="0 (e.g. 15 for 15% VAT)"
                  className="w-full rounded-md bg-surface px-3 py-2 text-sm text-ink-900 border border-border-input focus:border-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-600 transition-colors tabular-nums pr-8"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-400 text-sm font-bold select-none">
                  %
                </span>
              </div>
              <p className="text-xs text-ink-500">
                Ethiopian standard VAT is 15% (1500 bps). Custom rates up to 100% are supported.
              </p>
            </div>

            <Textarea
              id="invoice-notes"
              label="Notes / Payment Instructions (Optional)"
              rows={4}
              maxLength={1000}
              placeholder="e.g. Bank transfer to CBE Account 1000..., payment due within 14 days."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              helperText={`${notes.length}/1000 characters`}
            />
          </div>

          {/* Live Totals Preview Card */}
          <div className="p-6 rounded-xl bg-surface border border-line shadow-card flex flex-col justify-between space-y-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-line">
                <h2 className="text-base font-bold text-ink-900 flex items-center gap-2">
                  <CalculatorIcon size={18} className="text-ink-600" />
                  <span>Totals Summary</span>
                </h2>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-600/20">
                  {currency}
                </span>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex items-center justify-between text-ink-600">
                  <span>Subtotal</span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatMoney(previewTotals.subtotalMinor, currency)}
                  </span>
                </div>

                <div className="flex items-center justify-between text-ink-600">
                  <span>Tax ({taxRatePct || 0}%)</span>
                  <span className="font-mono font-medium tabular-nums">
                    {formatMoney(previewTotals.taxMinor, currency)}
                  </span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-line text-base font-bold text-ink-900">
                  <span>Total Amount</span>
                  <span className="font-mono text-xl text-blue-700 tabular-nums">
                    {formatMoney(previewTotals.totalMinor, currency)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-surface-2 text-[11px] text-ink-500 border border-line">
              <span className="font-semibold text-ink-700">Display preview only:</span> All final subtotals, tax figures, and line totals are securely computed on the backend using integer arithmetic.
            </div>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-line">
          <Link to={isEditMode ? `/app/invoices/${id}` : '/app/invoices'}>
            <Button type="button" variant="secondary" size="md">
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={saveInvoiceMutation.isPending}
            leftIcon={<CheckCircleIcon size={16} />}
          >
            {saveInvoiceMutation.isPending
              ? 'Saving draft...'
              : isEditMode
              ? 'Save changes'
              : 'Save as draft'}
          </Button>
        </div>
      </form>

      {/* Inline Create Client Modal */}
      <Modal
        isOpen={isAddClientOpen}
        onClose={() => setIsAddClientOpen(false)}
        title="Add New Client"
        description="Create a client profile without leaving the invoice editor."
      >
        <form onSubmit={handleCreateClientInline} className="space-y-4 pt-2">
          {newClientError && (
            <div role="alert" className="p-3 rounded bg-red-50 text-red-700 text-xs font-medium">
              {newClientError}
            </div>
          )}

          <Input
            id="inline-client-name"
            label="Client Name"
            placeholder="e.g. Nile Technologies PLC"
            value={newClientName}
            onChange={(e) => setNewClientName(e.target.value)}
            required
            autoFocus
          />

          <Input
            id="inline-client-email"
            type="email"
            label="Email Address"
            placeholder="billing@niletech.com"
            value={newClientEmail}
            onChange={(e) => setNewClientEmail(e.target.value)}
          />

          <Input
            id="inline-client-phone"
            type="tel"
            label="Phone Number"
            placeholder="+251 91 122 3344"
            value={newClientPhone}
            onChange={(e) => setNewClientPhone(e.target.value)}
          />

          <Input
            id="inline-client-address"
            label="Billing Address"
            placeholder="Bole Medhanialem, Addis Ababa"
            value={newClientAddress}
            onChange={(e) => setNewClientAddress(e.target.value)}
          />

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-line">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setIsAddClientOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isCreatingClient}
            >
              {isCreatingClient ? 'Creating...' : 'Create and select client'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
