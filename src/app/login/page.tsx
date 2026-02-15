'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';

export default function LoginPage() {
  const { login } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError('');

    if (!username || !password) {
      setError(t('auth.invalidCredentials'));
      return;
    }

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(t(`auth.${data.error}`) || t('common.error'));
        return;
      }

      // Cookie is set, now reload the page to include it
      window.location.href = '/';
    } catch {
      setError(t('common.error'));
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: '20px',
      }}
    >
      <div className="card" style={{ width: '100%', maxWidth: 400 }}>
        {/* Language toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <div className="lang-toggle">
            <button
              className={locale === 'fa' ? 'active' : ''}
              onClick={() => setLocale('fa')}
            >
              فارسی
            </button>
            <button
              className={locale === 'en' ? 'active' : ''}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
          </div>
        </div>

        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            marginBottom: 8,
            background: 'var(--accent-gradient)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          🌶️ {t('common.appName')}
        </h1>
        <p style={{ color: 'var(--fg-secondary)', marginBottom: 24, fontSize: 14 }}>
          {t('auth.loginSubtitle')}
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label
              htmlFor="username"
              style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 600 }}
            >
              {t('auth.username')}
            </label>
            <input
              id="username"
              name="username"
              type="text"
              className="input"
              placeholder={t('auth.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>

          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="password"
              style={{ display: 'block', marginBottom: 6, fontSize: 14, fontWeight: 600 }}
            >
              {t('auth.password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(244, 67, 54, 0.1)',
                border: '1px solid var(--danger)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--danger)',
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%' }}>
            {t('auth.login')}
          </button>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14, color: 'var(--fg-secondary)' }}>
            {t('auth.noAccount')}{' '}
            <Link href="/signup" style={{ color: 'var(--accent-light)', fontWeight: 600 }}>
              {t('auth.signup')}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
