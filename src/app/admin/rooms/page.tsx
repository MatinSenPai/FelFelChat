'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';

interface RoomItem {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  members: { user: { id: string; username: string; displayName: string | null } }[];
  _count: { messages: number; members: number };
}

export default function AdminRoomsPage() {
  const { t, dir } = useI18n();
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('GROUP');

  const fetchRooms = () => {
    fetch('/api/admin/rooms')
      .then((r) => r.json())
      .then((data) => setRooms(data.rooms || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRooms(); }, []);

  const createRoom = async () => {
    if (!newName.trim()) return;
    await fetch('/api/admin/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'create', name: newName, type: newType }),
    });
    setNewName('');
    setShowCreate(false);
    fetchRooms();
  };

  const deleteRoom = async (roomId: string) => {
    if (!confirm(t('common.confirm') + '?')) return;
    await fetch('/api/admin/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', roomId }),
    });
    fetchRooms();
  };

  const typeIcon = (type: string) => type === 'CHANNEL' ? '📢' : type === 'GROUP' ? '👥' : '💬';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: dir }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bg-tertiary)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/admin" className="btn btn-ghost btn-sm">← {t('common.back')}</Link>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>💬 {t('admin.rooms')}</h1>
      </div>
      <div style={{ padding: 24 }}>
        <button className="btn btn-primary btn-sm" style={{ marginBottom: 16 }} onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? t('common.cancel') : t('admin.createRoom')}
        </button>

        {showCreate && (
          <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'block', marginBottom: 4 }}>Name</label>
              <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Room name" />
            </div>
            <div>
              <label style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'block', marginBottom: 4 }}>Type</label>
              <select className="input" value={newType} onChange={(e) => setNewType(e.target.value)} style={{ padding: '12px' }}>
                <option value="GROUP">{t('chat.group')}</option>
                <option value="CHANNEL">{t('chat.channel')}</option>
              </select>
            </div>
            <button className="btn btn-primary" onClick={createRoom}>{t('common.save')}</button>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Name</th>
                  <th>{t('chat.members')}</th>
                  <th>{t('admin.totalMessages')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((room) => (
                  <tr key={room.id}>
                    <td>{typeIcon(room.type)} {room.type}</td>
                    <td style={{ fontWeight: 500 }}>{room.name}</td>
                    <td>
                      <Link href={`/admin/rooms/${room.id}/members`} className="btn btn-sm btn-ghost">
                        {room._count.members} members →
                      </Link>
                    </td>
                    <td>{room._count.messages}</td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => deleteRoom(room.id)}>🗑</button>
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
