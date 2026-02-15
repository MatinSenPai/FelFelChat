'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import Sidebar from '@/components/Sidebar';
import ChatView from '@/components/ChatView';
import VoiceCall from '@/components/VoiceCall';

interface Room {
  id: string;
  name: string;
  type: string;
  members: { user: { id: string; username: string; displayName: string | null; lastSeen: string } }[];
  messages: { text: string | null; user: { username: string }; createdAt: string }[];
  _count: { messages: number; members: number };
}

interface CallState {
  status: 'idle' | 'ringing' | 'incoming' | 'active';
  logId?: string;
  callerId?: string;
  calleeId?: string;
  callerName?: string;
  calleeName?: string;
}

export default function ChatPage() {
  const { user, loading, logout } = useAuth();
  const { t, locale, setLocale, dir } = useI18n();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [callState, setCallState] = useState<CallState>({ status: 'idle' });

  // Close sidebar on mobile when clicking outside
  const closeSidebarOnMobile = () => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  };

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.rooms) setRooms(data.rooms);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    }
  }, []);

  // Initialize socket
  useEffect(() => {
    if (!user) return;

    const socket = connectSocket();

    socket.on('user:online', (userId: string) => {
      setOnlineUsers((prev) => new Set(prev).add(userId));
    });

    socket.on('user:offline', (userId: string) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    });

    socket.on('message:new', () => {
      fetchRooms(); // refresh room list for latest message
    });

    // Call events
    socket.on('call:incoming', ({ callerId, callerName, logId }: { callerId: string; callerName: string; logId: string }) => {
      setCallState({ status: 'incoming', callerId, callerName, logId });
    });

    socket.on('call:accepted', ({ logId }: { logId: string }) => {
      setCallState((prev) => ({ ...prev, status: 'active', logId }));
    });

    socket.on('call:ended', () => {
      setCallState({ status: 'idle' });
    });

    socket.on('call:error', (msg: string) => {
      alert(msg);
      setCallState({ status: 'idle' });
    });

    fetchRooms();

    return () => {
      disconnectSocket();
    };
  }, [user, fetchRooms]);

  // Start a call
  const startCall = useCallback((calleeId: string, calleeName: string) => {
    const socket = getSocket();
    socket.emit('call:initiate', { calleeId });
    setCallState({ status: 'ringing', calleeId, calleeName });
  }, []);

  const acceptCall = useCallback(() => {
    if (callState.logId) {
      const socket = getSocket();
      socket.emit('call:accept', { logId: callState.logId });
      setCallState((prev) => ({ ...prev, status: 'active' }));
    }
  }, [callState.logId]);

  const rejectCall = useCallback(() => {
    if (callState.logId) {
      const socket = getSocket();
      socket.emit('call:reject', { logId: callState.logId });
      setCallState({ status: 'idle' });
    }
  }, [callState.logId]);

  const endCall = useCallback(() => {
    if (callState.logId) {
      const socket = getSocket();
      socket.emit('call:end', { logId: callState.logId });
      setCallState({ status: 'idle' });
    }
  }, [callState.logId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (!user) return null;

  const activeRoom = rooms.find((r) => r.id === activeRoomId);

  // For private chats, get the other user's name
  const getPrivateRoomName = (room: Room) => {
    if (room.type !== 'PRIVATE') return room.name;
    const other = room.members.find((m) => m.user.id !== user.id);
    return other?.user.displayName || other?.user.username || room.name;
  };

  return (
    <div style={{ display: 'flex', height: '100vh', direction: dir, position: 'relative' }}>
      {/* Backdrop overlay for mobile */}
      {sidebarOpen && (
        <div
          onClick={closeSidebarOnMobile}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            zIndex: 98,
            display: window.innerWidth < 768 ? 'block' : 'none',
          }}
        />
      )}

      {/* Sidebar */}
      <div
        style={{
          width: sidebarOpen ? 'var(--sidebar-width)' : 0,
          minWidth: sidebarOpen ? 'var(--sidebar-width)' : 0,
          borderInlineEnd: '1px solid var(--bg-tertiary)',
          transition: 'all 0.3s ease',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg-secondary)',
          position: window.innerWidth < 768 ? 'fixed' : 'relative',
          top: 0,
          left: dir === 'rtl' ? 'auto' : 0,
          right: dir === 'rtl' ? 0 : 'auto',
          height: '100vh',
          zIndex: 99,
          transform: window.innerWidth < 768 && !sidebarOpen 
            ? (dir === 'rtl' ? 'translateX(100%)' : 'translateX(-100%)') 
            : 'translateX(0)',
        }}
      >
        <Sidebar
          user={user}
          rooms={rooms}
          activeRoomId={activeRoomId}
          onlineUsers={onlineUsers}
          onSelectRoom={(id) => {
            setActiveRoomId(id);
            closeSidebarOnMobile();
          }}
          onRoomsChange={fetchRooms}
          onLogout={logout}
          t={t}
          locale={locale}
          setLocale={setLocale}
          getPrivateRoomName={getPrivateRoomName}
        />
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {activeRoom ? (
          <ChatView
            room={activeRoom}
            user={user}
            onlineUsers={onlineUsers}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            onStartCall={startCall}
            t={t}
            dir={dir}
            roomDisplayName={getPrivateRoomName(activeRoom)}
          />
        ) : (
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--fg-muted)',
            gap: 16,
          }}>
            <div style={{ fontSize: 64 }}>🌶️</div>
            <h2 style={{
              background: 'var(--accent-gradient)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              {t('app.name')}
            </h2>
            <p>{t('chat.selectChat')}</p>
            {/* Mobile: show sidebar button */}
            {!sidebarOpen && (
              <button className="btn btn-secondary" onClick={() => setSidebarOpen(true)}>
                {t('chat.rooms')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Voice Call Overlay */}
      {callState.status !== 'idle' && (
        <VoiceCall
          status={callState.status}
          callerName={callState.callerName}
          calleeName={callState.calleeName}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={endCall}
          t={t}
        />
      )}
    </div>
  );
}
