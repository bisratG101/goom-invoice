import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { fetchHealth } from '../../lib/api';

export function HealthPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['api-health'],
    queryFn: fetchHealth,
    retry: 1,
  });

  return (
    <main className="min-h-screen bg-surface flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full bg-surface-2 border border-line rounded-lg p-8 shadow-card">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-heading font-bold text-ink-900">API Health Status</h1>
          <Link
            to="/"
            className="text-xs text-ink-600 hover:text-ink-900 underline"
          >
            &larr; Back Home
          </Link>
        </div>

        {isLoading && (
          <div className="py-8 text-center text-ink-600 text-sm">
            <div className="inline-block w-6 h-6 border-2 border-blue-700 border-t-transparent rounded-full animate-spin mb-3"></div>
            <p>Connecting to API...</p>
          </div>
        )}

        {isError && (
          <div className="bg-red-50 border border-line rounded-md p-4 mb-4 text-left">
            <div className="flex items-center gap-2 text-red-500 font-semibold text-sm mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
              API Unavailable
            </div>
            <p className="text-ink-600 text-xs break-words">
              {error instanceof Error ? error.message : 'Failed to reach API endpoint.'}
            </p>
          </div>
        )}

        {data && (
          <div className="bg-surface border border-line rounded-md p-4 mb-4 text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-500 uppercase tracking-wider font-medium">API Server</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pill bg-green-50 text-green-500 text-xs font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500"></span>
                {data.status.toUpperCase()}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-500 uppercase tracking-wider font-medium">Database</span>
              <span className="text-xs font-mono font-medium text-ink-700 bg-surface-2 px-2 py-0.5 rounded border border-line">
                {data.database}
              </span>
            </div>
          </div>
        )}

        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="w-full mt-2 py-2.5 px-4 rounded-pill bg-blue-700 text-white font-medium text-sm hover:opacity-95 transition-opacity disabled:opacity-50"
        >
          {isFetching ? 'Checking...' : 'Refresh Status'}
        </button>
      </div>
    </main>
  );
}
