import React from 'react';
import { Logo } from '../../components/ui/Logo';
import { ThemeToggle } from '../../components/ui/ThemeToggle';
import { StatusChip } from '../../components/ui/StatusChip';
import { CheckIcon } from '../../components/ui/icons';

interface AuthLayoutProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-surface text-ink-900 antialiased">
      {/* Left Visual Panel (Desktop only: dark base --ink-950) */}
      <div className="hidden md:flex flex-col justify-between w-1/2 lg:w-5/12 bg-ink-950 text-white p-8 lg:p-12 relative overflow-hidden select-none">
        {/* Subtle background glow */}
        <div
          className="absolute -top-32 -left-32 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -bottom-32 -right-32 w-96 h-96 bg-blue-700/15 rounded-full blur-3xl pointer-events-none"
          aria-hidden="true"
        />

        {/* Top brand header */}
        <div className="relative z-10">
          <Logo to="/" size="md" />
        </div>

        {/* Center: floating visual demo cards */}
        <div className="relative z-10 my-auto py-12 flex flex-col gap-6 max-w-sm mx-auto w-full">
          {/* Card 1: Floating Invoice Card */}
          <div className="rounded-xl p-4 bg-surface-2/10 backdrop-blur-md border border-white/10 shadow-float transform transition-transform duration-700 hover:scale-[1.02] motion-safe:animate-[float_7s_ease-in-out_infinite]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-mono font-semibold text-blue-50">INV-0007</span>
              <StatusChip status="sent" size="sm" />
            </div>
            <div className="text-sm font-semibold text-white">Abebe Bikila</div>
            <div className="mt-2 text-xl font-bold font-heading tabular-nums text-white">
              ETB 34,500.00
            </div>
          </div>

          {/* Card 2: Floating Payment Notification */}
          <div className="rounded-xl p-3.5 bg-surface-2/10 backdrop-blur-md border border-white/10 shadow-float flex items-center gap-3 transform -translate-x-3 transition-transform duration-700 hover:scale-[1.02] motion-safe:animate-[float_8s_ease-in-out_infinite_1.5s]">
            <div className="w-8 h-8 rounded-full bg-green-500/20 text-green-700 flex items-center justify-center shrink-0">
              <CheckIcon size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-white">Payment received</div>
              <div className="text-[11px] text-white/60">ETB 34,500.00 • Just now</div>
            </div>
          </div>

          {/* Card 3: Floating Multi-Currency Balance Card */}
          <div className="rounded-xl p-4 bg-surface-2/10 backdrop-blur-md border border-white/10 shadow-float transform translate-x-3 transition-transform duration-700 hover:scale-[1.02] motion-safe:animate-[float_6s_ease-in-out_infinite_3s]">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
              Active Balances
            </span>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <span className="text-[10px] text-white/50 block">ETB</span>
                <span className="text-sm font-bold font-heading tabular-nums text-white">
                  34,500.00
                </span>
              </div>
              <div className="border-l border-white/10 pl-3">
                <span className="text-[10px] text-white/50 block">USD</span>
                <span className="text-sm font-bold font-heading tabular-nums text-white">
                  1,850.00
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom copy */}
        <div className="relative z-10 text-xs text-white/60 leading-relaxed">
          <p className="font-medium text-white/80">Built for correctness.</p>
          <p>Dual-currency invoicing in ETB and USD with automatic payment reconciliation.</p>
        </div>
      </div>

      {/* Right Form Panel */}
      <div className="flex-1 flex flex-col justify-between p-6 sm:p-10 lg:p-16 min-h-screen max-w-xl mx-auto w-full">
        {/* Header with mobile logo and theme toggle */}
        <div className="flex items-center justify-between pb-6 sm:pb-8">
          <div className="md:hidden">
            <Logo to="/" size="sm" />
          </div>
          <div className="hidden md:block" />
          <ThemeToggle size="md" />
        </div>

        {/* Form container */}
        <div className="w-full my-auto py-4">
          <div className="mb-6 sm:mb-8 text-left">
            <h1 className="text-2xl sm:text-3xl font-extrabold font-heading text-ink-900 tracking-tight">
              {title}
            </h1>
            <p className="mt-2 text-sm text-ink-500">{subtitle}</p>
          </div>

          {children}
        </div>

        {/* Footer info */}
        <div className="pt-6 border-t border-line text-center text-xs text-ink-500">
          Portfolio project • Payments run in test mode
        </div>
      </div>
    </div>
  );
}
