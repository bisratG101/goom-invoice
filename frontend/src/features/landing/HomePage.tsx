import { Link } from 'react-router-dom';

export function HomePage() {
  return (
    <main className="min-h-screen bg-surface flex flex-col items-center justify-center p-6 text-center">
      <div className="max-w-md w-full bg-surface-2 border border-line rounded-lg p-8 shadow-card">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-pill bg-blue-50 text-blue-700 text-xs font-medium mb-4">
          <span className="w-2 h-2 rounded-full bg-blue-700 animate-pulse"></span>
          Skeleton Walking
        </div>
        <h1 className="text-3xl font-heading font-bold text-ink-900 tracking-tight mb-2">
          Goom Invoice
        </h1>
        <p className="text-ink-600 text-sm mb-6 leading-relaxed">
          Professional invoicing &amp; automated payments. Designed with exact integer arithmetic, tenant isolation, and verified webhooks.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            to="/health"
            className="inline-flex items-center justify-center px-4 py-2.5 rounded-pill bg-blue-700 text-white font-medium text-sm hover:opacity-95 transition-opacity"
          >
            Check API Health &rarr;
          </Link>
        </div>
      </div>
      <footer className="mt-8 text-ink-500 text-xs">
        Portfolio project &bull; Payments run in test mode
      </footer>
    </main>
  );
}
