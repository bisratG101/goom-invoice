import { useMemo } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { AnalyticsBucketPoint, AnalyticsTotals } from '../../lib/api';

export interface InvoicedVsCollectedBarChartProps {
  series: AnalyticsBucketPoint[];
  totals: AnalyticsTotals;
  currency: 'ETB' | 'USD';
  periodLabel: string;
}

function formatMinor(minor: number): string {
  return (minor / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAxis(val: number): string {
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(0)}k`;
  return String(val);
}

export function InvoicedVsCollectedBarChart({
  series,
  totals,
  currency,
  periodLabel,
}: InvoicedVsCollectedBarChartProps) {
  const chartData = useMemo(() => {
    return series.map((pt) => ({
      key: pt.key,
      label: pt.label,
      invoiced: pt.invoicedMinor / 100, // converted to major units for bar height
      collected: pt.paidMinor / 100,
      invoicedMinor: pt.invoicedMinor,
      invoicedCount: pt.invoicedCount,
      paidMinor: pt.paidMinor,
      paidCount: pt.paidCount,
      currency,
    }));
  }, [series, currency]);

  const hasData = useMemo(() => {
    return (
      totals.totalInvoicedMinor > 0 ||
      totals.totalPaidMinor > 0 ||
      series.some((pt) => pt.invoicedMinor > 0 || pt.paidMinor > 0)
    );
  }, [totals, series]);

  return (
    <div className="p-5 rounded-xl bg-surface border border-line shadow-card text-left flex flex-col justify-between space-y-4">
      {/* Header with Title and Collection Rate Badge */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" aria-hidden="true" />
            <h3 className="text-base font-bold font-heading text-ink-900 tracking-tight">
              Invoiced vs Collected
            </h3>
          </div>
          <p className="text-xs text-ink-500 mt-0.5">
            Billing volume against realized cash collection over {periodLabel}
          </p>
        </div>

        <div className="text-left sm:text-right">
          <div className="flex items-center sm:justify-end gap-2">
            <span className="text-xs font-medium text-ink-500">Realization Rate:</span>
            <span
              className={`px-2 py-0.5 rounded-pill text-xs font-bold ${
                totals.collectionRatePercent >= 80
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : totals.collectionRatePercent >= 50
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {totals.collectionRatePercent.toFixed(1)}%
            </span>
          </div>
          <div className="text-sm font-semibold text-ink-800 tabular-nums mt-0.5">
            {currency} {formatMinor(totals.totalInvoicedMinor)} billed
          </div>
        </div>
      </div>

      {/* Chart or Empty State */}
      {!hasData ? (
        <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-surface-2/40 rounded-lg border border-dashed border-line">
          <div className="w-10 h-10 rounded-full bg-surface-2 text-ink-500 flex items-center justify-center mb-2 font-bold text-sm">
            📊
          </div>
          <p className="text-sm font-semibold text-ink-700">No invoicing activity yet</p>
          <p className="text-xs text-ink-500 mt-1 max-w-xs">
            No invoices were issued or settled in {currency} during this timeframe. Once invoices are sent, billing comparisons will appear here.
          </p>
        </div>
      ) : (
        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
              barGap={3}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--line)" />
              <XAxis
                dataKey="label"
                stroke="var(--ink-500)"
                fontSize={11}
                tickLine={false}
                axisLine={{ stroke: 'var(--line)' }}
              />
              <YAxis
                stroke="var(--ink-500)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatAxis}
              />
              <Tooltip
                cursor={{ fill: 'var(--surface-2)', opacity: 0.4 }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    const diffMinor = data.invoicedMinor - data.paidMinor;
                    return (
                      <div className="p-3 rounded-lg bg-surface border border-line shadow-lg text-xs space-y-1.5 min-w-[180px]">
                        <p className="font-semibold text-ink-900 border-b border-line pb-1">
                          {data.label}
                        </p>
                        <div className="space-y-1 pt-0.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-1.5 text-ink-600">
                              <span className="w-2 h-2 rounded-sm bg-slate-500 inline-block" />
                              Invoiced:
                            </span>
                            <span className="font-semibold text-ink-900 tabular-nums">
                              {data.currency} {formatMinor(data.invoicedMinor)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-[11px] text-ink-500 pl-3.5">
                            <span>Count:</span>
                            <span>{data.invoicedCount} invoices</span>
                          </div>

                          <div className="flex items-center justify-between gap-3 pt-1 border-t border-line/60">
                            <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                              <span className="w-2 h-2 rounded-sm bg-emerald-500 inline-block" />
                              Collected:
                            </span>
                            <span className="font-bold text-emerald-700 tabular-nums">
                              {data.currency} {formatMinor(data.paidMinor)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3 text-[11px] text-ink-500 pl-3.5">
                            <span>Count:</span>
                            <span>{data.paidCount} paid</span>
                          </div>

                          {diffMinor > 0 && (
                            <div className="flex items-center justify-between gap-3 pt-1 border-t border-line/60 text-[11px] text-amber-700">
                              <span>Uncollected:</span>
                              <span className="font-medium tabular-nums">
                                {data.currency} {formatMinor(diffMinor)}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ paddingBottom: '8px', fontSize: '11px' }}
                formatter={(value) => (
                  <span className="text-ink-600 font-medium capitalize">{value}</span>
                )}
              />
              <Bar
                name="Invoiced"
                dataKey="invoiced"
                fill="#94a3b8"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
              <Bar
                name="Collected"
                dataKey="collected"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                maxBarSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
