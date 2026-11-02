import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchConfig } from '../../lib/api';

export function LandingHero() {
  const [demoMode, setDemoMode] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    fetchConfig()
      .then((cfg) => {
        if (active) {
          setDemoMode(cfg.demoMode);
        }
      })
      .catch(() => {
        if (active) {
          setDemoMode(false);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="bg-ink-950 text-white relative overflow-hidden py-16 sm:py-20 lg:py-28 border-b border-slate-900">
      {/* Background ambient gradient glow */}
      <div
        className="absolute top-1/4 -right-40 w-96 h-96 bg-blue-700/10 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-20 -left-20 w-80 h-80 bg-blue-600/5 rounded-full blur-3xl pointer-events-none"
        aria-hidden="true"
      />

      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Headline, subtext, CTAs, test mode notice */}
          <div className="lg:col-span-7 flex flex-col items-start text-left">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-pill bg-blue-900/40 border border-blue-500/30 text-blue-300 text-xs font-medium mb-6">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" aria-hidden="true" />
              <span>Multi-currency invoicing for modern businesses</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-heading font-extrabold tracking-tight text-white leading-[1.08] mb-6">
              Get paid faster. Invoice in seconds, collect in ETB or USD.
            </h1>

            <p className="text-lg sm:text-xl text-slate-400 max-w-xl mb-8 leading-relaxed font-sans">
              Create professional invoices, share a secure link, and watch payments confirm themselves.
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center gap-4 mb-4">
              <Link
                to="/register"
                className="inline-flex items-center justify-center px-6 py-3.5 rounded-pill bg-blue-700 hover:bg-blue-600 text-white font-medium text-base transition-all focus-visible:outline-2 focus-visible:outline-white min-h-[48px] shadow-lg shadow-blue-900/20"
              >
                Create free account
              </Link>

              {/* View live demo: Only rendered when demoMode is true. If false or loading, absent */}
              {demoMode === true && (
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center px-6 py-3.5 rounded-pill border border-slate-700 hover:border-slate-500 text-white hover:bg-slate-900/60 font-medium text-base transition-all focus-visible:outline-2 focus-visible:outline-white min-h-[48px]"
                >
                  View live demo
                </Link>
              )}
            </div>

            <p className="text-xs text-slate-400 font-medium">
              Portfolio project. Payments run in test mode.
            </p>
          </div>

          {/* Right Column: Floating UI cards */}
          <div className="lg:col-span-5 relative flex flex-col gap-5 sm:gap-6 w-full max-w-lg mx-auto lg:max-w-none pt-4 lg:pt-0">
            {/* Floating Card 1: Invoice Card (Illustrative placeholder) */}
            <div className="animate-float-1 bg-slate-900/90 border border-slate-800 rounded-lg p-5 sm:p-6 shadow-float backdrop-blur-md">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="font-heading font-bold text-white text-base tracking-wide">INV-••••</span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-pill bg-blue-900/60 border border-blue-500/40 text-blue-300 text-xs font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400" aria-hidden="true" />
                    Sent
                  </span>
                </div>
                <span className="text-xs font-medium text-slate-300">Due in 14 days</span>
              </div>
              <div className="mb-2">
                <span className="text-xs text-slate-300 block mb-0.5">Billed to</span>
                <span className="text-sm font-semibold text-slate-200">Client Account</span>
              </div>
              <div className="pt-3 border-t border-slate-800/80 flex items-baseline justify-between">
                <span className="text-xs text-slate-300">Amount Due</span>
                <span className="text-xl sm:text-2xl font-bold font-heading text-white tabular-nums tracking-tight">
                  ETB ••,•••.••
                </span>
              </div>
            </div>

            {/* Floating Card 2: Payment Received Notification (Illustrative placeholder) */}
            <div className="animate-float-2 bg-slate-900/95 border border-slate-800 rounded-lg p-4 sm:p-5 shadow-float backdrop-blur-md flex items-center justify-between gap-4 -mt-2 lg:ml-6">
              <div className="flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-full bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-white block">Payment received</span>
                  <span className="text-xs text-slate-300 block font-mono">USD •,•••.•• via Chapa</span>
                </div>
              </div>
              <span className="text-xs font-medium text-emerald-300 bg-emerald-950/80 px-2.5 py-1 rounded-pill border border-emerald-700/60 shrink-0">
                Confirmed
              </span>
            </div>

            {/* Floating Card 3: Two-Currency Balance Card (Illustrative placeholder) */}
            <div className="animate-float-3 bg-slate-900/90 border border-slate-800 rounded-lg p-5 shadow-float backdrop-blur-md -mt-2 lg:mr-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block mb-3">
                Live Balances in Use
              </span>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-950/70 p-3 rounded-md border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-blue-400">ETB</span>
                    <span className="text-[10px] text-slate-400">Outstanding</span>
                  </div>
                  <span className="text-base sm:text-lg font-bold text-white tabular-nums block">
                    ETB •••,•••.••
                  </span>
                </div>
                <div className="bg-slate-950/70 p-3 rounded-md border border-slate-800">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-emerald-400">USD</span>
                    <span className="text-[10px] text-slate-400">Outstanding</span>
                  </div>
                  <span className="text-base sm:text-lg font-bold text-white tabular-nums block">
                    USD •,•••.••
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
