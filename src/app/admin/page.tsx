'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';

interface Stats {
  totalUsers: number;
  totalMessages: number;
  totalRooms: number;
  onlineUsers: number;
  dbSize: string;
  uploadsSize: string;
  freeSpace: string;
  activeCall: { callerName: string; calleeId: string; startedAt: string } | null;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { t, locale, setLocale, dir } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (!user?.isSuperAdmin) return <div style={{ padding: 40, textAlign: 'center' }}>Forbidden</div>;

  const navItems = [
    { href: '/admin', icon: '📊', label: t('admin.dashboard') },
    { href: '/admin/users', icon: '👤', label: t('admin.users') },
    { href: '/admin/rooms', icon: '💬', label: t('admin.rooms') },
    { href: '/admin/messages', icon: '✉️', label: t('admin.messages') },
    { href: '/admin/calls', icon: '📞', label: t('admin.calls') },
    { href: '/admin/storage', icon: '💾', label: t('admin.storage') },
    { href: '/admin/backup', icon: '📦', label: t('admin.backup') },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: dir }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--bg-tertiary)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" className="btn btn-ghost btn-sm">← {t('common.back')}</Link>
          <span style={{ fontSize: 20 }}>🌶️</span>
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t('admin.panel')}</h1>
        </div>
        <div className="lang-toggle">
          <button className={locale === 'fa' ? 'active' : ''} onClick={() => setLocale('fa')}>FA</button>
          <button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
        </div>
      </div>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        {/* Sidebar Nav */}
        <nav style={{
          width: 220,
          background: 'var(--bg-secondary)',
          borderInlineEnd: '1px solid var(--bg-tertiary)',
          padding: '16px 0',
        }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                color: 'var(--fg)',
                textDecoration: 'none',
                fontSize: 14,
                transition: 'background 0.15s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Main Content */}
        <div style={{ flex: 1, padding: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>{t('admin.dashboard')}</h2>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div className="spinner" style={{ width: 40, height: 40 }} />
            </div>
          ) : stats ? (
            <>
              {/* Stats Grid */}
              <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                  <div className="stat-value">{stats.onlineUsers}</div>
                  <div className="stat-label">{t('admin.onlineUsers')}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.totalUsers}</div>
                  <div className="stat-label">{t('admin.totalUsers')}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.totalMessages}</div>
                  <div className="stat-label">{t('admin.totalMessages')}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.totalRooms}</div>
                  <div className="stat-label">{t('admin.totalRooms')}</div>
                </div>
              </div>

              {/* Storage Info */}
              <div className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('admin.diskUsage')}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div>
                    <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{t('admin.dbSize')}</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.dbSize}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{t('admin.uploadsSize')}</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.uploadsSize}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{t('admin.freeSpace')}</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.freeSpace}</div>
                  </div>
                </div>
              </div>

              {/* Active Call */}
              <div className="card">
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('admin.activeCall')}</h3>
                {stats.activeCall ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div>
                      <span style={{ color: 'var(--online)' }}>● </span>
                      {stats.activeCall.callerName} → {stats.activeCall.calleeId}
                    </div>
                    <button className="btn btn-danger btn-sm">{t('admin.terminateCall')}</button>
                  </div>
                ) : (
                  <p style={{ color: 'var(--fg-muted)' }}>{t('admin.noActiveCall')}</p>
                )}
              </div>
            </>
          ) : (
            <p>{t('common.error')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
