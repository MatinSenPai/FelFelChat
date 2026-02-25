'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket';
import Sidebar from '@/components/Sidebar';
import ChatView from '@/components/ChatView';
import VoiceCall from '@/components/VoiceCall';
import Image from 'next/image';

interface Room {
  id: string;
  name: string;
  type: string;
  profilePhotoUrl?: string | null;
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

interface MessageNewPayload {
  roomId?: string;
  message?: {
    id: string;
    userId: string;
    text?: string | null;
    fileUrl?: string | null;
    createdAt?: string;
    user?: { username?: string };
    username?: string;
  };
}

export default function ChatPage() {
  const { user, loading, logout } = useAuth();
  const { t, locale, setLocale, dir } = useI18n();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [unreadByRoom, setUnreadByRoom] = useState<Record<string, number>>({});
  const [callState, setCallState] = useState<CallState>({ status: 'idle' });
  const roomsRef = useRef<Room[]>([]);
  const brandLogoSrc = '/favicon.ico';

  // Close sidebar on mobile when clicking outside
  const closeSidebarOnMobile = () => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  };

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    const updateViewport = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) {
        setSidebarOpen(true);
      }
    };
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);

  // Fetch rooms
  const fetchRooms = useCallback(async () => {
    setRoomsLoading(true);
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.rooms) setRooms(data.rooms);
    } catch (err) {
      console.error('Failed to fetch rooms:', err);
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  // Initialize socket
  useEffect(() => {
    if (!user) return;

    const socket = connectSocket();

    const handleUserOnline = (userId: string) => {
      setOnlineUsers((prev) => new Set(prev).add(userId));
    };

    const handleUserOffline = (userId: string) => {
      setOnlineUsers((prev) => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    };

    const handleMessageNew = (payload?: MessageNewPayload) => {
      if (payload?.roomId && payload?.message && payload.message.userId !== user.id && payload.roomId !== activeRoomId) {
        const roomId = payload.roomId;
        setUnreadByRoom((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] || 0) + 1,
        }));
      }
      if (!payload?.roomId || !payload.message) {
        return;
      }
      const roomId = payload.roomId;
      const message = payload.message;
      const roomExists = roomsRef.current.some((room) => room.id === roomId);
      if (!roomExists) {
        void fetchRooms();
        return;
      }
      setRooms((prev) => {
        const roomIndex = prev.findIndex((room) => room.id === roomId);
        if (roomIndex < 0) {
          return prev;
        }
        const room = prev[roomIndex];
        const username = message.user?.username || message.username || room.messages[0]?.user.username || 'system';
        const previewText = message.text ?? null;
        const previewCreatedAt = message.createdAt || new Date().toISOString();
        const updatedRoom: Room = {
          ...room,
          messages: [{ text: previewText, user: { username }, createdAt: previewCreatedAt }],
          _count: room._count,
        };
        const next = [...prev];
        next.splice(roomIndex, 1);
        next.unshift(updatedRoom);
        return next;
      });
    };

    const handleRoomNew = () => {
      void fetchRooms();
    };

    const handleCallIncoming = ({ callerId, callerName, logId }: { callerId: string; callerName: string; logId: string }) => {
      setCallState({ status: 'incoming', callerId, callerName, logId });
    };

    const handleCallAccepted = ({ logId }: { logId: string }) => {
      setCallState((prev) => ({ ...prev, status: 'active', logId }));
    };

    const handleCallEnded = () => {
      setCallState({ status: 'idle' });
    };

    const handleCallError = (msg: string) => {
      alert(msg);
      setCallState({ status: 'idle' });
    };

    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);
    socket.on('message:new', handleMessageNew);
    socket.on('room:new', handleRoomNew);
    socket.on('call:incoming', handleCallIncoming);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:error', handleCallError);

    const initialFetchTimer = setTimeout(() => {
      void fetchRooms();
    }, 0);

    return () => {
      clearTimeout(initialFetchTimer);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      socket.off('message:new', handleMessageNew);
      socket.off('room:new', handleRoomNew);
      socket.off('call:incoming', handleCallIncoming);
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:error', handleCallError);
      disconnectSocket();
    };
  }, [user, fetchRooms, activeRoomId]);

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

  const selectRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setUnreadByRoom((prev) => {
      if (!prev[roomId]) {
        return prev;
      }
      const next = { ...prev };
      delete next[roomId];
      return next;
    });
    closeSidebarOnMobile();
  };

  return (
    <div className="app-shell" style={{ direction: dir }}>
      {/* Backdrop overlay for mobile */}
      {sidebarOpen && isMobile && (
        <div
          onClick={closeSidebarOnMobile}
          className="app-backdrop"
        />
      )}

      {/* Sidebar */}
      <div
        className="app-sidebar-shell"
        style={{
          width: sidebarOpen || !isMobile ? 'var(--sidebar-width)' : 0,
          minWidth: sidebarOpen || !isMobile ? 'var(--sidebar-width)' : 0,
          position: isMobile ? 'fixed' : 'relative',
          top: 0,
          left: dir === 'rtl' ? 'auto' : 0,
          right: dir === 'rtl' ? 0 : 'auto',
          height: '100vh',
          zIndex: 99,
          transform: isMobile && !sidebarOpen 
            ? (dir === 'rtl' ? 'translateX(100%)' : 'translateX(-100%)') 
            : 'translateX(0)',
        }}
      >
        <Sidebar
          user={user}
          rooms={rooms}
          roomsLoading={roomsLoading}
          unreadByRoom={unreadByRoom}
          activeRoomId={activeRoomId}
          onlineUsers={onlineUsers}
          onSelectRoom={selectRoom}
          onRoomsChange={fetchRooms}
          onLogout={logout}
          t={t}
          locale={locale}
          setLocale={setLocale}
          getPrivateRoomName={getPrivateRoomName}
        />
      </div>

      {/* Main Chat Area */}
      <div className="app-main-shell">
        {activeRoom ? (
          <ChatView
            room={activeRoom}
            user={user}
            onlineUsers={onlineUsers}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            onStartCall={startCall}
            t={t}
            dir={dir}
            roomDisplayName={getPrivateRoomName(activeRoom)}
          />
        ) : (
          <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--fg-muted)' }}>
            <div className="card glass" style={{ width: 'min(440px, calc(100vw - 48px))', minHeight: 420, textAlign: 'center', display: 'grid', gap: 14, justifyItems: 'center', alignContent: 'center' }}>
            <Image
              src={brandLogoSrc}
              alt={t('app.name')}
              width={280}
              height={84}
              unoptimized
              style={{ width: 'min(280px, 72vw)', height: 'auto', objectFit: 'contain' }}
            />
            <p>{t('chat.selectChat')}</p>
            {/* Mobile: show sidebar button */}
            {!sidebarOpen && (
              <button className="btn btn-secondary" onClick={() => setSidebarOpen(true)}>
                {t('chat.rooms')}
              </button>
            )}
            </div>
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
