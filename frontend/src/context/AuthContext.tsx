import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react';
import {
  User,
  Business,
  getStoredToken,
  setStoredToken,
  loginApi,
  registerApi,
  demoLoginApi,
  fetchMeApi,
} from '../lib/api';

interface AuthContextType {
  user: User | null;
  business: Business | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isDemo: boolean;
  login: (data: { email: string; password: string }) => Promise<void>;
  register: (data: {
    email: string;
    password: string;
    name: string;
    businessName: string;
    defaultCurrency?: 'ETB' | 'USD';
  }) => Promise<void>;
  loginDemo: () => Promise<void>;
  logout: () => void;
  updateBusinessState: (business: Business) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load existing session on initial mount
  useEffect(() => {
    let mounted = true;
    async function initAuth() {
      const stored = getStoredToken();
      if (!stored) {
        if (mounted) setIsLoading(false);
        return;
      }

      try {
        const data = await fetchMeApi();
        if (mounted) {
          setUser(data.user);
          setBusiness(data.business);
          setToken(stored);
        }
      } catch (err) {
        // Token expired or invalid
        if (mounted) {
          setStoredToken(null);
          setToken(null);
          setUser(null);
          setBusiness(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();
    return () => {
      mounted = false;
    };
  }, []);

  const login = useCallback(async (data: { email: string; password: string }) => {
    const res = await loginApi(data);
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
    setBusiness(res.business);
  }, []);

  const register = useCallback(
    async (data: {
      email: string;
      password: string;
      name: string;
      businessName: string;
      defaultCurrency?: 'ETB' | 'USD';
    }) => {
      const res = await registerApi(data);
      setStoredToken(res.token);
      setToken(res.token);
      setUser(res.user);
      setBusiness(res.business);
    },
    []
  );

  const loginDemo = useCallback(async () => {
    const res = await demoLoginApi();
    setStoredToken(res.token);
    setToken(res.token);
    setUser(res.user);
    setBusiness(res.business);
  }, []);

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
    setBusiness(null);
  }, []);

  const updateBusinessState = useCallback((updated: Business) => {
    setBusiness(updated);
  }, []);

  const isDemo = Boolean(user && user.email === 'demo@goominvoice.com');
  const isAuthenticated = Boolean(token && user);

  const value = useMemo(
    () => ({
      user,
      business,
      token,
      isAuthenticated,
      isLoading,
      isDemo,
      login,
      register,
      loginDemo,
      logout,
      updateBusinessState,
    }),
    [user, business, token, isAuthenticated, isLoading, isDemo, login, register, loginDemo, logout, updateBusinessState]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
