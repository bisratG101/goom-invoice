import { useTheme } from '../../context/ThemeContext';
import { SunIcon, MoonIcon } from './icons';

interface ThemeToggleProps {
  className?: string;
  size?: 'sm' | 'md';
}

export function ThemeToggle({ className = '', size = 'md' }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';

  const sizeClasses = size === 'sm' ? 'p-1.5' : 'p-2';
  const iconSize = size === 'sm' ? 16 : 18;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      className={`inline-flex items-center justify-center rounded-full text-ink-600 hover:text-ink-900 bg-surface-2 hover:bg-surface border border-line transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${sizeClasses} ${className}`}
    >
      {isDark ? <SunIcon size={iconSize} /> : <MoonIcon size={iconSize} />}
    </button>
  );
}
