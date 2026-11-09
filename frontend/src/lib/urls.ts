/**
 * Canonical generator for public invoice checkout URLs.
 * Follows Goom Invoice public link requirements:
 * 1. In production, always uses the configured frontend application URL
 *    (import.meta.env.VITE_APP_URL || 'https://goom-invoice.vercel.app').
 * 2. If VITE_APP_URL is set to localhost or 127.0.0.1 in production, safely rejects and falls back to canonical domain.
 * 3. In local development, uses localhost.
 * 4. Never derives production public URLs from window.location.
 * 5. Ensures WhatsApp, Telegram, CopyButton, and Payer View preview all use the exact same canonical URL.
 * 6. Preserves the unguessable public invoice token intact.
 */
export const DEFAULT_PRODUCTION_APP_URL = 'https://goom-invoice.vercel.app';

export function getPublicInvoiceUrl(
  publicToken: string,
  backendPublicUrl?: string | null,
  options?: { isProd?: boolean; configuredUrl?: string }
): string {
  const isProd =
    options?.isProd ??
    (import.meta.env.PROD || import.meta.env.MODE === 'production');

  const rawConfiguredUrl =
    options?.configuredUrl ??
    (import.meta.env.VITE_APP_URL as string | undefined);

  if (isProd) {
    let base =
      rawConfiguredUrl && rawConfiguredUrl.trim() !== ''
        ? rawConfiguredUrl.trim()
        : DEFAULT_PRODUCTION_APP_URL;

    // Reject localhost or 127.0.0.1 in production and fall back to canonical production URL
    if (/localhost|127\.0\.0\.1/i.test(base)) {
      base = DEFAULT_PRODUCTION_APP_URL;
    }

    base = base.replace(/\/+$/, '');
    return `${base}/i/${publicToken}`;
  }

  // Local development fallback
  if (backendPublicUrl && backendPublicUrl.trim() !== '') {
    return backendPublicUrl;
  }

  return `http://localhost:5173/i/${publicToken}`;
}
