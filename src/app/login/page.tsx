'use client';

import { useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';

export default function LoginPage() {
  const { login } = useAuth();
  const { t, locale, setLocale, dir } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

      const data = await res.json();

      if (!res.ok) {
        setError(t(`auth.${data.error}`) || t('common.error'));
        setLoading(false);
        return;
      }

      // Cookie is set, now reload the page to include it
      window.location.href = '/';
    } catch {
      setError(t('common.error'));
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        background: 'linear-gradient(135deg, #1a0a0a 0%, #2d1810 25%, #ff6b35 50%, #e63946 75%, #1a0a0a 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated background */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'radial-gradient(circle at 20% 50%, rgba(255, 107, 53, 0.4) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(230, 57, 70, 0.4) 0%, transparent 50%)',
          animation: 'pulse 10s ease-in-out infinite',
        }}
      />

      {/* Glassmorphism card */}
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          padding: '40px 32px',
          background: 'rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(10px)',
          borderRadius: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
          border: '1px solid rgba(255, 255, 255, 0.18)',
          position: 'relative',
          zIndex: 1,
          direction: dir,
        }}
      >
        {/* Language toggle */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
          <div
            style={{
              display: 'inline-flex',
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              padding: '4px',
            }}
          >
            <button
              onClick={() => setLocale('fa')}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                border: 'none',
                background: locale === 'fa' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                color: locale === 'fa' ? '#ff6b35' : 'rgba(255, 255, 255, 0.8)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              فارسی
            </button>
            <button
              onClick={() => setLocale('en')}
              style={{
                padding: '6px 16px',
                borderRadius: '8px',
                border: 'none',
                background: locale === 'en' ? 'rgba(255, 255, 255, 0.9)' : 'transparent',
                color: locale === 'en' ? '#ff6b35' : 'rgba(255, 255, 255, 0.8)',
                fontWeight: 600,
                fontSize: 13,
                cursor: 'pointer',
                transition: 'all 0.3s ease',
              }}
            >
              EN
            </button>
          </div>
        </div>

        {/* Logo & Title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🌶️</div>
          <h1
            style={{
              fontSize: 32,
              fontWeight: 700,
              marginBottom: 8,
              color: '#fff',
              textShadow: '0 2px 10px rgba(0,0,0,0.2)',
            }}
          >
            {t('common.appName')}
          </h1>
          <p style={{ color: 'rgba(255, 255, 255, 0.8)', marginBottom: 0, fontSize: 15 }}>
            {t('auth.loginSubtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label
              htmlFor="username"
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 14,
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.9)',
              }}
            >
              {t('auth.username')}
            </label>
            <input
              id="username"
              name="username"
              type="text"
              placeholder={t('auth.usernamePlaceholder')}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: '12px',
                border: '2px solid transparent',
                background: 'rgba(255, 255, 255, 0.9)',
                color: '#1a1a1a',
                fontSize: 15,
                outline: 'none',
                transition: 'all 0.3s ease',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#fff';
                e.target.style.transform = 'scale(1.02)';
                e.target.style.boxShadow = '0 4px 12px rgba(255, 255, 255, 0.2)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'transparent';
                e.target.style.transform = 'scale(1)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label
              htmlFor="password"
              style={{
                display: 'block',
                marginBottom: 8,
                fontSize: 14,
                fontWeight: 600,
                color: 'rgba(255, 255, 255, 0.9)',
              }}
            >
              {t('auth.password')}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              style={{
                width: '100%',
                padding: '14px 16px',
                borderRadius: '12px',
                border: '2px solid transparent',
                background: 'rgba(255, 255, 255, 0.9)',
                color: '#1a1a1a',
                fontSize: 15,
                outline: 'none',
                transition: 'all 0.3s ease',
                boxSizing: 'border-box',
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#fff';
                e.target.style.transform = 'scale(1.02)';
                e.target.style.boxShadow = '0 4px 12px rgba(255, 255, 255, 0.2)';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'transparent';
                e.target.style.transform = 'scale(1)';
                e.target.style.boxShadow = 'none';
              }}
            />
          </div>

          {error && (
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(244, 67, 54, 0.9)',
                borderRadius: '12px',
                color: '#fff',
                fontSize: 14,
                marginBottom: 20,
                animation: 'fadeIn 0.3s ease',
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #e84545 0%, #c03030 100%)',
              color: '#fff',
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: '0 4px 15px rgba(232, 69, 69, 0.4)',
            }}
            onMouseEnter={(e) => {
              if (!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(232, 69, 69, 0.6)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 15px rgba(232, 69, 69, 0.4)';
            }}
          >
            {loading ? '...' : t('auth.login')}
          </button>

          <p
            style={{
              textAlign: 'center',
              marginTop: 20,
              fontSize: 14,
              color: 'rgba(255, 255, 255, 0.9)',
            }}
          >
            {t('auth.noAccount')}{' '}
            <Link
              href="/signup"
              style={{
                color: '#fff',
                fontWeight: 600,
                textDecoration: 'none',
                borderBottom: '2px solid #fff',
              }}
            >
              {t('auth.signup')}
            </Link>
          </p>
        </form>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.8;
          }
        }
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
