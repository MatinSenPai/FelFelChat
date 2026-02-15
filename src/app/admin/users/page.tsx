'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';

interface UserItem {
  id: string;
  username: string;
  displayName: string | null;
  isSuperAdmin: boolean;
  isBanned: boolean;
  createdAt: string;
  lastSeen: string;
  _count: { messages: number };
}

export default function AdminUsersPage() {
  const { t, dir } = useI18n();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchUsers = () => {
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((data) => setUsers(data.users || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleAction = async (action: string, userId: string) => {
    if (action === 'delete' && !confirm(t('common.confirm') + '?')) return;
    await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, userId }),
    });
    fetchUsers();
  };

  const filtered = users.filter((u) =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    (u.displayName || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: dir }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bg-tertiary)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/admin" className="btn btn-ghost btn-sm">← {t('common.back')}</Link>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>👤 {t('admin.users')}</h1>
      </div>
      <div style={{ padding: 24 }}>
        <input className="input" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 400, marginBottom: 20 }} />
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>{t('auth.username')}</th>
                  <th>{t('auth.displayName')}</th>
                  <th>{t('admin.totalMessages')}</th>
                  <th>{t('chat.lastSeen')}</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td style={{ fontWeight: 500 }}>@{u.username}{u.isSuperAdmin && ' 👑'}</td>
                    <td>{u.displayName || '—'}</td>
                    <td>{u._count.messages}</td>
                    <td style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{new Date(u.lastSeen).toLocaleString()}</td>
                    <td>
                      {u.isBanned ? (
                        <span className="badge" style={{ background: 'rgba(244,67,54,0.2)', color: 'var(--danger)' }}>Banned</span>
                      ) : (
                        <span className="badge badge-online">Active</span>
                      )}
                    </td>
                    <td>
                      {!u.isSuperAdmin && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {u.isBanned ? (
                            <button className="btn btn-secondary btn-sm" onClick={() => handleAction('unban', u.id)}>{t('admin.unban')}</button>
                          ) : (
                            <button className="btn btn-danger btn-sm" onClick={() => handleAction('ban', u.id)}>{t('admin.ban')}</button>
                          )}
                          <button className="btn btn-ghost btn-sm" onClick={() => handleAction('delete', u.id)}>🗑</button>
                        </div>
                      )}
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
