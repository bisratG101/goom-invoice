import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Skeleton } from '../ui/Skeleton';
import { useColdStartNotice } from '../../hooks/useColdStartNotice';
import { InfoIcon } from '../ui/icons';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();
  const showColdStartNotice = useColdStartNotice(isLoading);

  if (isLoading) {
    return (
      <div
        className="min-h-screen bg-surface p-6 flex flex-col gap-4 max-w-4xl mx-auto"
        aria-busy="true"
        aria-label="Loading application"
      >
        {showColdStartNotice && (
          <div
            role="status"
            className="p-3.5 rounded-lg bg-blue-50 border border-blue-600/30 text-blue-700 text-xs flex items-start gap-2.5 animate-in fade-in duration-200"
          >
            <InfoIcon size={18} className="shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong>Server warming up:</strong> Waking up the server, this can take up to 30 seconds.
            </div>
          </div>
        )}
        <Skeleton className="h-12 w-48 rounded-md" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

