'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';

export default function AdminMessagesPage() {
  const { t, dir } = useI18n();
  const [messages, setMessages] = useState<{ id: string; text: string | null; fileUrl: string | null; createdAt: string; user: { username: string }; room: { name: string } }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetch('/api/admin/messages')
      .then((r) => r.json())
      .then((data) => setMessages(data.messages || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const filteredMessages = messages.filter((m) =>
    (m.text || '').toLowerCase().includes(search.toLowerCase()) ||
    m.user.username.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: dir }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bg-tertiary)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/admin" className="btn btn-ghost btn-sm">← {t('common.back')}</Link>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>✉️ {t('admin.messages')}</h1>
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
                  <th>User</th>
                  <th>Room</th>
                  <th>Message</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                {filteredMessages.slice(0, 100).map((msg) => (
                  <tr key={msg.id}>
                    <td style={{ fontWeight: 500 }}>@{msg.user.username}</td>
                    <td>{msg.room.name}</td>
                    <td style={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {msg.fileUrl ? '📎 ' : ''}{msg.text || '(file)'}
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{new Date(msg.createdAt).toLocaleString()}</td>
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
