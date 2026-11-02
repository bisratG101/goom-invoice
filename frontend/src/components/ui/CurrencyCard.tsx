import { Card } from './Card';
import { useCountUp } from '../../hooks/useCountUp';

export interface CurrencyCardProps {
  currency: 'ETB' | 'USD';
  outstandingMinorUnits: number;
  overdueMinorUnits: number;
  paidThisMonthMinorUnits: number;
  className?: string;
  animate?: boolean;
}

function formatMoney(minorUnits: number, currency: 'ETB' | 'USD'): string {
  const amount = (minorUnits / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${amount}`;
}

export function CurrencyCard({
  currency,
  outstandingMinorUnits,
  overdueMinorUnits,
  paidThisMonthMinorUnits,
  className = '',
  animate = false,
}: CurrencyCardProps) {
  const animatedOutstanding = useCountUp(outstandingMinorUnits, animate ? 500 : 0);
  const animatedOverdue = useCountUp(overdueMinorUnits, animate ? 500 : 0);
  const animatedPaid = useCountUp(paidThisMonthMinorUnits, animate ? 500 : 0);

  const displayOutstanding = animate ? animatedOutstanding : outstandingMinorUnits;
  const displayOverdue = animate ? animatedOverdue : overdueMinorUnits;
  const displayPaid = animate ? animatedPaid : paidThisMonthMinorUnits;

  return (
    <Card className={`relative overflow-hidden flex flex-col justify-between gap-4 border-l-4 ${
      currency === 'ETB' ? 'border-l-blue-600' : 'border-l-green-500'
    } ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">
          {`Outstanding (${currency})`}
        </span>
        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-surface-2 text-ink-700 border border-line">
          {currency}
        </span>
      </div>

      <div>
        <div className="text-2xl sm:text-3xl font-extrabold font-heading text-ink-900 tabular-nums tracking-tight">
          {formatMoney(displayOutstanding, currency)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-line/60">
        <div>
          <span className="block text-[11px] font-medium text-ink-500">Overdue</span>
          <span className="text-sm font-bold text-red-700 tabular-nums">
            {formatMoney(displayOverdue, currency)}
          </span>
        </div>
        <div>
          <span className="block text-[11px] font-medium text-ink-500">Paid this month</span>
          <span className="text-sm font-bold text-green-700 tabular-nums">
            {formatMoney(displayPaid, currency)}
          </span>
        </div>
      </div>
    </Card>
  );
}
