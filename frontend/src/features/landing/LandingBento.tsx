export function LandingBento() {
  return (
    <section id="features" className="py-20 sm:py-24 bg-surface text-ink-900 border-b border-line">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-xs font-bold uppercase tracking-wider text-blue-800 bg-blue-100 border border-blue-200 px-3 py-1 rounded-pill mb-3 inline-block">
            Bento Features
          </span>
          <h2 className="text-3xl sm:text-4xl font-heading font-extrabold tracking-tight text-ink-900 mb-4">
            Everything you need to collect payments with confidence
          </h2>
          <p className="text-base sm:text-lg text-ink-600">
            Engineered from first principles for correctness, auditability, and speed.
          </p>
        </div>

        {/* 12-column Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Card 1: Invoices in seconds (span 7) */}
          <div className="md:col-span-7 bg-surface-2 border border-line rounded-lg p-6 sm:p-8 flex flex-col justify-between shadow-card hover:shadow-md transition-shadow">
            <div>
              <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 mb-5">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="text-xl font-heading font-bold text-ink-900 mb-2">Invoices in seconds</h3>
              <p className="text-sm text-ink-600 leading-relaxed mb-6">
                Dynamic line items, real-time integer arithmetic, and automated tax calculations with zero rounding surprises.
              </p>
            </div>
            {/* Mini-visual: Clean invoice items simulation */}
            <div className="bg-surface border border-line rounded-md p-4 space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-ink-500 pb-2 border-b border-line">
                <span>Description</span>
                <span>Qty &times; Price</span>
                <span className="text-right">Line Total</span>
              </div>
              <div className="flex items-center justify-between text-xs text-ink-700 pt-1">
                <span className="font-medium text-ink-900">Full-Stack Development</span>
                <span className="tabular-nums">40 &times; $85.00</span>
                <span className="font-semibold text-ink-900 tabular-nums">$3,400.00</span>
              </div>
              <div className="flex items-center justify-between text-xs text-ink-700 pt-1">
                <span className="font-medium text-ink-900">Cloud Infrastructure Setup</span>
                <span className="tabular-nums">1 &times; $600.00</span>
                <span className="font-semibold text-ink-900 tabular-nums">$600.00</span>
              </div>
              <div className="pt-2 border-t border-line flex justify-between items-center text-xs">
                <span className="text-ink-500 font-medium">Subtotal (Minor Unit Int)</span>
                <span className="text-sm font-bold text-ink-900 tabular-nums">$4,000.00</span>
              </div>
            </div>
          </div>

          {/* Card 2: Pay-by-link (span 5) */}
          <div className="md:col-span-5 bg-surface-2 border border-line rounded-lg p-6 sm:p-8 flex flex-col justify-between shadow-card hover:shadow-md transition-shadow">
            <div>
              <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-5">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              <h3 className="text-xl font-heading font-bold text-ink-900 mb-2">Pay-by-link</h3>
              <p className="text-sm text-ink-600 leading-relaxed mb-6">
                Unguessable 32-byte cryptographic links let clients review and pay without account sign-ups.
              </p>
            </div>
            {/* Mini-visual: Unguessable link card */}
            <div className="bg-surface border border-line rounded-md p-3.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 overflow-hidden">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" aria-hidden="true" />
                <span className="text-xs font-mono text-ink-600 truncate">
                  goominvoice.com/i/k7x9...3mQp
                </span>
              </div>
              <span className="text-[11px] font-semibold text-ink-700 bg-surface-2 border border-line px-2 py-1 rounded-sm shrink-0">
                Encrypted Link
              </span>
            </div>
          </div>

          {/* Card 3: Confirmed automatically (span 5) */}
          <div className="md:col-span-5 bg-surface-2 border border-line rounded-lg p-6 sm:p-8 flex flex-col justify-between shadow-card hover:shadow-md transition-shadow">
            <div>
              <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 mb-5">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-heading font-bold text-ink-900 mb-2">Confirmed automatically</h3>
              <p className="text-sm text-ink-600 leading-relaxed mb-6">
                Real-time webhook pipeline with timing-safe HMAC checks marks invoices paid instantly.
              </p>
            </div>
            {/* Mini-visual: Webhook timeline */}
            <div className="bg-surface border border-line rounded-md p-3.5 space-y-2">
              <div className="flex items-center gap-2.5 text-xs">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
                  &#10003;
                </span>
                <span className="font-mono text-ink-700">HMAC-SHA256 signature verified</span>
              </div>
              <div className="flex items-center gap-2.5 text-xs">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
                  &#10003;
                </span>
                <span className="font-mono text-ink-700">Idempotency deduplicated (200 OK)</span>
              </div>
            </div>
          </div>

          {/* Card 4: ETB and USD side by side (span 7) */}
          <div className="md:col-span-7 bg-surface-2 border border-line rounded-lg p-6 sm:p-8 flex flex-col justify-between shadow-card hover:shadow-md transition-shadow">
            <div>
              <div className="w-12 h-12 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 mb-5">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-heading font-bold text-ink-900 mb-2">ETB and USD side by side</h3>
              <p className="text-sm text-ink-600 leading-relaxed mb-6">
                Track local and international cash flow with dedicated per-currency metrics that never combine balances.
              </p>
            </div>
            {/* Mini-visual: Dual currency cards */}
            <div className="grid grid-cols-2 gap-3 bg-surface p-3.5 rounded-md border border-line">
              <div className="p-2.5 rounded bg-surface-2 border border-line">
                <span className="text-[10px] font-bold text-blue-800 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded">ETB Stream</span>
                <span className="text-sm sm:text-base font-bold text-ink-900 tabular-nums block mt-1.5">ETB 185,000.00</span>
                <span className="text-[10px] text-ink-600">Collected this month</span>
              </div>
              <div className="p-2.5 rounded bg-surface-2 border border-line">
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-1.5 py-0.5 rounded">USD Stream</span>
                <span className="text-sm sm:text-base font-bold text-ink-900 tabular-nums block mt-1.5">$5,250.00</span>
                <span className="text-[10px] text-ink-600">Collected this month</span>
              </div>
            </div>
          </div>

          {/* Card 5: PDF invoices (span 6) */}
          <div className="md:col-span-6 bg-surface-2 border border-line rounded-lg p-6 sm:p-8 flex flex-col justify-between shadow-card hover:shadow-md transition-shadow">
            <div>
              <div className="w-12 h-12 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700 mb-5">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-heading font-bold text-ink-900 mb-2">PDF invoices</h3>
              <p className="text-sm text-ink-600 leading-relaxed mb-6">
                Server-generated PDFs with crisp typography and Ethiopic Unicode support ready for download or print.
              </p>
            </div>
            {/* Mini-visual: PDF Badge */}
            <div className="bg-surface border border-line rounded-md p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-red-50 text-red-700 flex items-center justify-center font-bold text-xs">
                  PDF
                </div>
                <div>
                  <span className="text-xs font-semibold text-ink-900 block">INV-0007.pdf</span>
                  <span className="text-[10px] text-ink-500 block font-mono">Noto Sans Ethiopic enabled</span>
                </div>
              </div>
              <span className="text-xs font-semibold text-ink-700">Ready</span>
            </div>
          </div>

          {/* Card 6: Your data stays yours (span 6) */}
          <div className="md:col-span-6 bg-surface-2 border border-line rounded-lg p-6 sm:p-8 flex flex-col justify-between shadow-card hover:shadow-md transition-shadow">
            <div>
              <div className="w-12 h-12 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 mb-5">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <h3 className="text-xl font-heading font-bold text-ink-900 mb-2">Your data stays yours</h3>
              <p className="text-sm text-ink-600 leading-relaxed mb-6">
                Multi-tenant isolation enforced by SQL query scoping and database composite foreign keys.
              </p>
            </div>
            {/* Mini-visual: Tenant isolation indicator */}
            <div className="bg-surface border border-line rounded-md p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
                <span className="text-xs font-mono text-ink-700">WHERE business_id = owner_id</span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded">
                Database Enforced
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
