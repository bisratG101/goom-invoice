import { useState, useEffect, useId } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '../../context/AuthContext';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Card } from '../../components/ui/Card';
import { Skeleton } from '../../components/ui/Skeleton';
import { ToastContainer, ToastMessage } from '../../components/ui/Toast';
import {
  AlertCircleIcon,
  RefreshCwIcon,
} from '../../components/ui/icons';
import {
  fetchBusiness,
  updateBusiness,
  ApiException,
} from '../../lib/api';

const TIMEZONE_OPTIONS = [
  { value: 'Africa/Addis_Ababa', label: 'Africa/Addis_Ababa (EAT, UTC+3)' },
  { value: 'Africa/Nairobi', label: 'Africa/Nairobi (EAT, UTC+3)' },
  { value: 'Africa/Cairo', label: 'Africa/Cairo (EET, UTC+2)' },
  { value: 'Africa/Johannesburg', label: 'Africa/Johannesburg (SAST, UTC+2)' },
  { value: 'Africa/Lagos', label: 'Africa/Lagos (WAT, UTC+1)' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Paris', label: 'Europe/Paris (CET/CEST)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST, UTC+4)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
  { value: 'America/Chicago', label: 'America/Chicago (CST/CDT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST/PDT)' },
];

function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

const settingsSchema = z.object({
  name: z.string().trim().min(1, 'Business name is required').max(120, 'Name must not exceed 120 characters'),
  defaultCurrency: z.enum(['ETB', 'USD']),
  invoicePrefix: z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .refine((val) => /^[A-Z0-9]{1,8}$/.test(val), {
      message: 'Prefix must be 1 to 8 uppercase alphanumeric characters (A-Z, 0-9)',
    }),
  timezone: z.string().refine(isValidTimezone, {
    message: 'Must be a valid IANA timezone identifier',
  }),
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export function SettingsPage() {
  const { business, updateBusinessState, isDemo } = useAuth();
  const queryClient = useQueryClient();
  const toastId = useId();

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);

  const addToast = (type: 'success' | 'error' | 'info', title: string, message?: string) => {
    const id = `${toastId}-${Date.now()}`;
    setToasts((prev) => [...prev, { id, type, title, message, duration: 4000 }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Query real business profile from backend
  const {
    data,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['business'],
    queryFn: fetchBusiness,
    initialData: business
      ? {
          business: {
            id: business.id,
            name: business.name,
            defaultCurrency: business.defaultCurrency,
            invoicePrefix: business.invoicePrefix,
            timezone: business.timezone,
          },
        }
      : undefined,
  });

  const currentBusiness = data?.business;

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      name: currentBusiness?.name || '',
      defaultCurrency: currentBusiness?.defaultCurrency || 'ETB',
      invoicePrefix: currentBusiness?.invoicePrefix || 'INV',
      timezone: currentBusiness?.timezone || 'Africa/Addis_Ababa',
    },
  });

  // Keep form in sync when business profile finishes loading
  useEffect(() => {
    if (currentBusiness) {
      reset({
        name: currentBusiness.name,
        defaultCurrency: currentBusiness.defaultCurrency,
        invoicePrefix: currentBusiness.invoicePrefix,
        timezone: currentBusiness.timezone,
      });
    }
  }, [currentBusiness, reset]);

  const watchedPrefix = watch('invoicePrefix') || 'INV';

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async (formData: SettingsFormData) => {
      // Backend expects snake_case keys in PATCH /api/v1/business
      return updateBusiness({
        name: formData.name,
        default_currency: formData.defaultCurrency,
        invoice_prefix: formData.invoicePrefix.toUpperCase(),
        timezone: formData.timezone,
      });
    },
    onSuccess: (res) => {
      queryClient.setQueryData(['business'], res);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      // Update AuthContext so AppLayout headers immediately sync
      updateBusinessState({
        id: res.business.id,
        name: res.business.name,
        defaultCurrency: res.business.defaultCurrency,
        invoicePrefix: res.business.invoicePrefix,
        timezone: res.business.timezone,
      });

      addToast('success', 'Settings saved', 'Your business profile has been updated.');
      reset({
        name: res.business.name,
        defaultCurrency: res.business.defaultCurrency,
        invoicePrefix: res.business.invoicePrefix,
        timezone: res.business.timezone,
      });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiException) {
        setApiError(err.error?.message || 'Failed to update business settings.');
      } else if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError('An unexpected network error occurred.');
      }
    },
  });

  const onSubmit = (formData: SettingsFormData) => {
    setApiError(null);
    saveMutation.mutate(formData);
  };

  return (
    <div className="space-y-6 text-left max-w-4xl mx-auto">
      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-ink-900 tracking-tight">
          Settings
        </h1>
        <p className="text-sm text-ink-500 mt-1">
          Manage your business profile, default currency, sequential numbering prefix, and timezone
        </p>
      </div>

      {isDemo && (
        <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-500/20 text-xs text-amber-800">
          <strong>Demo Account:</strong> You are viewing settings for the demo business. Changes will persist during your active session.
        </div>
      )}

      {/* API Error Alert */}
      {apiError && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-red-50 border border-red-500/30 text-red-700 text-xs flex items-start gap-2.5 animate-in fade-in"
        >
          <AlertCircleIcon size={18} className="shrink-0 mt-0.5" />
          <div className="leading-relaxed">{apiError}</div>
        </div>
      )}

      {isError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-500/30 text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm animate-in fade-in"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircleIcon size={20} className="shrink-0" />
            <span>Could not load settings. Please retry.</span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()} leftIcon={<RefreshCwIcon size={14} />}>
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div className="space-y-4" aria-busy="true" aria-label="Loading settings">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
          {/* Business Profile Card */}
          <Card className="p-6 space-y-5">
            <div className="border-b border-line pb-3">
              <h2 className="text-base font-bold text-ink-900">Business Profile</h2>
              <p className="text-xs text-ink-500 mt-0.5">
                This appears on your invoices, PDF downloads, and public payer links
              </p>
            </div>

            <div className="space-y-4">
              <Input
                label="Business Name"
                placeholder="e.g. Acme Studio LLC"
                error={errors.name?.message}
                required
                {...register('name')}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Default Currency"
                  options={[
                    { value: 'ETB', label: 'ETB - Ethiopian Birr' },
                    { value: 'USD', label: 'USD - United States Dollar' },
                  ]}
                  error={errors.defaultCurrency?.message}
                  helperText="Default currency selected when drafting new invoices"
                  {...register('defaultCurrency')}
                />

                <Select
                  label="Business Timezone"
                  options={TIMEZONE_OPTIONS}
                  error={errors.timezone?.message}
                  helperText="Used to compute overdue invoices and monthly revenue boundaries"
                  {...register('timezone')}
                />
              </div>
            </div>
          </Card>

          {/* Invoicing Preferences Card */}
          <Card className="p-6 space-y-5">
            <div className="border-b border-line pb-3">
              <h2 className="text-base font-bold text-ink-900">Invoice Numbering</h2>
              <p className="text-xs text-ink-500 mt-0.5">
                Sequential invoice numbers are assigned automatically when an invoice is sent
              </p>
            </div>

            <div className="space-y-4">
              <Input
                label="Invoice Prefix"
                placeholder="INV"
                maxLength={8}
                error={errors.invoicePrefix?.message}
                helperText="1 to 8 uppercase alphanumeric characters (e.g. INV, ACME, BILL)"
                {...register('invoicePrefix')}
              />

              {/* Live Preview of formatted invoice number per design.md §7 */}
              <div className="p-4 rounded-lg bg-surface-2/60 border border-line text-xs space-y-1">
                <span className="font-semibold text-ink-700">Preview next invoice display number:</span>
                <p className="font-mono text-sm font-bold text-blue-700">
                  {watchedPrefix.toUpperCase() || 'INV'}-0001
                </p>
                <p className="text-[11px] text-ink-500">
                  Per concurrency rules, sequential numbering is gapless and assigned at send time.
                </p>
              </div>
            </div>
          </Card>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={() => {
                setApiError(null);
                if (currentBusiness) {
                  reset({
                    name: currentBusiness.name,
                    defaultCurrency: currentBusiness.defaultCurrency,
                    invoicePrefix: currentBusiness.invoicePrefix,
                    timezone: currentBusiness.timezone,
                  });
                }
              }}
              disabled={!isDirty || isSubmitting || saveMutation.isPending}
            >
              Reset Changes
            </Button>

            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={isSubmitting || saveMutation.isPending}
              disabled={!isDirty && !saveMutation.isError}
            >
              Save Settings
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
