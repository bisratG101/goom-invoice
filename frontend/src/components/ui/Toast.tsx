import { useEffect } from 'react';
import { CheckIcon, AlertCircleIcon, InfoIcon, CloseIcon } from './icons';

export type ToastType = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastItemProps {
  toast: ToastMessage;
  onDismiss: (id: string) => void;
}

export function ToastItem({ toast, onDismiss }: ToastItemProps) {
  useEffect(() => {
    if (toast.duration && toast.duration > 0) {
      const timer = setTimeout(() => {
        onDismiss(toast.id);
      }, toast.duration);
      return () => clearTimeout(timer);
    }
  }, [toast, onDismiss]);

  const config = {
    success: {
      border: 'border-green-500/30',
      icon: <CheckIcon className="text-green-700" size={18} />,
      bg: 'bg-surface',
    },
    error: {
      border: 'border-red-500/30',
      icon: <AlertCircleIcon className="text-red-700" size={18} />,
      bg: 'bg-surface',
    },
    info: {
      border: 'border-blue-600/30',
      icon: <InfoIcon className="text-blue-700" size={18} />,
      bg: 'bg-surface',
    },
  }[toast.type];

  return (
    <div
      role="status"
      className={`flex items-start gap-3 p-4 rounded-lg shadow-float border ${config.border} ${config.bg} max-w-sm w-full animate-in fade-in slide-in-from-top-2 duration-150 text-left`}
    >
      <div className="shrink-0 mt-0.5">{config.icon}</div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold text-ink-900">{toast.title}</h4>
        {toast.message && (
          <p className="mt-0.5 text-xs text-ink-600">{toast.message}</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss notification"
        className="shrink-0 p-1 rounded text-ink-500 hover:text-ink-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        <CloseIcon size={14} />
      </button>
    </div>
  );
}

export function ToastContainer({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
    >
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onDismiss={onDismiss} />
        </div>
      ))}
    </div>
  );
}
