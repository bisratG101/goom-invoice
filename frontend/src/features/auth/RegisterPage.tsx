import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { registerSchema, RegisterFormData } from './schemas';
import { AuthLayout } from './AuthLayout';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Button } from '../../components/ui/Button';
import { AlertCircleIcon, InfoIcon } from '../../components/ui/icons';
import { useColdStartNotice } from '../../hooks/useColdStartNotice';
import { ApiException } from '../../lib/api';

export function RegisterPage() {
  const { register: registerAuth } = useAuth();
  const navigate = useNavigate();
  const [apiError, setApiError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      businessName: '',
      defaultCurrency: 'ETB',
    },
  });

  const showColdStartNotice = useColdStartNotice(isSubmitting);

  const onSubmit = async (data: RegisterFormData) => {
    setApiError(null);
    try {
      await registerAuth(data);
      navigate('/app', { replace: true });
    } catch (err: unknown) {
      if (err instanceof ApiException) {
        if (err.status === 409) {
          setApiError('An account with this email address already exists. Please log in or use a different email.');
        } else if (err.status === 422) {
          setApiError(err.error?.message || 'Please check your registration details.');
        } else if (err.status === 429) {
          setApiError('Too many attempts. Please try again later.');
        } else {
          setApiError(err.error?.message || 'Failed to create account. Please try again.');
        }
      } else if (err instanceof Error) {
        setApiError(err.message);
      } else {
        setApiError('An unexpected network error occurred.');
      }
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start issuing professional invoices in ETB and USD"
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
          label="Your full name"
          type="text"
          autoComplete="name"
          placeholder="e.g. Abebe Bikila"
          error={errors.name?.message}
          {...register('name')}
        />

        <Input
          label="Email address"
          type="email"
          autoComplete="email"
          placeholder="name@company.com"
          error={errors.email?.message}
          {...register('email')}
        />

        <Input
          label="Password (min 8 characters)"
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          error={errors.password?.message}
          {...register('password')}
        />

        <Input
          label="Business / Trading name"
          type="text"
          autoComplete="organization"
          placeholder="e.g. Abebe Logistics PLC"
          error={errors.businessName?.message}
          {...register('businessName')}
        />

        <Select
          label="Default invoice currency"
          error={errors.defaultCurrency?.message}
          options={[
            { value: 'ETB', label: 'Ethiopian Birr (ETB)' },
            { value: 'USD', label: 'United States Dollar (USD)' },
          ]}
          {...register('defaultCurrency')}
        />

        <Button
          type="submit"
          variant="primary"
          size="lg"
          className="w-full mt-2"
          isLoading={isSubmitting}
          loadingText="Creating account..."
        >
          Create free account
        </Button>

        <div className="pt-4 text-center text-sm text-ink-500">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
          >
            Sign in
          </Link>
        </div>
      </form>
    </AuthLayout>
  );
}
