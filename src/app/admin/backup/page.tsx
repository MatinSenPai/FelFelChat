'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';

interface BackupItem {
  filename: string;
  size: string;
  sizeBytes: number;
  createdAt: string;
}

export default function AdminBackupPage() {
  const { t, dir } = useI18n();
  const [backups, setBackups] = useState<BackupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [note, setNote] = useState('');
  const [message, setMessage] = useState('');

  const fetchBackups = () => {
    fetch('/api/admin/backup')
      .then((r) => r.json())
      .then((data) => setBackups(data.backups || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchBackups(); }, []);

  const createBackup = async () => {
    setActionLoading(true);
    setMessage('');
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', note }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage(t('backup.success'));
        setNote('');
        fetchBackups();
      }
    } catch {
      setMessage(t('common.error'));
    }
    setActionLoading(false);
  };

  const restoreBackup = async (filename: string) => {
    if (!confirm(t('backup.confirmRestore'))) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restore', filename }),
      });
      const data = await res.json();
      if (data.success) setMessage(t('backup.restoreSuccess'));
    } catch {
      setMessage(t('common.error'));
    }
    setActionLoading(false);
  };

  const deleteBackup = async (filename: string) => {
    if (!confirm(t('common.confirm') + '?')) return;
    await fetch('/api/admin/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', filename }),
    });
    fetchBackups();
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: dir }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bg-tertiary)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/admin" className="btn btn-ghost btn-sm">← {t('common.back')}</Link>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>📦 {t('admin.backup')}</h1>
      </div>
      <div style={{ padding: 24 }}>
        {/* Create Backup */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('backup.create')}</h3>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, display: 'block', marginBottom: 4, color: 'var(--fg-secondary)' }}>{t('backup.note')}</label>
              <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('backup.note')} />
            </div>
            <button className="btn btn-primary" onClick={createBackup} disabled={actionLoading}>
              {actionLoading ? t('backup.creating') : t('backup.create')}
            </button>
          </div>
        </div>

        {message && (
          <div style={{ padding: 12, background: 'rgba(76,175,80,0.1)', borderRadius: 'var(--radius-sm)', marginBottom: 16, color: 'var(--success)' }}>
            {message}
          </div>
        )}

        {/* Backup List */}
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('backup.list')}</h3>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : backups.length === 0 ? (
          <p style={{ color: 'var(--fg-muted)' }}>{t('common.noResults')}</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Filename</th>
                  <th>Size</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {backups.map((b) => (
                  <tr key={b.filename}>
                    <td style={{ fontFamily: 'monospace', fontSize: 13 }}>{b.filename}</td>
                    <td>{b.size}</td>
                    <td style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{new Date(b.createdAt).toLocaleString()}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-secondary btn-sm" onClick={() => restoreBackup(b.filename)} disabled={actionLoading}>
                          {t('backup.restore')}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => deleteBackup(b.filename)}>
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
