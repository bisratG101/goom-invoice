export function LandingUnderTheHood() {
  return (
    <section id="under-the-hood" className="py-20 sm:py-24 bg-surface text-ink-900 border-b border-line">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-ink-950 border border-slate-800 rounded-2xl p-8 sm:p-12 lg:p-16 text-white shadow-float relative overflow-hidden">
          {/* Subtle background ambient glow */}
          <div
            className="absolute -top-24 -right-24 w-80 h-80 bg-blue-700/10 rounded-full blur-3xl pointer-events-none"
            aria-hidden="true"
          />

          <div className="relative z-10 max-w-4xl">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-400 bg-blue-950/80 border border-blue-800/40 px-3 py-1 rounded-pill mb-4 inline-block">
              Engineered for Correctness
            </span>

            <h2 className="text-3xl sm:text-4xl font-heading font-extrabold tracking-tight text-white mb-4">
              Under the hood
            </h2>

            <p className="text-base sm:text-lg text-slate-300 mb-10 leading-relaxed">
              Every design decision in Goom Invoice prioritizes data integrity, auditability, and absolute tenant security over superficial shortcuts.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
              {/* Pillar 1 */}
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-900/40 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1.5 font-heading">
                    Money stored as integers
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Zero floating-point inaccuracies. All monetary values are processed in integer minor units (`bigint`) with half-up rounding rules.
                  </p>
                </div>
              </div>

              {/* Pillar 2 */}
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-emerald-900/40 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0 mt-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1.5 font-heading">
                    Webhooks verified &amp; de-duplicated
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Timing-safe HMAC-SHA256 signature checks and deterministic idempotency tables guarantee exactly-once payment processing.
                  </p>
                </div>
              </div>

              {/* Pillar 3 */}
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-amber-900/40 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1.5 font-heading">
                    Tenant isolation at database level
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Every SQL query scopes by authenticated `business_id`; PostgreSQL composite foreign keys strictly prohibit cross-tenant links.
                  </p>
                </div>
              </div>

              {/* Pillar 4 */}
              <div className="flex gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-900/40 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0 mt-1">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-1.5 font-heading">
                    Tested end to end
                  </h3>
                  <p className="text-sm text-slate-400 leading-relaxed">
                    Automated unit, integration, and E2E suites rigorously test monetary arithmetic at boundaries, idempotent state transitions, security middlewares, and multi-tenant isolation.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-8 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
              <span className="text-xs text-slate-400">
                Explore the complete source code, test suites, and database migration architecture on GitHub.
              </span>
              <a
                href="https://github.com/bisrat/goom-invoice"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-pill bg-white text-ink-950 font-semibold text-sm hover:bg-slate-100 transition-colors focus-visible:outline-2 focus-visible:outline-white min-h-[44px]"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>View on GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
