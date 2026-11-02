import React, { Suspense } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { CurrencyCard } from '../../components/ui/CurrencyCard';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import {
  PlusIcon,
  FileTextIcon,
  UsersIcon,
  ShareIcon,
  AlertCircleIcon,
  RefreshCwIcon,
} from '../../components/ui/icons';
import {
  fetchDashboardSummary,
  fetchDashboardRevenue,
  fetchDashboardActivity,
} from '../../lib/api';

// Lazy-load the heavy chart chunk per design.md §12.10
const RevenueChart = React.lazy(() => import('./RevenueChart'));

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function formatRelativeTime(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

function formatMoney(minorUnits: number, currency: string): string {
  const formatted = (minorUnits / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${formatted}`;
}

export function DashboardPage() {
  const { user, business } = useAuth();
  const firstName = user?.name ? user.name.split(' ')[0] : 'there';
  const greeting = `${getTimeGreeting()}, ${firstName}`;

  // Dashboard queries
  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary'],
    queryFn: fetchDashboardSummary,
  });

  const revenueQuery = useQuery({
    queryKey: ['dashboard', 'revenue'],
    queryFn: () => fetchDashboardRevenue(6),
  });

  const activityQuery = useQuery({
    queryKey: ['dashboard', 'activity'],
    queryFn: fetchDashboardActivity,
  });

  const isLoading = summaryQuery.isLoading || revenueQuery.isLoading || activityQuery.isLoading;
  const isError = summaryQuery.isError || revenueQuery.isError || activityQuery.isError;

  const handleRetryAll = () => {
    summaryQuery.refetch();
    revenueQuery.refetch();
    activityQuery.refetch();
  };

  const summary = summaryQuery.data?.summary || {
    ETB: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
    USD: { outstandingMinor: 0, overdueMinor: 0, paidThisMonthMinor: 0 },
  };

  const revenueByCurrency = revenueQuery.data?.revenue || { ETB: [], USD: [] };
  const activities = activityQuery.data?.activity || [];

  const defaultCurrency: 'ETB' | 'USD' = business?.defaultCurrency || 'ETB';

  // Determine which currencies are actually in use per design.md §12.7:
  // - Prefer backend currenciesInUse (which reliably tracks all historical and active invoice currencies + default)
  // - Fall back to checking summary / revenue / activity for backwards compatibility or offline mocking
  const activeCurrencies: Array<'ETB' | 'USD'> = React.useMemo(() => {
    if (summaryQuery.data?.currenciesInUse && summaryQuery.data.currenciesInUse.length > 0) {
      return summaryQuery.data.currenciesInUse;
    }
    const isCurrencyInUse = (curr: 'ETB' | 'USD'): boolean => {
      if (curr === defaultCurrency) return true;
      const currSummary = summary[curr];
      const hasSummaryData = Boolean(
        currSummary &&
          (currSummary.outstandingMinor > 0 ||
            currSummary.overdueMinor > 0 ||
            currSummary.paidThisMonthMinor > 0)
      );
      const hasRevenueData = Boolean(
        revenueByCurrency[curr]?.some((pt) => pt.revenueMinor > 0)
      );
      const hasActivityData = activities.some((act) => act.currency === curr);
      return hasSummaryData || hasRevenueData || hasActivityData;
    };
    return (['ETB', 'USD'] as const).filter(isCurrencyInUse);
  }, [summaryQuery.data?.currenciesInUse, defaultCurrency, summary, revenueByCurrency, activities]);

  // Determine whether any invoice activity exists for first invoice banner
  const hasNoInvoices =
    summaryQuery.data?.hasInvoices !== undefined
      ? !summaryQuery.data.hasInvoices
      : summary.ETB.outstandingMinor === 0 &&
        summary.ETB.overdueMinor === 0 &&
        summary.ETB.paidThisMonthMinor === 0 &&
        summary.USD.outstandingMinor === 0 &&
        summary.USD.overdueMinor === 0 &&
        summary.USD.paidThisMonthMinor === 0 &&
        activities.length === 0;

  // Last sent invoice for "Share link" quick action
  const lastSentActivity = activities.find((a) => a.eventType === 'sent');

  return (
    <div className="space-y-8 text-left max-w-6xl mx-auto">
      {/* Top Welcome Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-ink-900 tracking-tight">
            {greeting}
          </h1>
          <p className="text-sm text-ink-500 mt-1">
            {business?.name || 'Your Business'} • Default currency:{' '}
            <span className="font-semibold text-ink-700">{business?.defaultCurrency || 'ETB'}</span> • Prefix:{' '}
            <span className="font-mono text-xs font-semibold">{business?.invoicePrefix || 'INV'}</span>
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link to="/app/invoices/new">
            <Button variant="primary" size="md" leftIcon={<PlusIcon size={16} />}>
              New invoice
            </Button>
          </Link>
        </div>
      </div>

      {/* Error State with Retry Button */}
      {isError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-500/30 text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm animate-in fade-in"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircleIcon size={20} className="shrink-0" />
            <span>Could not load complete dashboard data. Please check your connection and retry.</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleRetryAll}
            leftIcon={<RefreshCwIcon size={14} />}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard metrics">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-44 w-full rounded-xl" />
            <Skeleton className="h-44 w-full rounded-xl" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Multi-currency balance row: one card per currency in use per §12.7 */}
          <div className={`grid gap-4 ${activeCurrencies.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-xl'}`}>
            {activeCurrencies.map((curr) => (
              <CurrencyCard
                key={curr}
                currency={curr}
                outstandingMinorUnits={summary[curr]?.outstandingMinor ?? 0}
                overdueMinorUnits={summary[curr]?.overdueMinor ?? 0}
                paidThisMonthMinorUnits={summary[curr]?.paidThisMonthMinor ?? 0}
                animate
              />
            ))}
          </div>

          {/* Quick Actions per design.md §12.7: New invoice, Add client, Share link, Invoices */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Link
              to="/app/invoices/new"
              className="p-3.5 rounded-lg bg-surface border border-line hover:border-blue-600 transition-colors flex items-center gap-3 text-ink-900 font-semibold text-xs sm:text-sm shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 group"
            >
              <div className="p-2.5 rounded-full bg-blue-50 text-blue-700 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                <PlusIcon size={18} />
              </div>
              <span className="truncate">New invoice</span>
            </Link>

            <Link
              to="/app/clients"
              className="p-3.5 rounded-lg bg-surface border border-line hover:border-blue-600 transition-colors flex items-center gap-3 text-ink-900 font-semibold text-xs sm:text-sm shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 group"
            >
              <div className="p-2.5 rounded-full bg-surface-2 text-ink-700 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                <UsersIcon size={18} />
              </div>
              <span className="truncate">Add client</span>
            </Link>

            <Link
              to={lastSentActivity ? `/app/invoices/${lastSentActivity.invoiceId}` : '/app/invoices'}
              className="p-3.5 rounded-lg bg-surface border border-line hover:border-blue-600 transition-colors flex items-center gap-3 text-ink-900 font-semibold text-xs sm:text-sm shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 group"
            >
              <div className="p-2.5 rounded-full bg-surface-2 text-ink-700 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                <ShareIcon size={18} />
              </div>
              <span className="truncate">Share link</span>
            </Link>

            <Link
              to="/app/invoices"
              className="p-3.5 rounded-lg bg-surface border border-line hover:border-blue-600 transition-colors flex items-center gap-3 text-ink-900 font-semibold text-xs sm:text-sm shadow-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 group"
            >
              <div className="p-2.5 rounded-full bg-surface-2 text-ink-700 group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
                <FileTextIcon size={18} />
              </div>
              <span className="truncate">All Invoices</span>
            </Link>
          </div>

          {/* Analytics Overview: Line Chart & Histogram/Bar Chart with Shared Timeline */}
          <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
            <RevenueChart
              revenueByCurrency={revenueByCurrency}
              defaultCurrency={business?.defaultCurrency || 'ETB'}
              currenciesInUse={activeCurrencies}
            />
          </Suspense>

          {/* Recent Activity Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold font-heading text-ink-900 tracking-tight">
                Recent Activity
              </h3>
              {activities.length > 0 && (
                <Link to="/app/invoices" className="text-xs font-semibold text-blue-700 hover:underline">
                  View all invoices →
                </Link>
              )}
            </div>

            {activities.length === 0 ? (
              <div className="p-6 rounded-xl bg-surface border border-line text-center text-ink-500 text-sm">
                No recent activity recorded yet.
              </div>
            ) : (
              <div className="rounded-xl bg-surface border border-line divide-y divide-line overflow-hidden shadow-card">
                {activities.map((item) => {
                  const isPaid = item.eventType === 'paid';
                  const isSent = item.eventType === 'sent';

                  return (
                    <div
                      key={`${item.invoiceId}-${item.eventType}-${item.timestamp}`}
                      className="p-4 flex items-center justify-between gap-3 hover:bg-surface-2/50 transition-colors text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Status dot + text per accessibility rule in §12.7 */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              isPaid
                                ? 'bg-green-600'
                                : isSent
                                ? 'bg-blue-600'
                                : 'bg-ink-400'
                            }`}
                            aria-hidden="true"
                          />
                          <span
                            className={`text-xs font-bold uppercase tracking-wider ${
                              isPaid
                                ? 'text-green-700'
                                : isSent
                                ? 'text-blue-700'
                                : 'text-ink-600'
                            }`}
                          >
                            {item.eventType}
                          </span>
                        </div>

                        <div className="min-w-0">
                          <p className="font-semibold text-ink-900 truncate">
                            <span className="font-mono">{item.displayNumber}</span>
                            <span className="text-ink-600 font-normal"> for </span>
                            <span className="text-ink-900">{item.clientName}</span>
                          </p>
                          <p className="text-xs text-ink-500">{formatRelativeTime(item.timestamp)}</p>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-bold text-ink-900 tabular-nums">
                          {formatMoney(item.totalMinor, item.currency)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Truthful First Invoice Onboarding Banner */}
          {hasNoInvoices && (
            <div className="p-6 rounded-xl bg-gradient-to-r from-blue-50 to-surface border border-blue-600/20 space-y-4 shadow-card">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-ink-900">Create your first invoice</h3>
                  <p className="text-sm text-ink-600 max-w-2xl">
                    Get started by drafting your first invoice. You can add client details as you create the invoice or manage your clients separately.
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Link to="/app/clients">
                    <Button variant="secondary" size="sm">
                      Manage clients
                    </Button>
                  </Link>
                  <Link to="/app/invoices/new">
                    <Button variant="primary" size="sm" leftIcon={<PlusIcon size={14} />}>
                      Create invoice
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
