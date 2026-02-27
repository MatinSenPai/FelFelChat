'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  isSuperAdmin: boolean;
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ error?: string }>;
  signup: (username: string, password: string, displayName?: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (res.ok && data.user) {
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Failed to fetch user:', error);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Check auth on mount
  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const parseResponseBody = useCallback(async (res: Response): Promise<Record<string, unknown>> => {
    const text = await res.text();
    if (!text) return {};
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { error: 'serverError', debug: text };
    }
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await parseResponseBody(res);

      if (!res.ok) {
        const apiError = typeof data.error === 'string' ? data.error : 'serverError';
        const debug = typeof data.debug === 'string' ? data.debug : '';
        if (debug) {
          console.error('Login API error:', debug);
        } else {
          console.error('Login API error response:', data);
        }
        return { error: apiError };
      }

      const nextUser = (data as { user?: User }).user;
      if (nextUser) {
        setUser(nextUser);
      }
      window.location.href = '/';
      return {};
    } catch (caught) {
      console.error('Login request failed:', caught);
      return { error: 'serverError' };
    }
  }, [parseResponseBody]);

  const signup = useCallback(async (username: string, password: string, displayName?: string) => {
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName }),
      });

      const data = await parseResponseBody(res);

      if (!res.ok) {
        const apiError = typeof data.error === 'string' ? data.error : 'serverError';
        const debug = typeof data.debug === 'string' ? data.debug : '';
        if (debug) {
          console.error('Signup API error:', debug);
        } else {
          console.error('Signup API error response:', data);
        }
        return { error: apiError };
      }

      const nextUser = (data as { user?: User }).user;
      if (nextUser) {
        setUser(nextUser);
      }
      window.location.href = '/';
      return {};
    } catch (caught) {
      console.error('Signup request failed:', caught);
      return { error: 'serverError' };
    }
  }, [parseResponseBody]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
  }, [router]);

  const refreshUser = async () => {
    await fetchUser();
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
