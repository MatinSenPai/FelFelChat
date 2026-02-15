'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Locale } from '@/lib/i18n';

interface User {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl?: string | null;
  isSuperAdmin: boolean;
}

interface Room {
  id: string;
  name: string;
  type: string;
  members: { user: { id: string; username: string; displayName: string | null; lastSeen: string } }[];
  messages: { text: string | null; user: { username: string }; createdAt: string }[];
  _count: { messages: number; members: number };
}

interface SidebarProps {
  user: User;
  rooms: Room[];
  activeRoomId: string | null;
  onlineUsers: Set<string>;
  onSelectRoom: (id: string) => void;
  onRoomsChange: () => void;
  onLogout: () => void;
  t: (key: string) => string;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  getPrivateRoomName: (room: Room) => string;
}

const avatarColors = [
  '#e84545', '#ff6b6b', '#4ecdc4', '#45b7d1', '#96c93d',
  '#f9ca24', '#f0932b', '#eb4d4b', '#6c5ce7', '#a29bfe',
];

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function getInitials(name: string) {
  return name.charAt(0).toUpperCase();
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

export default function Sidebar({
  user,
  rooms,
  activeRoomId,
  onlineUsers,
  onSelectRoom,
  onRoomsChange,
  onLogout,
  t,
  locale,
  setLocale,
  getPrivateRoomName,
}: SidebarProps) {
  const router = useRouter();
  const [searchTerm, setSearchTerm] = useState('');
  const [showNewChat, setShowNewChat] = useState(false);
  const [users, setUsers] = useState<{ id: string; username: string; displayName: string | null }[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [showCreateRoom, setShowCreateRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomType, setNewRoomType] = useState<'GROUP' | 'CHANNEL'>('GROUP');


  const filteredRooms = rooms.filter((room) =>
    getPrivateRoomName(room).toLowerCase().includes(searchTerm.toLowerCase())
  );

  const createRoom = async () => {
    if (!newRoomName.trim()) return;
    await fetch('/api/rooms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newRoomName, type: newRoomType }),
    });
    setNewRoomName('');
    setShowCreateRoom(false);
    onRoomsChange();
  };

  const searchUsers = async (query: string) => {
    setLoadingUsers(true);
    try {
      const res = await fetch(`/api/users?search=${encodeURIComponent(query)}`);
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      console.error('Failed to search users');
    }
    setLoadingUsers(false);
  };

  const startPrivateChat = async (targetUserId: string) => {
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'PRIVATE', memberIds: [targetUserId] }),
      });
      const data = await res.json();
      if (data.room) {
        onRoomsChange();
        onSelectRoom(data.room.id);
        setShowNewChat(false);
      }
    } catch {
      console.error('Failed to create private chat');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: 'var(--sidebar-width)' }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--bg-tertiary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>🌶️</span>
          <span style={{
            fontSize: 18, fontWeight: 700,
            background: 'var(--accent-gradient)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          }}>
            {t('app.name')}
          </span>
        </div>
        <div className="lang-toggle">
          <button className={locale === 'fa' ? 'active' : ''} onClick={() => setLocale('fa')}>FA</button>
          <button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
        </div>
      </div>

      {/* Search */}
      <div style={{ padding: '12px 16px' }}>
        <input
          className="input"
          placeholder={t('chat.searchMessages')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ fontSize: 13 }}
        />
      </div>

      {/* New Chat Button */}
      <div style={{ padding: '0 16px 8px' }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ width: '100%' }}
          onClick={() => {
            setShowNewChat(!showNewChat);
            if (!showNewChat) searchUsers('');
          }}
        >
          {showNewChat ? t('common.close') : t('chat.newChat')}
        </button>
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div style={{
          padding: '0 16px 12px',
          borderBottom: '1px solid var(--bg-tertiary)',
        }}>
          <input
            className="input"
            placeholder={t('chat.searchUsers')}
            onChange={(e) => searchUsers(e.target.value)}
            style={{ fontSize: 13, marginBottom: 8 }}
            autoFocus
          />
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {loadingUsers ? (
              <div style={{ textAlign: 'center', padding: 12 }}>
                <div className="spinner" style={{ width: 20, height: 20, margin: '0 auto' }} />
              </div>
            ) : users.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--fg-muted)', textAlign: 'center', padding: 12 }}>
                {t('common.noResults')}
              </p>
            ) : (
              users.map((u) => (
                <div
                  key={u.id}
                  onClick={() => startPrivateChat(u.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '8px 12px', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', transition: 'background 0.15s',
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <div
                    className="avatar avatar-sm"
                    style={{ background: getAvatarColor(u.username) }}
                  >
                    {getInitials(u.displayName || u.username)}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 500 }}>{u.displayName || u.username}</div>
                    <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>@{u.username}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Room List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filteredRooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--fg-muted)', fontSize: 14 }}>
            {t('chat.noRooms')}
          </div>
        ) : (
          filteredRooms.map((room) => {
            const roomName = getPrivateRoomName(room);
            const lastMsg = room.messages[0];
            const isActive = room.id === activeRoomId;

            // Check if any member in a private room is online
            const otherMember = room.type === 'PRIVATE'
              ? room.members.find((m) => m.user.id !== user.id)
              : null;
            const isOnline = otherMember ? onlineUsers.has(otherMember.user.id) : false;

            const typeIcon = room.type === 'CHANNEL' ? '📢' : room.type === 'GROUP' ? '👥' : '';

            return (
              <div
                key={room.id}
                onClick={() => onSelectRoom(room.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  cursor: 'pointer',
                  background: isActive ? 'var(--bg-hover)' : 'transparent',
                  borderInlineStart: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                  transition: 'all 0.15s',
                }}
                onMouseOver={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--bg-tertiary)'; }}
                onMouseOut={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <div style={{ position: 'relative' }}>
                  <div
                    className="avatar"
                    style={{ background: getAvatarColor(roomName) }}
                  >
                    {typeIcon || getInitials(roomName)}
                  </div>
                  {room.type === 'PRIVATE' && (
                    <div style={{
                      position: 'absolute', bottom: 0, insetInlineEnd: 0,
                      width: 12, height: 12, borderRadius: '50%',
                      background: isOnline ? 'var(--online)' : 'var(--offline)',
                      border: '2px solid var(--bg-secondary)',
                    }} />
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {roomName}
                    </span>
                    {lastMsg && (
                      <span style={{ fontSize: 11, color: 'var(--fg-muted)', flexShrink: 0 }}>
                        {timeAgo(lastMsg.createdAt)}
                      </span>
                    )}
                  </div>
                  {lastMsg && (
                    <div style={{
                      fontSize: 13, color: 'var(--fg-muted)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      marginTop: 2,
                    }}>
                      {room.type !== 'PRIVATE' && (
                        <span style={{ color: 'var(--fg-secondary)' }}>{lastMsg.user.username}: </span>
                      )}
                      {lastMsg.text || '📎 File'}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* User Info Footer */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--bg-tertiary)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
          onClick={() => router.push('/profile')}
          title="Profile Settings"
        >
          <div
            className="avatar avatar-sm"
            style={{
              background: user.avatarUrl ? 'transparent' : getAvatarColor(user.username),
              transition: 'transform 0.2s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
          >
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              getInitials(user.displayName || user.username)
            )}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{user.displayName || user.username}</div>
            {user.isSuperAdmin && (
              <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>SUPER ADMIN</span>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {user.isSuperAdmin && (
            <a href="/admin" className="btn btn-ghost btn-icon btn-sm" title={t('admin.panel')}>
              ⚙️
            </a>
          )}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onLogout} title={t('auth.logout')}>
            🚪
          </button>
        </div>
      </div>
    </div>
  );
}
