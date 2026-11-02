import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { loginSchema, LoginFormData } from './schemas';
import { AuthLayout } from './AuthLayout';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { AlertCircleIcon, InfoIcon } from '../../components/ui/icons';
import { useColdStartNotice } from '../../hooks/useColdStartNotice';
import { ApiException } from '../../lib/api';

export function LoginPage() {
  const { login, loginDemo } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [apiError, setApiError] = useState<string | null>(null);
  const [isDemoLoading, setIsDemoLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const isLoading = isSubmitting || isDemoLoading;
  const showColdStartNotice = useColdStartNotice(isLoading);

  const fromLocation = (location.state as { from?: { pathname: string } })?.from?.pathname || '/app';

  const onSubmit = async (data: LoginFormData) => {
    setApiError(null);
    try {
      await login(data);
      navigate(fromLocation, { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        if (err.status === 401) {
          setApiError('Invalid email or password. Please check your credentials and try again.');
        } else if (err.status === 429) {
          setApiError('Too many login attempts. Please wait a few minutes before trying again.');
        } else {
          setApiError(err.error?.message || 'Failed to sign in. Please try again.');
        }
      } else if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError('An unexpected network error occurred.');
      }
    }
  };

  const handleDemoLogin = async () => {
    setApiError(null);
    setIsDemoLoading(true);
    try {
      await loginDemo();
      navigate('/app', { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        setApiError(err.error?.message || 'Demo mode is currently disabled.');
      } else {
        setApiError('Failed to launch demo session.');
      }
    } finally {
      setIsDemoLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your Goom Invoice business account"
    >
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 text-left" noValidate>
        {/* Cold-start notification after 4s */}
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

        {/* Inline API Error Alert */}
        {apiError && (
          <div
            role="alert"
            className="p-3.5 rounded-lg bg-red-50 border border-red-500/30 text-red-700 text-xs flex items-start gap-2.5 animate-in fade-in duration-200"
          >
            <AlertCircleIcon size={18} className="shrink-0 mt-0.5" />
            <div className="leading-relaxed">{apiError}</div>
          </div>
        )}

        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password')}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full mt-2"
          isLoading={isSubmitting}
          loadingText="Signing in..."
        >
          Sign in
        </Button>

        {/* Demo Mode Action */}
        <div className="pt-2">
          <Button
            type="button"
            variant="secondary"
            size="md"
            className="w-full text-xs"
            onClick={handleDemoLogin}
            isLoading={isDemoLoading}
            loadingText="Starting demo session..."
          >
            Explore live demo account
          </Button>
        </div>

        <div className="pt-4 text-center text-sm text-ink-500">
          Don't have an account?{' '}
          <Link
            to="/register"
            className="font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
          >
            Create free account
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
