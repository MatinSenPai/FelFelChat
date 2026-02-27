'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Locale } from '@/lib/i18n';
import Image from 'next/image';
import AppIcon from './AppIcon';

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
  profilePhotoUrl?: string | null;
  members: { user: { id: string; username: string; displayName: string | null; lastSeen: string } }[];
  messages: { text: string | null; user: { username: string }; createdAt: string }[];
  _count: { messages: number; members: number };
}

interface SidebarProps {
  user: User;
  rooms: Room[];
  roomsLoading: boolean;
  unreadByRoom: Record<string, number>;
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
  roomsLoading,
  unreadByRoom,
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
  const brandLogoSrc = '/favicon.ico';
  const filteredRooms = rooms.filter((room) =>
    getPrivateRoomName(room).toLowerCase().includes(searchTerm.toLowerCase())
  );

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
    <div className="sidebar-root">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-brand-row">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Image
              src={brandLogoSrc}
              alt={t('app.name')}
              width={110}
              height={30}
              unoptimized
              style={{ width: 98, height: 'auto', objectFit: 'contain' }}
            />
          </div>
          <div className="lang-toggle">
            <button className={locale === 'fa' ? 'active' : ''} onClick={() => setLocale('fa')}>FA</button>
            <button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="sidebar-search-wrap">
        <input
          className="input"
          placeholder={t('chat.searchMessages')}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ fontSize: 13, height: 40, borderRadius: 9999, paddingInline: 14 }}
        />
      </div>

      {/* New Chat Button */}
      <div style={{ padding: '0 14px 8px' }}>
        <button
          className="btn btn-primary btn-sm"
          style={{ width: '100%', borderRadius: 12, height: 40 }}
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
          padding: '0 14px 12px',
          borderBottom: '1px solid rgba(255, 146, 108, 0.15)',
        }}>
          <input
            className="input"
            placeholder={t('chat.searchUsers')}
            onChange={(e) => searchUsers(e.target.value)}
            style={{ fontSize: 13, marginBottom: 8, height: 40, borderRadius: 12 }}
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
      <div className="sidebar-rooms">
        {roomsLoading ? (
          Array.from({ length: 7 }).map((_, index) => (
            <div key={`room-skeleton-${index}`} className="sidebar-room" style={{ pointerEvents: 'none', opacity: 0.7 }}>
              <div className="avatar" style={{ background: 'rgba(255, 132, 96, 0.2)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ height: 11, width: `${62 + ((index * 7) % 20)}%`, borderRadius: 9999, background: 'rgba(255, 132, 96, 0.28)' }} />
                <div style={{ marginTop: 8, height: 9, width: `${45 + ((index * 11) % 30)}%`, borderRadius: 9999, background: 'rgba(255, 132, 96, 0.14)' }} />
              </div>
            </div>
          ))
        ) : filteredRooms.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--fg-muted)', fontSize: 14 }}>
            {t('chat.noRooms')}
          </div>
        ) : (
          filteredRooms.map((room) => {
            const roomName = getPrivateRoomName(room);
            const lastMsg = room.messages[0];
            const isActive = room.id === activeRoomId;
            const unreadCount = unreadByRoom[room.id] || 0;
            const isEncryptedPreview = typeof lastMsg?.text === 'string' && lastMsg.text.startsWith('hush:v1:');
            const lastPreviewText = isEncryptedPreview ? 'Encrypted message' : (lastMsg?.text || t('chat.attachFile'));

            // Check if any member in a private room is online
            const otherMember = room.type === 'PRIVATE'
              ? room.members.find((m) => m.user.id !== user.id)
              : null;
            const isOnline = otherMember ? onlineUsers.has(otherMember.user.id) : false;

            const typeIconName = room.type === 'CHANNEL' ? 'channel' : room.type === 'GROUP' ? 'group' : null;

            return (
              <div
                key={room.id}
                onClick={() => onSelectRoom(room.id)}
                className={`sidebar-room${isActive ? ' active' : ''}`}
              >
                <div style={{ position: 'relative' }}>
                  {room.profilePhotoUrl ? (
                    <Image
                      src={room.profilePhotoUrl}
                      alt={roomName}
                      className="avatar"
                      width={48}
                      height={48}
                      unoptimized
                      style={{ objectFit: 'cover' }}
                    />
                  ) : (
                    <div
                      className="avatar"
                      style={{ background: getAvatarColor(roomName) }}
                    >
                      {typeIconName ? <AppIcon name={typeIconName} size={20} /> : getInitials(roomName)}
                    </div>
                  )}
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
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                        <span style={{ fontSize: 11, color: 'var(--fg-muted)' }}>
                          {timeAgo(lastMsg.createdAt)}
                        </span>
                        {unreadCount > 0 && (
                          <span className="badge-count" style={{ minWidth: 18, height: 18, fontSize: 10, paddingInline: 5 }}>
                            {unreadCount > 99 ? '99+' : unreadCount}
                          </span>
                        )}
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
                      {lastPreviewText}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* User Info Footer */}
      <div className="sidebar-footer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
              <Image
                src={user.avatarUrl}
                alt="Avatar"
                width={40}
                height={40}
                unoptimized
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
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
              <AppIcon name="settings" size={16} />
            </a>
          )}
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onLogout} title={t('auth.logout')}>
            <AppIcon name="logout" size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
