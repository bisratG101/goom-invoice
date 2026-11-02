import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { AnalyticsBucketPoint, AnalyticsTotals } from '../../lib/api';

export interface RevenueTrendLineChartProps {
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

export function RevenueTrendLineChart({
  series,
  totals,
  currency,
  periodLabel,
}: RevenueTrendLineChartProps) {
  const chartData = useMemo(() => {
    return series.map((pt) => ({
      key: pt.key,
      label: pt.label,
      revenue: pt.paidMinor / 100, // in major units for scale
      paidMinor: pt.paidMinor,
      paidCount: pt.paidCount,
      currency,
    }));
  }, [series, currency]);

  const hasData = useMemo(() => {
    return totals.totalPaidMinor > 0 || series.some((pt) => pt.paidMinor > 0);
  }, [totals, series]);

  return (
    <div className="p-5 rounded-xl bg-surface border border-line shadow-card text-left flex flex-col justify-between space-y-4">
      {/* Header with Title and Headline Metric */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" aria-hidden="true" />
            <h3 className="text-base font-bold font-heading text-ink-900 tracking-tight">
              Revenue Trend
            </h3>
          </div>
          <p className="text-xs text-ink-500 mt-0.5">
            Realized cash collection velocity over {periodLabel}
          </p>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-xs font-medium text-ink-500">Total Collected</div>
          <div className="text-lg sm:text-xl font-bold font-heading text-blue-700 tabular-nums">
            {currency} {formatMinor(totals.totalPaidMinor)}
          </div>
          <div className="text-[11px] text-ink-500">
            {totals.totalPaidCount} {totals.totalPaidCount === 1 ? 'invoice' : 'invoices'} settled
          </div>
        </div>
      </div>

      {/* Chart or Empty State */}
      {!hasData ? (
        <div className="h-64 flex flex-col items-center justify-center text-center p-6 bg-surface-2/40 rounded-lg border border-dashed border-line">
          <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-2 font-bold text-sm">
            {currency}
          </div>
          <p className="text-sm font-semibold text-ink-700">No revenue collected yet</p>
          <p className="text-xs text-ink-500 mt-1 max-w-xs">
            No payments were recorded for {currency} in this timeframe. Once client invoices are paid, your revenue trajectory will render here.
          </p>
        </div>
      ) : (
        <div className="h-64 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="revenueTrendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--blue-700, #2563eb)" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="var(--blue-700, #2563eb)" stopOpacity={0.0} />
                </linearGradient>
              </defs>
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
                cursor={{ stroke: 'var(--line)', strokeWidth: 1.5, strokeDasharray: '3 3' }}
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="p-3 rounded-lg bg-surface border border-line shadow-lg text-xs space-y-1">
                        <p className="font-semibold text-ink-900 border-b border-line pb-1">
                          {data.label}
                        </p>
                        <div className="flex items-center justify-between gap-4 pt-1">
                          <span className="text-ink-500">Collected:</span>
                          <span className="font-bold text-blue-700">
                            {data.currency} {formatMinor(data.paidMinor)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-4 text-[11px] text-ink-500">
                          <span>Invoices settled:</span>
                          <span className="font-medium text-ink-700">{data.paidCount}</span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="var(--blue-700, #2563eb)"
                strokeWidth={2.5}
                fill="url(#revenueTrendGrad)"
                activeDot={{
                  r: 5,
                  stroke: 'var(--blue-700, #2563eb)',
                  strokeWidth: 2,
                  fill: 'var(--surface)',
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
