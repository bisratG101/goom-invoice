import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Logo } from '../../components/ui/Logo';

export function LandingNav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-ink-950/95 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
        {/* Left: Wordmark */}
        <div className="flex items-center">
          <Logo to="/" size="md" dark />
        </div>

        {/* Center: Navigation Links (Desktop) */}
        <nav aria-label="Main Navigation" className="hidden md:flex items-center gap-8">
          <a
            href="#features"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:rounded-sm py-2"
          >
            Features
          </a>
          <a
            href="#how-it-works"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:rounded-sm py-2"
          >
            How it works
          </a>
          <a
            href="#under-the-hood"
            className="text-sm font-medium text-slate-300 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:rounded-sm py-2"
          >
            Under the hood
          </a>
        </nav>

        {/* Right: Auth Actions (Desktop) */}
        <div className="hidden md:flex items-center gap-4">
          <Link
            to="/login"
            className="text-sm font-medium text-slate-200 hover:text-white transition-colors px-3 py-2 min-h-[44px] inline-flex items-center justify-center focus-visible:outline-2 focus-visible:outline-blue-600 focus-visible:rounded-sm"
          >
            Log in
          </Link>
          <Link
            to="/register"
            className="inline-flex items-center justify-center px-4 py-2 rounded-pill bg-blue-700 hover:bg-blue-600 text-white font-medium text-sm transition-all focus-visible:outline-2 focus-visible:outline-white min-h-[44px] shadow-sm"
          >
            Create account
          </Link>
        </div>

        {/* Mobile menu button */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            className="p-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center focus-visible:outline-2 focus-visible:outline-blue-600"
          >
            <span className="sr-only">Toggle navigation menu</span>
            {mobileMenuOpen ? (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-ink-950 border-b border-slate-800 px-4 pt-2 pb-6 space-y-3">
          <nav aria-label="Mobile Navigation" className="flex flex-col space-y-1">
            <a
              href="#features"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-slate-200 hover:text-white px-3 py-2.5 rounded-md hover:bg-slate-900 transition-colors"
            >
              Features
            </a>
            <a
              href="#how-it-works"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-slate-200 hover:text-white px-3 py-2.5 rounded-md hover:bg-slate-900 transition-colors"
            >
              How it works
            </a>
            <a
              href="#under-the-hood"
              onClick={() => setMobileMenuOpen(false)}
              className="text-base font-medium text-slate-200 hover:text-white px-3 py-2.5 rounded-md hover:bg-slate-900 transition-colors"
            >
              Under the hood
            </a>
          </nav>
          <div className="pt-4 border-t border-slate-800 flex flex-col gap-3">
            <Link
              to="/login"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 text-base font-medium text-slate-200 hover:text-white rounded-md hover:bg-slate-900 transition-colors min-h-[44px] flex items-center justify-center"
            >
              Log in
            </Link>
            <Link
              to="/register"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center py-2.5 rounded-pill bg-blue-700 hover:bg-blue-600 text-white font-medium text-base transition-colors min-h-[44px] flex items-center justify-center shadow-sm"
            >
              Create account
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
