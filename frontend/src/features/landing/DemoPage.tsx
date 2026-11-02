import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { fetchConfig } from '../../lib/api';

export function DemoPage() {
  const { loginDemo, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function handleDemo() {
      try {
        const config = await fetchConfig();
        if (!config.demoMode) {
          navigate('/', { replace: true });
          return;
        }

        if (isAuthenticated) {
          navigate('/app', { replace: true });
          return;
        }

        await loginDemo();
        if (active) {
          navigate('/app', { replace: true });
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || 'Failed to start demo session');
        }
      }
    }

    handleDemo();
    return () => {
      active = false;
    };
  }, [loginDemo, isAuthenticated, navigate]);

  if (error) {
    return (
      <main className="min-h-screen bg-ink-950 flex flex-col items-center justify-center p-6 text-center text-white">
        <div className="bg-red-950/40 border border-red-500/30 text-red-200 p-8 rounded-lg max-w-md w-full shadow-card">
          <h1 className="text-xl font-heading font-bold mb-3 text-white">Demo Mode Unavailable</h1>
          <p className="text-sm mb-6 text-ink-500">{error}</p>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="w-full inline-flex items-center justify-center px-5 py-3 rounded-pill bg-blue-700 text-white font-medium text-sm hover:opacity-95 transition-opacity min-h-[44px]"
          >
            Return to Home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink-950 flex flex-col items-center justify-center p-6 text-center text-white">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"
          aria-label="Loading demo"
          role="status"
        />
        <h1 className="text-lg font-heading font-medium text-white">Starting your demo session...</h1>
        <p className="text-xs text-ink-500">Preparing demo business and sample invoices</p>
      </div>
    </main>
  );
}
