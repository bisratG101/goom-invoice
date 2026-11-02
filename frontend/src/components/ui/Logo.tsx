import { Link } from 'react-router-dom';

interface LogoProps {
  to?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  dark?: boolean;
}

export function Logo({ to = '/', size = 'md', className = '', dark = false }: LogoProps) {
  const sizeClasses = {
    sm: 'text-base gap-1.5',
    md: 'text-xl gap-2',
    lg: 'text-2xl gap-2.5',
  };

  const markSize = {
    sm: 20,
    md: 26,
    lg: 32,
  };

  const textColor = dark ? 'text-white' : 'text-ink-900';
  const subtitleColor = dark ? 'text-slate-400' : 'text-ink-600';

  const content = (
    <span className={`inline-flex items-center font-bold tracking-tight ${textColor} ${sizeClasses[size]} ${className}`}>
      {/* Geometric mark: Two interlocking rounded diamonds in electric blue & slate */}
      <svg
        width={markSize[size]}
        height={markSize[size]}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="7"
          y="7"
          width="18"
          height="18"
          rx="5"
          transform="rotate(45 16 16)"
          fill="#1A5FE0"
          className="transition-colors duration-200"
        />
        <rect
          x="11"
          y="11"
          width="10"
          height="10"
          rx="3"
          transform="rotate(45 16 16)"
          fill="#FFFFFF"
        />
        <circle cx="16" cy="16" r="2.5" fill="#1A5FE0" />
      </svg>
      <span className="font-heading font-extrabold flex items-baseline gap-1">
        <span>Goom</span>
        <span className={`font-semibold ${subtitleColor}`}>Invoice</span>
      </span>
    </span>
  );

  if (to) {
    return (
      <Link to={to} className="inline-flex items-center focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:outline-none">
        {content}
      </Link>
    );
  }

  return content;
}
