import { Link } from 'react-router-dom';
import { Logo } from '../../components/ui/Logo';

export function LandingFooter() {
  return (
    <footer className="bg-ink-950 text-white border-t border-slate-900 py-16">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
          {/* Brand info */}
          <div className="md:col-span-1">
            <div className="mb-4">
              <Logo to="/" size="md" dark />
            </div>
            <p className="text-sm text-slate-400 leading-relaxed mb-4">
              Modern invoicing and automated payment collection built for freelancers and growing businesses.
            </p>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-pill bg-slate-900 border border-slate-800 text-[11px] font-medium text-slate-300">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
              Chapa Sandbox &bull; Simulated Provider
            </span>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-4 font-heading">
              Product
            </h3>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li>
                <a href="#features" className="hover:text-white transition-colors py-1 inline-block">
                  Features
                </a>
              </li>
              <li>
                <a href="#how-it-works" className="hover:text-white transition-colors py-1 inline-block">
                  How it works
                </a>
              </li>
              <li>
                <a href="#under-the-hood" className="hover:text-white transition-colors py-1 inline-block">
                  Under the hood
                </a>
              </li>
              <li>
                <Link to="/demo" className="hover:text-white transition-colors py-1 inline-block">
                  Live Demo
                </Link>
              </li>
            </ul>
          </div>

          {/* Developers */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-4 font-heading">
              Developers
            </h3>
            <ul className="space-y-2.5 text-sm text-slate-400">
              <li>
                <a
                  href="https://github.com/bisrat/goom-invoice"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors py-1 inline-block"
                >
                  GitHub Repository
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/bisrat/goom-invoice#readme"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white transition-colors py-1 inline-block"
                >
                  README &amp; QA Script
                </a>
              </li>
              <li>
                <Link to="/health" className="hover:text-white transition-colors py-1 inline-block">
                  System Health API
                </Link>
              </li>
              <li>
                <Link to="/styleguide" className="hover:text-white transition-colors py-1 inline-block">
                  Design Tokens Styleguide
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal / Project Note */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-4 font-heading">
              Honesty Rule
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Portfolio project. Payments run in <strong>test mode</strong> (Chapa sandbox &amp; simulated provider).
              No real money moves.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              No invented user statistics, no fake testimonials, no mock logos.
            </p>
          </div>
        </div>

        {/* Bottom copyright and disclaimer */}
        <div className="pt-8 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
          <p>&copy; {new Date().getFullYear()} Goom Invoice. Built for correctness.</p>
          <p>Portfolio project &bull; Payments run in test mode.</p>
        </div>
      </div>
    </footer>
  );
}
