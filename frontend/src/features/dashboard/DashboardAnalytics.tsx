import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PillTabs } from '../../components/ui/Tabs';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { AlertCircleIcon, RefreshCwIcon } from '../../components/ui/icons';
import { fetchDashboardAnalytics, AnalyticsPeriod } from '../../lib/api';
import { RevenueTrendLineChart } from './RevenueTrendLineChart';
import { InvoicedVsCollectedBarChart } from './InvoicedVsCollectedBarChart';

export interface DashboardAnalyticsProps {
  defaultCurrency?: 'ETB' | 'USD';
  currenciesInUse?: Array<'ETB' | 'USD'>;
}

const TIMELINE_OPTIONS: Array<{ id: AnalyticsPeriod; label: string; fullLabel: string }> = [
  { id: '7d', label: '7D', fullLabel: 'Last 7 days' },
  { id: '30d', label: '30D', fullLabel: 'Last 30 days' },
  { id: '3m', label: '3M', fullLabel: 'Last 3 months' },
  { id: '6m', label: '6M', fullLabel: 'Last 6 months' },
  { id: '12m', label: '12M', fullLabel: 'Last 12 months' },
  { id: 'all', label: 'All time', fullLabel: 'All time' },
];

export function DashboardAnalytics({
  defaultCurrency = 'ETB',
  currenciesInUse,
}: DashboardAnalyticsProps) {
  const [timeline, setTimeline] = useState<AnalyticsPeriod>('6m');
  const [selectedCurrency, setSelectedCurrency] = useState<'ETB' | 'USD'>(defaultCurrency);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['dashboard', 'analytics', timeline],
    queryFn: () => fetchDashboardAnalytics(timeline),
    staleTime: 30000,
  });

  const availableCurrencies = currenciesInUse && currenciesInUse.length > 0
    ? currenciesInUse
    : (['ETB', 'USD'] as const);

  const currencyTabs = availableCurrencies.map((c) => ({
    id: c,
    label: c,
  }));

  const activeOption = TIMELINE_OPTIONS.find((opt) => opt.id === timeline) || TIMELINE_OPTIONS[3];

  const currentSeries = data?.series[selectedCurrency] || [];
  const currentTotals = data?.totals[selectedCurrency] || {
    totalPaidMinor: 0,
    totalPaidCount: 0,
    totalInvoicedMinor: 0,
    totalInvoicedCount: 0,
    collectionRatePercent: 0,
  };

  return (
    <div className="space-y-4 text-left">
      {/* Shared Control Bar: Section Title, Timeline Selector, and Currency Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-xl bg-surface border border-line shadow-card">
        <div>
          <h2 className="text-base sm:text-lg font-bold font-heading text-ink-900 tracking-tight">
            Financial Analytics
          </h2>
          <p className="text-xs text-ink-500 mt-0.5">
            Showing metrics for <span className="font-semibold text-ink-700">{activeOption.fullLabel}</span> in{' '}
            <span className="font-semibold text-ink-700">{selectedCurrency}</span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Timeline Selector */}
          <div
            role="group"
            aria-label="Analytics timeline period"
            className="inline-flex items-center p-1 rounded-pill bg-surface-2 border border-line overflow-x-auto text-xs"
          >
            {TIMELINE_OPTIONS.map((opt) => {
              const isSelected = opt.id === timeline;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTimeline(opt.id)}
                  aria-pressed={isSelected}
                  className={`px-3 py-1.5 rounded-pill font-semibold transition-all whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    isSelected
                      ? 'bg-surface text-ink-900 shadow-sm'
                      : 'text-ink-600 hover:text-ink-900'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Currency Switcher */}
          {currencyTabs.length > 1 && (
            <PillTabs
              items={currencyTabs}
              activeId={selectedCurrency}
              onChange={(id) => setSelectedCurrency(id as 'ETB' | 'USD')}
            />
          )}
        </div>
      </div>

      {/* Error state with retry */}
      {isError && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-500/30 text-red-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm animate-in fade-in"
        >
          <div className="flex items-center gap-2.5">
            <AlertCircleIcon size={20} className="shrink-0" />
            <span>Could not load analytics data for the selected period.</span>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => refetch()}
            leftIcon={<RefreshCwIcon size={14} className={isFetching ? 'animate-spin' : ''} />}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Loading Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" aria-busy="true">
          <Skeleton className="h-80 w-full rounded-xl" />
          <Skeleton className="h-80 w-full rounded-xl" />
        </div>
      ) : (
        /* The Two Distinct Charts in a Responsive Grid */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Chart 1: Revenue Trend (Line Chart) */}
          <RevenueTrendLineChart
            series={currentSeries}
            totals={currentTotals}
            currency={selectedCurrency}
            periodLabel={activeOption.fullLabel.toLowerCase()}
          />

          {/* Chart 2: Invoiced vs Collected (Histogram / Bar Chart) */}
          <InvoicedVsCollectedBarChart
            series={currentSeries}
            totals={currentTotals}
            currency={selectedCurrency}
            periodLabel={activeOption.fullLabel.toLowerCase()}
          />
        </div>
      )}
    </div>
  );
}

export default DashboardAnalytics;
