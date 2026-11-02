export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void' | 'pending';

interface StatusChipProps {
  status: InvoiceStatus;
  label?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const statusConfig: Record<
  InvoiceStatus,
  {
    defaultLabel: string;
    containerClass: string;
    dotClass: string;
    textClass: string;
  }
> = {
  paid: {
    defaultLabel: 'Paid',
    containerClass: 'bg-green-50 border border-green-500/20',
    dotClass: 'bg-green-500',
    textClass: 'text-green-700 font-medium',
  },
  sent: {
    defaultLabel: 'Sent',
    containerClass: 'bg-blue-50 border border-blue-600/20',
    dotClass: 'bg-blue-600',
    textClass: 'text-blue-700 font-medium',
  },
  pending: {
    defaultLabel: 'Pending',
    containerClass: 'bg-amber-50 border border-amber-500/20',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-800 font-medium',
  },
  overdue: {
    defaultLabel: 'Overdue',
    containerClass: 'bg-red-50 border border-red-500/20',
    dotClass: 'bg-red-500',
    textClass: 'text-red-700 font-medium',
  },
  draft: {
    defaultLabel: 'Draft',
    containerClass: 'bg-surface-2 border border-line',
    dotClass: 'bg-ink-500',
    textClass: 'text-ink-700 font-medium',
  },
  void: {
    defaultLabel: 'Void',
    containerClass: 'bg-surface-2 border border-line',
    dotClass: 'bg-ink-500',
    textClass: 'text-ink-700 line-through opacity-80 font-medium',
  },
};

/**
 * StatusChip represents invoice status.
 * Per design.md & WCAG guidelines:
 * - Every chip ALWAYS displays both a colored dot AND clear textual label (never color alone).
 * - Light-theme text colors use darkened tokens (--green-700, --amber-800, --red-700, --blue-700)
 *   to ensure >= 4.5:1 contrast against tinted backgrounds.
 */
export function StatusChip({ status, label, size = 'md', className = '' }: StatusChipProps) {
  const config = statusConfig[status] || statusConfig.draft;
  const displayText = label || config.defaultLabel;

  const sizeClasses =
    size === 'sm'
      ? 'px-2 py-0.5 text-xs gap-1.5'
      : 'px-2.5 py-1 text-xs sm:text-sm gap-2';

  const dotSizeClasses = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <span
      className={`inline-flex items-center rounded-full ${sizeClasses} ${config.containerClass} ${className}`}
      role="status"
    >
      <span
        className={`rounded-full shrink-0 ${dotSizeClasses} ${config.dotClass}`}
        aria-hidden="true"
      />
      <span className={config.textClass}>{displayText}</span>
    </span>
  );
}
