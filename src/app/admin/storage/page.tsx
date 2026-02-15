'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';

interface StorageStats {
  totalDisk: string;
  usedDisk: string;
  freeDisk: string;
  freeDiskBytes: number;
  dbSize: string;
  uploadsSize: string;
  uploadsCount: number;
  backupsSize: string;
  rooms: { id: string; name: string; type: string; _count: { messages: number } }[];
}

export default function AdminStoragePage() {
  const { t, dir } = useI18n();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [message, setMessage] = useState('');

  const fetchStats = () => {
    fetch('/api/admin/storage')
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);

  const doAction = async (action: string, params?: Record<string, unknown>) => {
    setActionLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/storage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, params }),
      });
      const data = await res.json();
      setMessage(data.deleted !== undefined ? `${data.deleted} items deleted` : t('common.success'));
      fetchStats();
    } catch {
      setMessage(t('common.error'));
    }
    setActionLoading(false);
  };

  const WARNING_THRESHOLD = 500 * 1024 * 1024; // 500MB
  const CRITICAL_THRESHOLD = 100 * 1024 * 1024; // 100MB

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: dir }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bg-tertiary)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/admin" className="btn btn-ghost btn-sm">← {t('common.back')}</Link>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>💾 {t('admin.storage')}</h1>
      </div>
      <div style={{ padding: 24 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : stats ? (
          <>
            {/* Space warning */}
            {stats.freeDiskBytes < CRITICAL_THRESHOLD && (
              <div style={{ padding: 16, background: 'rgba(244,67,54,0.15)', borderRadius: 'var(--radius-sm)', marginBottom: 20, color: 'var(--danger)', fontWeight: 600 }}>
                {t('storage.critical')}
              </div>
            )}
            {stats.freeDiskBytes >= CRITICAL_THRESHOLD && stats.freeDiskBytes < WARNING_THRESHOLD && (
              <div style={{ padding: 16, background: 'rgba(255,193,7,0.15)', borderRadius: 'var(--radius-sm)', marginBottom: 20, color: 'var(--warning)', fontWeight: 600 }}>
                {t('storage.warning')}
              </div>
            )}

            {/* Overview */}
            <div className="stats-grid" style={{ marginBottom: 24 }}>
              <div className="stat-card"><div className="stat-value">{stats.totalDisk}</div><div className="stat-label">{t('storage.total')}</div></div>
              <div className="stat-card"><div className="stat-value">{stats.usedDisk}</div><div className="stat-label">{t('storage.used')}</div></div>
              <div className="stat-card"><div className="stat-value">{stats.freeDisk}</div><div className="stat-label">{t('storage.free')}</div></div>
              <div className="stat-card"><div className="stat-value">{stats.dbSize}</div><div className="stat-label">{t('admin.dbSize')}</div></div>
              <div className="stat-card"><div className="stat-value">{stats.uploadsSize}</div><div className="stat-label">{t('admin.uploadsSize')} ({stats.uploadsCount})</div></div>
              <div className="stat-card"><div className="stat-value">{stats.backupsSize}</div><div className="stat-label">{t('admin.backup')}</div></div>
            </div>

            {message && (
              <div style={{ padding: 12, background: 'rgba(76,175,80,0.1)', borderRadius: 'var(--radius-sm)', marginBottom: 16, color: 'var(--success)' }}>
                {message}
              </div>
            )}

            {/* Cleanup Actions */}
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('admin.cleanupMessages')}</h3>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div>
                  <label style={{ fontSize: 13, display: 'block', marginBottom: 4, color: 'var(--fg-secondary)' }}>{t('admin.cleanupDays')}</label>
                  <input className="input" type="number" value={days} onChange={(e) => setDays(Number(e.target.value))} style={{ width: 120 }} min={1} />
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => doAction('delete-old-messages', { days })} disabled={actionLoading}>
                  {actionLoading ? '...' : t('admin.cleanupOldMessages')}
                </button>
                <button className="btn btn-secondary btn-sm" onClick={() => doAction('vacuum')} disabled={actionLoading}>
                  {t('admin.vacuum')}
                </button>
              </div>
            </div>

            {/* Per-room cleanup */}
            <div className="card">
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('storage.cleanupByRoom')}</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.rooms.map((room) => (
                  <div key={room.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--bg-tertiary)' }}>
                    <span>{room.type === 'CHANNEL' ? '📢' : '👥'} {room.name} ({room._count.messages} msgs)</span>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => {
                        if (confirm(t('common.confirm') + '?')) doAction('delete-room-content', { roomId: room.id });
                      }}
                      disabled={actionLoading}
                    >
                      🗑 {t('admin.cleanupMessages')}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </>
        ) : (
          <p>{t('common.error')}</p>
        )}
      </div>
    </div>
  );
}
