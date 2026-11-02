import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Logo } from '../ui/Logo';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Avatar } from '../ui/Avatar';
import {
  HomeIcon,
  FileTextIcon,
  UsersIcon,
  SettingsIcon,
  BellIcon,
  PlusIcon,
  LogoutIcon,
} from '../ui/icons';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export function AppLayout({ children }: { children?: ReactNode }) {
  const { user, isDemo, logout } = useAuth();
  const navigate = useNavigate();

  const greeting = `${getTimeGreeting()}, ${user?.name ? user.name.split(' ')[0] : 'there'}`;

  const navLinks = [
    { to: '/app', label: 'Dashboard', icon: <HomeIcon size={18} />, end: true },
    { to: '/app/invoices', label: 'Invoices', icon: <FileTextIcon size={18} /> },
    { to: '/app/clients', label: 'Clients', icon: <UsersIcon size={18} /> },
    { to: '/app/settings', label: 'Settings', icon: <SettingsIcon size={18} /> },
  ];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-surface-2 text-ink-900 flex flex-col md:flex-row antialiased">
      {/* Desktop Sidebar (hidden on mobile) */}
      <aside className="hidden md:flex flex-col w-60 bg-surface border-r border-line p-4 justify-between shrink-0 h-screen sticky top-0">
        <div className="flex flex-col gap-6">
          <div className="px-2 pt-2">
            <Logo to="/app" size="md" />
          </div>

          <nav className="flex flex-col gap-1" aria-label="Main Navigation">
            {navLinks.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 font-semibold'
                      : 'text-ink-600 hover:text-ink-900 hover:bg-surface-2'
                  }`
                }
              >
                <span className="shrink-0">{link.icon}</span>
                <span>{link.label}</span>
              </NavLink>
            ))}
          </nav>
        </div>

        {/* User profile & actions at bottom of desktop sidebar */}
        <div className="pt-4 border-t border-line flex flex-col gap-3">
          {isDemo && (
            <div className="px-2.5 py-1.5 rounded bg-amber-50 text-amber-800 text-xs font-medium border border-amber-500/20">
              Demo Mode Active
            </div>
          )}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar name={user?.name || 'User'} size="sm" />
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-bold text-ink-900 truncate">
                  {user?.name || 'User'}
                </span>
                <span className="text-[11px] text-ink-500 truncate">
                  {user?.email}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              title="Log out"
              aria-label="Log out"
              className="p-1.5 rounded text-ink-500 hover:text-red-700 hover:bg-surface-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <LogoutIcon size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-6">
        {/* Top Header */}
        <header className="h-16 px-4 sm:px-6 bg-surface border-b border-line flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-3">
            {/* Mobile logo on top header */}
            <div className="md:hidden">
              <Logo to="/app" size="sm" />
            </div>
            <h1 className="text-sm sm:text-base font-semibold text-ink-900 truncate hidden sm:block">
              {greeting}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Notification bell placeholder */}
            <button
              type="button"
              aria-label="Notifications"
              title="Notifications"
              className="p-2 rounded-full text-ink-500 hover:text-ink-900 hover:bg-surface-2 border border-line transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <BellIcon size={18} />
            </button>

            {/* Theme Toggle */}
            <ThemeToggle size="md" />

            {/* User avatar on mobile */}
            <div className="md:hidden">
              <Avatar name={user?.name || 'User'} size="sm" />
            </div>
          </div>
        </header>

        {/* Demo banner if active */}
        {isDemo && (
          <div className="bg-amber-50 px-4 py-2 border-b border-amber-500/20 text-xs text-amber-800 text-center font-medium md:hidden">
            Demo Mode Active (Test data)
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar (hidden on desktop) */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-surface border-t border-line flex items-center justify-around px-2 z-40"
        aria-label="Mobile Navigation"
      >
        <NavLink
          to="/app"
          end
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-[11px] ${
              isActive ? 'text-blue-700 font-semibold' : 'text-ink-500'
            }`
          }
        >
          <HomeIcon size={20} />
          <span>Home</span>
        </NavLink>

        <NavLink
          to="/app/invoices"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-[11px] ${
              isActive ? 'text-blue-700 font-semibold' : 'text-ink-500'
            }`
          }
        >
          <FileTextIcon size={20} />
          <span>Invoices</span>
        </NavLink>

        {/* Raised centre button: + New invoice */}
        <NavLink
          to="/app/invoices/new"
          aria-label="Create new invoice"
          className="-mt-5 flex items-center justify-center w-12 h-12 rounded-full bg-blue-700 text-white shadow-float hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 transition-transform active:scale-95"
        >
          <PlusIcon size={24} />
        </NavLink>

        <NavLink
          to="/app/clients"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-[11px] ${
              isActive ? 'text-blue-700 font-semibold' : 'text-ink-500'
            }`
          }
        >
          <UsersIcon size={20} />
          <span>Clients</span>
        </NavLink>

        <NavLink
          to="/app/settings"
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 text-[11px] ${
              isActive ? 'text-blue-700 font-semibold' : 'text-ink-500'
            }`
          }
        >
          <SettingsIcon size={20} />
          <span>Settings</span>
        </NavLink>
      </nav>
    </div>
  );
}
