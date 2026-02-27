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

type CallSignalData =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'ice-candidate'; candidate: RTCIceCandidateInit };

interface CallSignalPayload {
  fromUserId: string;
  signal: CallSignalData;
}

interface IceServerConfig {
  urls: string | string[];
  username?: string;
  credential?: string;
}

function isIceServerConfig(value: unknown): value is IceServerConfig {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const maybe = value as Record<string, unknown>;
  const urls = maybe.urls;
  if (typeof urls === 'string') {
    return true;
  }
  if (Array.isArray(urls)) {
    return urls.every((item) => typeof item === 'string');
  }
  return false;
}

function getConfiguredIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [];
  const rawJson = process.env.NEXT_PUBLIC_WEBRTC_ICE_SERVERS;
  if (rawJson && rawJson.trim()) {
    try {
      const parsed = JSON.parse(rawJson) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (isIceServerConfig(item)) {
            servers.push({
              urls: item.urls,
              username: item.username,
              credential: item.credential,
            });
          }
        }
      }
    } catch (error) {
      console.error('Invalid NEXT_PUBLIC_WEBRTC_ICE_SERVERS:', error);
    }
  }
  if (servers.length > 0) {
    return servers;
  }
  const stunUrls = (process.env.NEXT_PUBLIC_WEBRTC_STUN_URLS || 'stun:stun.l.google.com:19302')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (stunUrls.length > 0) {
    servers.push({ urls: stunUrls });
  }
  const turnUrls = (process.env.NEXT_PUBLIC_WEBRTC_TURN_URLS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const turnUsername = process.env.NEXT_PUBLIC_WEBRTC_TURN_USERNAME;
  const turnCredential = process.env.NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL;
  if (turnUrls.length > 0 && turnUsername && turnCredential) {
    servers.push({
      urls: turnUrls,
      username: turnUsername,
      credential: turnCredential,
    });
  }
  return servers;
}

const configuredIceServers = getConfiguredIceServers();

function hasTurnServerConfigured(servers: RTCIceServer[]): boolean {
  return servers.some((server) => {
    const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
    return urls.some((url) => typeof url === 'string' && (url.startsWith('turn:') || url.startsWith('turns:')));
  });
}

