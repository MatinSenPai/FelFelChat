'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';
import AppIcon from '@/components/AppIcon';

export default function SignupPage() {
  const { signup } = useAuth();
  const { t, locale, setLocale, dir } = useI18n();
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [checkingSettings, setCheckingSettings] = useState(true);

  useEffect(() => {
    fetch('/api/settings/public')
      .then((r) => r.json())
      .then((data) => {
        if (typeof data.registrationEnabled === 'boolean') {
          setRegistrationEnabled(data.registrationEnabled);
        }
        setCheckingSettings(false);
      })
      .catch(() => {
        setCheckingSettings(false);
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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

  if (checkingSettings) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ display: 'grid', placeItems: 'center', minHeight: 280 }}>
          <div className="spinner" style={{ width: 42, height: 42 }} />
        </div>
      </div>
    );
  }

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
          <p className="auth-subtitle">{t('auth.signupTitle')}</p>
        </div>

        {!registrationEnabled ? (
          <>
            <div className="auth-closed">
              <AppIcon name="lock" size={34} />
              <div className="auth-closed-title">{t('auth.registrationDisabledTitle') || 'Registration Closed'}</div>
              <div className="auth-closed-text">
                {t('auth.registrationDisabledMessage') || 'New user registration is currently disabled. Please contact the administrator.'}
              </div>
            </div>
            <Link href="/login" className="btn btn-secondary auth-back-link" style={{ width: '100%', height: 46 }}>
              <AppIcon name="arrowLeft" size={16} style={{ transform: dir === 'rtl' ? 'scaleX(-1)' : 'none' }} />
              <span>{t('auth.backToLogin') || 'Back to Login'}</span>
            </Link>
          </>
        ) : (
          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-field">
              <label className="auth-label" htmlFor="username">
                {t('auth.username')}
              </label>
              <input
                id="username"
                className="input"
                type="text"
                placeholder={t('auth.usernamePlaceholder')}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="displayName">
                {t('auth.displayName')}
              </label>
              <input
                id="displayName"
                className="input"
                type="text"
                placeholder={t('auth.displayNamePlaceholder') || 'Your display name'}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="password">
                {t('auth.password')}
              </label>
              <input
                id="password"
                className="input"
                type="password"
                placeholder={t('auth.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            <div className="auth-field">
              <label className="auth-label" htmlFor="confirmPassword">
                {t('auth.confirmPassword')}
              </label>
              <input
                id="confirmPassword"
                className="input"
                type="password"
                placeholder={t('auth.confirmPasswordPlaceholder') || 'Confirm your password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
              />
            </div>

            {error && <div className="auth-error">{error}</div>}

            <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', height: 46 }}>
              {loading ? '...' : t('auth.signup')}
            </button>

            <p className="auth-note">
              {t('auth.hasAccount')} <Link href="/login" className="auth-link">{t('auth.login')}</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
