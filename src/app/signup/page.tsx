'use client';

import { useState, FormEvent } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';

export default function SignupPage() {
  const { signup } = useAuth();
  const { t, locale, setLocale } = useI18n();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (username.length < 3) {
      setError(t('auth.usernameMin'));
      return;
    }
    if (password.length < 6) {
      setError(t('auth.passwordMin'));
      return;
    }
    if (password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }

    setLoading(true);
    const result = await signup(username, password, displayName || undefined);
    if (result.error) {
      setError(t(`auth.${result.error}`) || t('common.error'));
    }
    setLoading(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0f0f13 0%, #1a0a0a 50%, #0f0f13 100%)',
      padding: '20px',
    }}>
      <div className="card animate-fade-in" style={{ maxWidth: 420, width: '100%' }}>
        {/* Language Toggle */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
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
              English
            </button>
          </div>
        </div>

        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🌶️</div>
          <h1 style={{
            fontSize: 24,
            fontWeight: 700,
            background: 'linear-gradient(135deg, #e84545, #ff8a5c)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}>
            {t('app.name')}
          </h1>
          <p style={{ color: 'var(--fg-secondary)', fontSize: 14, marginTop: 4 }}>
            {t('auth.signupTitle')}
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <input
            className="input"
            type="text"
            placeholder={t('auth.username')}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
          <input
            className="input"
            type="text"
            placeholder={t('auth.displayName')}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder={t('auth.password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <input
            className="input"
            type="password"
            placeholder={t('auth.confirmPassword')}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />

          {error && (
            <div style={{
              padding: '10px 16px',
              background: 'rgba(244, 67, 54, 0.1)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--danger)',
              fontSize: 13,
            }}>
              {error}
            </div>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={loading}
            style={{ width: '100%', height: 44 }}
          >
            {loading ? <div className="spinner" style={{ width: 20, height: 20 }} /> : t('auth.signup')}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: 'var(--fg-secondary)' }}>
          {t('auth.hasAccount')}{' '}
          <Link href="/login" style={{ color: 'var(--accent-light)', textDecoration: 'none' }}>
            {t('auth.login')}
          </Link>
        </p>
      </div>
    </div>
  );
}
