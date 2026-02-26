'use client';

import { useState } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';
import AppIcon from '@/components/AppIcon';

export default function LoginPage() {
  const { t, locale, setLocale, dir } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const parseResponseBody = async (res: Response): Promise<Record<string, unknown>> => {
    const text = await res.text();
    if (!text) {
      return {};
    }
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      return { error: 'serverError', debug: text };
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!username || !password) {
      setError(t('auth.invalidCredentials'));
      setLoading(false);
      return;
    }

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
        setError(t(`auth.${apiError}`) || t('common.error'));
        setLoading(false);
        return;
      }

      window.location.href = '/';
    } catch (caught) {
      console.error('Login request failed:', caught);
      setError(t('common.error'));
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ direction: dir }}>
        <div className="auth-topbar">
          <div className="lang-toggle">
            <button
              type="button"
              className={locale === 'fa' ? 'active' : ''}
              onClick={() => setLocale('fa')}
            >
              FA
            </button>
            <button
              type="button"
              className={locale === 'en' ? 'active' : ''}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
          </div>
        </div>

        <div className="auth-brand">
          <div className="auth-brand-icon">
            <AppIcon name="logo" size={30} />
          </div>
          <h1 className="auth-title">{t('common.appName')}</h1>
          <p className="auth-subtitle">{t('auth.loginSubtitle')}</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="username">
              {t('auth.username')}
            </label>
            <input
              id="username"
              name="username"
              className="input"
              type="text"
              placeholder={t('auth.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="password">
              {t('auth.password')}
            </label>
            <input
              id="password"
              name="password"
              className="input"
              type="password"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', height: 46 }}>
            {loading ? '...' : t('auth.login')}
          </button>

          <p className="auth-note">
            {t('auth.noAccount')} <Link href="/signup" className="auth-link">{t('auth.signup')}</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
