import { useState } from 'react';
import { CopyIcon, CheckIcon } from './icons';

export interface CopyButtonProps {
  textToCopy: string;
  label?: string;
  copiedLabel?: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
}

export function CopyButton({
  textToCopy,
  label = 'Copy',
  copiedLabel = 'Copied!',
  variant = 'secondary',
  size = 'sm',
  className = '',
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = textToCopy;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const sizeClasses = size === 'sm' ? 'px-2.5 py-1 text-xs gap-1.5' : 'px-3.5 py-1.5 text-sm gap-2';

  const variantClasses = {
    primary: 'bg-blue-700 text-white hover:bg-blue-600',
    secondary: 'bg-surface border border-border-input text-ink-900 hover:bg-surface-2',
    ghost: 'text-ink-700 hover:text-ink-900 hover:bg-surface-2',
  }[variant];

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`${copied ? copiedLabel : label}: ${textToCopy}`}
      className={`inline-flex items-center font-medium rounded-pill transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${sizeClasses} ${variantClasses} ${className}`}
    >
      {copied ? (
        <CheckIcon size={size === 'sm' ? 14 : 16} className="text-green-700" />
      ) : (
        <CopyIcon size={size === 'sm' ? 14 : 16} />
      )}
      <span>{copied ? copiedLabel : label}</span>
      {/* Screen reader announcement */}
      <span aria-live="polite" className="sr-only">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </button>
  );
}