const turnServerConfigured = hasTurnServerConfigured(configuredIceServers);

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
  const [isCallMuted, setIsCallMuted] = useState(false);
  const [audioPlaybackBlocked, setAudioPlaybackBlocked] = useState(false);
  const pendingOutgoingCancelRef = useRef(false);
  const roomsRef = useRef<Room[]>([]);
  const callStateRef = useRef<CallState>({ status: 'idle' });
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const activePeerUserIdRef = useRef<string | null>(null);
  const offerSentLogIdRef = useRef<string | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const connectionFailureHandledRef = useRef(false);
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
    callStateRef.current = callState;
  }, [callState]);

  const cleanupCallMedia = useCallback(() => {
    if (peerConnectionRef.current) {
      peerConnectionRef.current.onicecandidate = null;
      peerConnectionRef.current.ontrack = null;
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    if (remoteStreamRef.current) {
      for (const track of remoteStreamRef.current.getTracks()) {
        track.stop();
      }
      remoteStreamRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    pendingIceCandidatesRef.current = [];
    activePeerUserIdRef.current = null;
    offerSentLogIdRef.current = null;
    connectionFailureHandledRef.current = false;
    setIsCallMuted(false);
    setAudioPlaybackBlocked(false);
  }, []);

  const tryPlayRemoteAudio = useCallback(async () => {
    const audioElement = remoteAudioRef.current;
    if (!audioElement || !audioElement.srcObject) {
      return;
    }
    try {
      await audioElement.play();
      setAudioPlaybackBlocked(false);
    } catch (error) {
      console.error('Remote audio playback blocked:', error);
      setAudioPlaybackBlocked(true);
    }
  }, []);

  const ensureLocalStream = useCallback(async () => {
    if (localStreamRef.current) {
      return localStreamRef.current;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Media devices are not available');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    setIsCallMuted(false);
    return stream;
  }, []);

  const flushPendingIceCandidates = useCallback(async (pc: RTCPeerConnection) => {
    if (!pc.remoteDescription) {
      return;
    }
    const queued = [...pendingIceCandidatesRef.current];
    pendingIceCandidatesRef.current = [];
    for (const candidate of queued) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }, []);

  const ensurePeerConnection = useCallback((targetUserId: string) => {
    if (peerConnectionRef.current) {
      return peerConnectionRef.current;
    }
    const pc = new RTCPeerConnection({
      iceServers: configuredIceServers,
    });
    activePeerUserIdRef.current = targetUserId;
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] connectionState:', pc.connectionState);
      if (pc.connectionState !== 'failed' || connectionFailureHandledRef.current) {
        return;
      }
      connectionFailureHandledRef.current = true;
      const reason = turnServerConfigured
        ? 'Call connection failed on current network.'
        : 'Call connection failed. Configure TURN server credentials in NEXT_PUBLIC_WEBRTC_TURN_URLS, NEXT_PUBLIC_WEBRTC_TURN_USERNAME, and NEXT_PUBLIC_WEBRTC_TURN_CREDENTIAL.';
      alert(reason);
    };
    pc.onicecandidate = (event) => {
      if (!event.candidate || !activePeerUserIdRef.current) {
        return;
      }
      console.log('[WebRTC] Sending ICE candidate:', event.candidate.type, event.candidate.protocol);
      const socket = getSocket();
      socket.emit('call:signal', {
        targetUserId: activePeerUserIdRef.current,
        signal: { type: 'ice-candidate', candidate: event.candidate.toJSON() },
      });
    };
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received:', event.track.kind);
      if (event.streams && event.streams[0]) {
        remoteStreamRef.current = event.streams[0];
      } else {
        if (!remoteStreamRef.current) {
          remoteStreamRef.current = new MediaStream();
        }
        remoteStreamRef.current.addTrack(event.track);
      }
      if (remoteAudioRef.current && remoteStreamRef.current && remoteAudioRef.current.srcObject !== remoteStreamRef.current) {
        remoteAudioRef.current.srcObject = remoteStreamRef.current;
      }
      void tryPlayRemoteAudio();
    };
    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] iceConnectionState:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        pc.restartIce();
      }
    };
    peerConnectionRef.current = pc;
    return pc;
  }, [tryPlayRemoteAudio]);

  const ensureAudioTrackBound = useCallback((pc: RTCPeerConnection, stream: MediaStream) => {
    const hasAudioSender = pc.getSenders().some((sender) => sender.track?.kind === 'audio');
    if (hasAudioSender) {
      return;
    }
    for (const track of stream.getAudioTracks()) {
      pc.addTrack(track, stream);
    }
  }, []);

  const setupActiveCallMedia = useCallback(async (targetUserId: string, shouldCreateOffer: boolean, logId?: string) => {
    const stream = await ensureLocalStream();
    const pc = ensurePeerConnection(targetUserId);
    ensureAudioTrackBound(pc, stream);
    if (shouldCreateOffer && logId && offerSentLogIdRef.current !== logId) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const socket = getSocket();
      socket.emit('call:signal', {
        targetUserId,
        signal: { type: 'offer', sdp: offer },
      });
      offerSentLogIdRef.current = logId;
    }
  }, [ensureAudioTrackBound, ensureLocalStream, ensurePeerConnection]);

  const handleCallSignal = useCallback(async ({ fromUserId, signal }: CallSignalPayload) => {
    const currentCall = callStateRef.current;
    if (currentCall.status === 'idle') {
      return;
    }
    try {
      const stream = await ensureLocalStream();
      const pc = ensurePeerConnection(fromUserId);
      ensureAudioTrackBound(pc, stream);
      if (signal.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await flushPendingIceCandidates(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const socket = getSocket();
        socket.emit('call:signal', {
          targetUserId: fromUserId,
          signal: { type: 'answer', sdp: answer },
        });
        return;
      }
      if (signal.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await flushPendingIceCandidates(pc);
        return;
      }
      if (pc.remoteDescription) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      } else {
        pendingIceCandidatesRef.current.push(signal.candidate);
      }
    } catch (error) {
      console.error('Failed to handle call signal:', error);
    }
  }, [ensureAudioTrackBound, ensureLocalStream, ensurePeerConnection, flushPendingIceCandidates]);

  const toggleMute = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) {
      return;
    }
    const nextMuted = !isCallMuted;
    for (const track of stream.getAudioTracks()) {
      track.enabled = !nextMuted;
    }
    setIsCallMuted(nextMuted);
  }, [isCallMuted]);

  const resumeAudioPlayback = useCallback(() => {
    void tryPlayRemoteAudio();
  }, [tryPlayRemoteAudio]);

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

    const handleConnectError = (error: Error & { data?: unknown }) => {
      console.error('Socket connect error:', error.message, error.data);
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
      cleanupCallMedia();
      const nextState: CallState = { status: 'incoming', callerId, callerName, calleeId: user.id, logId };
      callStateRef.current = nextState;
      setCallState(nextState);
    };

    const handleCallInitiated = ({ logId, calleeId }: { logId: string; calleeId: string }) => {
      if (pendingOutgoingCancelRef.current) {
        pendingOutgoingCancelRef.current = false;
        const cancelSocket = getSocket();
        cancelSocket.emit('call:end', { logId });
        return;
      }
      setCallState((prev) => {
        if (prev.status !== 'ringing') {
          return prev;
        }
        if (prev.calleeId && prev.calleeId !== calleeId) {
          return prev;
        }
        const nextState: CallState = { ...prev, logId };
        callStateRef.current = nextState;
        return nextState;
      });
    };

    const handleCallAccepted = ({ logId }: { logId: string }) => {
      setCallState((prev) => {
        if (prev.status === 'idle') {
          return prev;
        }
        const nextState: CallState = { ...prev, status: 'active', logId };
        callStateRef.current = nextState;
        return nextState;
      });
    };

    const handleCallEnded = () => {
      pendingOutgoingCancelRef.current = false;
      cleanupCallMedia();
      callStateRef.current = { status: 'idle' };
      setCallState({ status: 'idle' });
    };

    const handleCallError = (msg: string) => {
      pendingOutgoingCancelRef.current = false;
      cleanupCallMedia();
      alert(msg);
      callStateRef.current = { status: 'idle' };
      setCallState({ status: 'idle' });
    };

    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);
    socket.on('connect_error', handleConnectError);
    socket.on('message:new', handleMessageNew);
    socket.on('room:new', handleRoomNew);
    socket.on('call:incoming', handleCallIncoming);
    socket.on('call:initiated', handleCallInitiated);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:signal', handleCallSignal);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:error', handleCallError);

    const initialFetchTimer = setTimeout(() => {
      void fetchRooms();
    }, 0);

    return () => {
      clearTimeout(initialFetchTimer);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      socket.off('connect_error', handleConnectError);
      socket.off('message:new', handleMessageNew);
      socket.off('room:new', handleRoomNew);
      socket.off('call:incoming', handleCallIncoming);
      socket.off('call:initiated', handleCallInitiated);
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:signal', handleCallSignal);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:error', handleCallError);
      cleanupCallMedia();
      disconnectSocket();
    };
  }, [user, fetchRooms, activeRoomId, cleanupCallMedia, handleCallSignal]);

  // Start a call
  const startCall = useCallback(async (calleeId: string, calleeName: string) => {
    if (!user) {
      return;
    }
    pendingOutgoingCancelRef.current = false;
    cleanupCallMedia();
    try {
      await ensureLocalStream();
    } catch (error) {
      console.error('Failed to access microphone:', error);
      alert('Microphone permission is required for voice calls.');
      cleanupCallMedia();
      return;
    }
    const socket = getSocket();
    socket.emit('call:initiate', { calleeId });
    const nextState: CallState = { status: 'ringing', callerId: user.id, calleeId, calleeName };
    callStateRef.current = nextState;
    setCallState(nextState);
  }, [cleanupCallMedia, ensureLocalStream, user]);

  const acceptCall = useCallback(async () => {
    if (callState.logId && user) {
      try {
        await ensureLocalStream();
      } catch (error) {
        console.error('Failed to access microphone:', error);
        alert('Microphone permission is required for voice calls.');
        cleanupCallMedia();
        return;
      }
      const socket = getSocket();
      socket.emit('call:accept', { logId: callState.logId });
      setCallState((prev) => {
        const nextState: CallState = { ...prev, status: 'active', calleeId: user.id };
        callStateRef.current = nextState;
        return nextState;
      });
    }
  }, [callState.logId, cleanupCallMedia, ensureLocalStream, user]);

  const rejectCall = useCallback(() => {
    const logId = callState.logId;
    pendingOutgoingCancelRef.current = false;
    cleanupCallMedia();
    callStateRef.current = { status: 'idle' };
    setCallState({ status: 'idle' });
    if (logId) {
      const socket = getSocket();
      socket.emit('call:reject', { logId });
    }
  }, [callState.logId, cleanupCallMedia]);

  const endCall = useCallback(() => {
    const logId = callState.logId;
    const shouldQueueCancel = callState.status === 'ringing' && !logId;
    cleanupCallMedia();
    callStateRef.current = { status: 'idle' };
    setCallState({ status: 'idle' });
    if (shouldQueueCancel) {
      pendingOutgoingCancelRef.current = true;
      return;
    }
    pendingOutgoingCancelRef.current = false;
    if (logId) {
      const socket = getSocket();
      socket.emit('call:end', { logId });
    }
  }, [callState.logId, callState.status, cleanupCallMedia]);

  useEffect(() => {
    if (!user || callState.status !== 'active' || !callState.logId) {
      return;
    }
    const targetUserId = callState.callerId === user.id ? callState.calleeId : callState.callerId;
    if (!targetUserId) {
      return;
    }
    let disposed = false;
    const shouldCreateOffer = callState.callerId === user.id;
    const run = async () => {
      try {
        await setupActiveCallMedia(targetUserId, shouldCreateOffer, callState.logId);
      } catch (error) {
        if (disposed) {
          return;
        }
        console.error('Failed to start call media:', error);
        alert('Microphone permission is required for voice calls.');
        cleanupCallMedia();
        callStateRef.current = { status: 'idle' };
        setCallState({ status: 'idle' });
        const socket = getSocket();
        socket.emit('call:end', { logId: callState.logId });
      }
    };
    void run();
    return () => {
      disposed = true;
    };
  }, [
    callState.calleeId,
    callState.callerId,
    callState.logId,
    callState.status,
    cleanupCallMedia,
    setupActiveCallMedia,
    user,
  ]);

  useEffect(() => {
    return () => {
      cleanupCallMedia();
    };
  }, [cleanupCallMedia]);

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
          isMuted={isCallMuted}
          audioPlaybackBlocked={audioPlaybackBlocked}
          onAccept={acceptCall}
          onReject={rejectCall}
          onEnd={endCall}
          onToggleMute={toggleMute}
          onResumeAudio={resumeAudioPlayback}
          t={t}
        />
      )}
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }} />
    </div>
  );
}
