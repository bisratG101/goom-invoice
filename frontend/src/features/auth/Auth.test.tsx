import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { ProtectedRoute } from '../../components/layout/ProtectedRoute';
import { PublicRoute } from '../../components/layout/PublicRoute';
import { AuthProvider, useAuth } from '../../context/AuthContext';
import { ThemeProvider } from '../../context/ThemeContext';
import * as api from '../../lib/api';
import { renderHook } from '@testing-library/react';
import { useColdStartNotice } from '../../hooks/useColdStartNotice';

describe('Prompt 13: Authentication & Protected Shell', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  const renderWithProviders = (ui: React.ReactNode, initialEntries = ['/']) => {
    return render(
      <MemoryRouter initialEntries={initialEntries}>
        <ThemeProvider>
          <AuthProvider>{ui}</AuthProvider>
        </ThemeProvider>
      </MemoryRouter>
    );
  };

  describe('Login Page', () => {
    it('shows inline validation errors when fields are empty or invalid', async () => {
      renderWithProviders(<LoginPage />, ['/login']);

      const submitBtn = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
        expect(screen.getByText(/password is required/i)).toBeInTheDocument();
      });

      const emailInput = screen.getByLabelText(/email address/i);
      fireEvent.change(emailInput, { target: { value: 'not-an-email' } });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/invalid email address/i)).toBeInTheDocument();
      });
    });

    it('successfully logs in and stores auth credentials', async () => {
      const mockLogin = vi.spyOn(api, 'loginApi').mockResolvedValue({
        token: 'test-jwt-token',
        user: { id: 'u1', email: 'test@example.com', name: 'Test User' },
        business: {
          id: 'b1',
          name: 'Test Business',
          defaultCurrency: 'ETB',
          invoicePrefix: 'INV',
          timezone: 'Africa/Addis_Ababa',
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/app" element={<div>Dashboard Authenticated Area</div>} />
        </Routes>,
        ['/login']
      );

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'test@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'Password123!' },
      });

      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(mockLogin).toHaveBeenCalledWith({
          email: 'test@example.com',
          password: 'Password123!',
        });
        expect(localStorage.getItem('goom_token')).toBe('test-jwt-token');
        expect(screen.getByText('Dashboard Authenticated Area')).toBeInTheDocument();
      });
    });

    it('displays useful inline error on 401 invalid credentials', async () => {
      vi.spyOn(api, 'loginApi').mockRejectedValue(
        new api.ApiException(401, {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        })
      );

      renderWithProviders(<LoginPage />, ['/login']);

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'wrong@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'WrongPass!' },
      });

      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/invalid email or password\. please check your credentials/i)
        ).toBeInTheDocument();
      });
    });

    it('displays rate limit error on 429 response', async () => {
      vi.spyOn(api, 'loginApi').mockRejectedValue(
        new api.ApiException(429, {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
        })
      );

      renderWithProviders(<LoginPage />, ['/login']);

      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'user@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'Password123!' },
      });

      fireEvent.click(screen.getByRole('button', { name: /sign in/i }));

      await waitFor(() => {
        expect(screen.getByText(/too many login attempts/i)).toBeInTheDocument();
      });
    });
  });

  describe('Registration Page', () => {
    it('validates password minimum length of 8 characters and required fields', async () => {
      renderWithProviders(<RegisterPage />, ['/register']);

      fireEvent.click(screen.getByRole('button', { name: /create free account/i }));

      await waitFor(() => {
        expect(screen.getByText(/full name is required/i)).toBeInTheDocument();
        expect(screen.getByText(/email is required/i)).toBeInTheDocument();
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
        expect(screen.getByText(/business name is required/i)).toBeInTheDocument();
      });

      // Type short password
      fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'short' } });
      fireEvent.click(screen.getByRole('button', { name: /create free account/i }));

      await waitFor(() => {
        expect(screen.getByText(/password must be at least 8 characters/i)).toBeInTheDocument();
      });
    });

    it('successfully registers and creates business account', async () => {
      const mockRegister = vi.spyOn(api, 'registerApi').mockResolvedValue({
        token: 'new-reg-token',
        user: { id: 'u2', email: 'new@example.com', name: 'New Owner' },
        business: {
          id: 'b2',
          name: 'New Business PLC',
          defaultCurrency: 'USD',
          invoicePrefix: 'INV',
          timezone: 'Africa/Addis_Ababa',
        },
      });

      renderWithProviders(
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/app" element={<div>Dashboard Authenticated Area</div>} />
        </Routes>,
        ['/register']
      );

      fireEvent.change(screen.getByLabelText(/your full name/i), {
        target: { value: 'New Owner' },
      });
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'new@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'StrongPass123!' },
      });
      fireEvent.change(screen.getByLabelText(/business \/ trading name/i), {
        target: { value: 'New Business PLC' },
      });
      fireEvent.change(screen.getByLabelText(/default invoice currency/i), {
        target: { value: 'USD' },
      });

      fireEvent.click(screen.getByRole('button', { name: /create free account/i }));

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith({
          name: 'New Owner',
          email: 'new@example.com',
          password: 'StrongPass123!',
          businessName: 'New Business PLC',
          defaultCurrency: 'USD',
        });
        expect(localStorage.getItem('goom_token')).toBe('new-reg-token');
        expect(screen.getByText('Dashboard Authenticated Area')).toBeInTheDocument();
      });
    });

    it('handles 409 duplicate email conflict gracefully', async () => {
      vi.spyOn(api, 'registerApi').mockRejectedValue(
        new api.ApiException(409, {
          code: 'EMAIL_ALREADY_EXISTS',
          message: 'An account with this email address already exists',
        })
      );

      renderWithProviders(<RegisterPage />, ['/register']);

      fireEvent.change(screen.getByLabelText(/your full name/i), {
        target: { value: 'Existing User' },
      });
      fireEvent.change(screen.getByLabelText(/email address/i), {
        target: { value: 'existing@example.com' },
      });
      fireEvent.change(screen.getByLabelText(/password/i), {
        target: { value: 'Password123!' },
      });
      fireEvent.change(screen.getByLabelText(/business \/ trading name/i), {
        target: { value: 'Existing Enterprise' },
      });

      fireEvent.click(screen.getByRole('button', { name: /create free account/i }));

      await waitFor(() => {
        expect(
          screen.getByText(/an account with this email address already exists/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Route Guards & Session Persistence', () => {
    it('redirects unauthenticated users from protected route to /login', async () => {
      renderWithProviders(
        <Routes>
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <div>Private Content</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page Redirected</div>} />
        </Routes>,
        ['/app']
      );

      await waitFor(() => {
        expect(screen.getByText('Login Page Redirected')).toBeInTheDocument();
        expect(screen.queryByText('Private Content')).not.toBeInTheDocument();
      });
    });

    it('restores authenticated session on mount from localStorage token', async () => {
      localStorage.setItem('goom_token', 'valid-persisted-jwt');
      const mockFetchMe = vi.spyOn(api, 'fetchMeApi').mockResolvedValue({
        user: { id: 'u10', email: 'persisted@example.com', name: 'Persisted User' },
        business: {
          id: 'b10',
          name: 'Persisted Business',
          defaultCurrency: 'ETB',
          invoicePrefix: 'INV',
          timezone: 'UTC',
        },
      });

      renderWithProviders(
        <Routes>
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <div>Private Content For Persisted User</div>
              </ProtectedRoute>
            }
          />
        </Routes>,
        ['/app']
      );

      await waitFor(() => {
        expect(mockFetchMe).toHaveBeenCalled();
        expect(screen.getByText('Private Content For Persisted User')).toBeInTheDocument();
      });
    });

    it('redirects authenticated user visiting /login to /app', async () => {
      localStorage.setItem('goom_token', 'logged-in-token');
      vi.spyOn(api, 'fetchMeApi').mockResolvedValue({
        user: { id: 'u11', email: 'auth@example.com', name: 'Authenticated User' },
        business: {
          id: 'b11',
          name: 'Auth Biz',
          defaultCurrency: 'ETB',
          invoicePrefix: 'INV',
          timezone: 'UTC',
        },
      });

      renderWithProviders(
        <Routes>
          <Route
            path="/login"
            element={
              <PublicRoute>
                <div>Login Form</div>
              </PublicRoute>
            }
          />
          <Route path="/app" element={<div>Already Authenticated Area</div>} />
        </Routes>,
        ['/login']
      );

      await waitFor(() => {
        expect(screen.getByText('Already Authenticated Area')).toBeInTheDocument();
        expect(screen.queryByText('Login Form')).not.toBeInTheDocument();
      });
    });

    it('logout clears session and resets state', async () => {
      localStorage.setItem('goom_token', 'token-to-be-cleared');
      vi.spyOn(api, 'fetchMeApi').mockResolvedValue({
        user: { id: 'u12', email: 'logout@example.com', name: 'Logout User' },
        business: {
          id: 'b12',
          name: 'Logout Biz',
          defaultCurrency: 'ETB',
          invoicePrefix: 'INV',
          timezone: 'UTC',
        },
      });

      function TestLogoutComponent() {
        const { logout, user } = useAuth();
        return (
          <div>
            <span>Current user: {user?.name || 'none'}</span>
            <button onClick={logout}>Do Logout</button>
          </div>
        );
      }

      renderWithProviders(<TestLogoutComponent />, ['/']);

      await waitFor(() => {
        expect(screen.getByText('Current user: Logout User')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: /do logout/i }));

      expect(localStorage.getItem('goom_token')).toBeNull();
      expect(screen.getByText('Current user: none')).toBeInTheDocument();
    });
  });

  describe('Cold-start Notice (design.md §12.9)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('does not display cold-start notice before 4 seconds', () => {
      const { result } = renderHook(() => useColdStartNotice(true, 4000));
      expect(result.current).toBe(false);

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(result.current).toBe(false);
    });

    it('displays cold-start notice after 4 seconds of waiting', () => {
      const { result } = renderHook(() => useColdStartNotice(true, 4000));
      expect(result.current).toBe(false);

      act(() => {
        vi.advanceTimersByTime(4001);
      });
      expect(result.current).toBe(true);
    });

    it('resets immediately when loading completes', () => {
      const { result, rerender } = renderHook(({ loading }) => useColdStartNotice(loading, 4000), {
        initialProps: { loading: true },
      });

      act(() => {
        vi.advanceTimersByTime(4001);
      });
      expect(result.current).toBe(true);

      rerender({ loading: false });
      expect(result.current).toBe(false);
    });

    it('shows cold-start notice during slow session restoration and dismisses it when resolved', async () => {
      localStorage.setItem('goom_token', 'valid-stored-token');

      let resolveFetchMe!: (value: unknown) => void;
      const fetchMePromise = new Promise((resolve) => {
        resolveFetchMe = resolve;
      });

      vi.spyOn(api, 'fetchMeApi').mockReturnValue(fetchMePromise as any);

      renderWithProviders(
        <Routes>
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <div>Restored Protected View</div>
              </ProtectedRoute>
            }
          />
        </Routes>,
        ['/app']
      );

      // Initially, cold-start notice is not yet visible (< 4s)
      expect(screen.queryByText(/Waking up the server/i)).not.toBeInTheDocument();

      // Advance by 2 seconds (< 4s)
      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(screen.queryByText(/Waking up the server/i)).not.toBeInTheDocument();

      // Advance past 4 seconds
      act(() => {
        vi.advanceTimersByTime(2001);
      });
      expect(screen.getByText(/Waking up the server, this can take up to 30 seconds/i)).toBeInTheDocument();

      // Now resolve the backend response
      await act(async () => {
        resolveFetchMe({
          user: { id: 'u1', email: 'test@example.com', name: 'Restored User' },
          business: {
            id: 'b1',
            name: 'Restored Biz',
            defaultCurrency: 'ETB',
            invoicePrefix: 'INV',
            timezone: 'UTC',
          },
        });
      });

      // Cold start notice should be dismissed and protected content shown
      expect(screen.queryByText(/Waking up the server/i)).not.toBeInTheDocument();
      expect(screen.getByText('Restored Protected View')).toBeInTheDocument();
    });

    it('does not show cold-start notice for fast session restoration (< 4s)', async () => {
      localStorage.setItem('goom_token', 'fast-token');

      let resolveFetchMe!: (value: unknown) => void;
      const fetchMePromise = new Promise((resolve) => {
        resolveFetchMe = resolve;
      });

      vi.spyOn(api, 'fetchMeApi').mockReturnValue(fetchMePromise as any);

      renderWithProviders(
        <Routes>
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <div>Fast Protected View</div>
              </ProtectedRoute>
            }
          />
        </Routes>,
        ['/app']
      );

      // Advance only 500ms
      act(() => {
        vi.advanceTimersByTime(500);
      });
      expect(screen.queryByText(/Waking up the server/i)).not.toBeInTheDocument();

      // Complete the request fast
      await act(async () => {
        resolveFetchMe({
          user: { id: 'u2', email: 'fast@example.com', name: 'Fast User' },
          business: {
            id: 'b2',
            name: 'Fast Biz',
            defaultCurrency: 'USD',
            invoicePrefix: 'INV',
            timezone: 'UTC',
          },
        });
      });

      // Notice should still not be present, and content rendered
      expect(screen.queryByText(/Waking up the server/i)).not.toBeInTheDocument();
      expect(screen.getByText('Fast Protected View')).toBeInTheDocument();
    });
  });
});
