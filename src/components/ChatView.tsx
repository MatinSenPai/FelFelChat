'use client';

import { useState, useEffect, useRef, FormEvent, useCallback } from 'react';
import { getSocket } from '@/lib/socket';
import ImagePreviewModal from './ImagePreviewModal';
import UserProfileModal from './UserProfileModal';
import GroupMembersModal from './GroupMembersModal';
import EmojiStickerPicker from './EmojiStickerPicker';
import { compressImage } from '@/lib/imageCompression';
import { decryptHushMessage, encryptHushMessage, isHushEncryptedMessage } from '@/lib/hushCrypto';
import Image from 'next/image';
import AppIcon from './AppIcon';

interface User {
  id: string;
  username: string;
  displayName: string | null;
  isSuperAdmin: boolean;
}

interface Room {
  id: string;
  name: string;
  type: string;
  profilePhotoUrl?: string | null;
  members: { user: { id: string; username: string; displayName: string | null; lastSeen: string } }[];
}

interface Message {
  id: string;
  text: string | null;
  decryptedText?: string | null;
  encryptedTextState?: 'plain' | 'locked' | 'failed';
  readBy?: string;
  fileUrl: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  messageType?: string;
  userId: string;
  createdAt: string;
  user: { id: string; username: string; displayName: string | null; avatarUrl?: string | null };
  replyTo?: {
    id: string;
    text: string | null;
    decryptedText?: string | null;
    encryptedTextState?: 'plain' | 'locked' | 'failed';
    fileUrl: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    user: { id: string; username: string; displayName: string | null; avatarUrl?: string | null };
  } | null;
  pending?: boolean;
}

interface MessageNewEventPayload {
  roomId?: string;
  message?: Message;
}

interface MessageReadEventPayload {
  messageId?: string;
  userId?: string;
  readBy?: string;
}

interface ChatViewProps {
  room: Room;
  user: User;
  onlineUsers: Set<string>;
  onToggleSidebar: () => void;
  onStartCall: (calleeId: string, calleeName: string) => void;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
  roomDisplayName: string;
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

function splitReadBy(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(/[,\s;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mergeReadBy(current: string | undefined, userId: string): string {
  const next = new Set(splitReadBy(current));
  next.add(userId);
  return Array.from(next).join(',');
}

export default function ChatView({
  room,
  user,
  onlineUsers,
  onToggleSidebar,
  onStartCall,
  t,
  dir,
  roomDisplayName,
}: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewingUser, setViewingUser] = useState<string | null>(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [uploadingRoomPhoto, setUploadingRoomPhoto] = useState(false);
  const [animatingMessageIds, setAnimatingMessageIds] = useState<Set<string>>(new Set());
  const [sendInputBurst, setSendInputBurst] = useState(false);
  const [roomPassphrase, setRoomPassphrase] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const roomPhotoInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const animationTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const roomPassphraseRef = useRef('');
  const seenMessagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    roomPassphraseRef.current = roomPassphrase;
  }, [roomPassphrase]);

  useEffect(() => {
    const storageKey = `felfel:hush:${room.id}`;
    seenMessagesRef.current = new Set();
    roomPassphraseRef.current = '';
    setRoomPassphrase('');
    const storedPassphrase = sessionStorage.getItem(storageKey) || '';
    roomPassphraseRef.current = storedPassphrase;
    setRoomPassphrase(storedPassphrase);
  }, [room.id]);

  const hydrateText = useCallback(async (rawText: string | null | undefined): Promise<{ text: string | null; state: 'plain' | 'locked' | 'failed' }> => {
    if (!rawText) {
      return { text: null, state: 'plain' };
    }
    if (!isHushEncryptedMessage(rawText)) {
      return { text: rawText, state: 'plain' };
    }
    const passphrase = roomPassphraseRef.current.trim();
    if (!passphrase) {
      return { text: null, state: 'locked' };
    }
    try {
      const decrypted = await decryptHushMessage(rawText, passphrase, room.id);
      return { text: decrypted, state: 'plain' };
    } catch {
      return { text: null, state: 'failed' };
    }
  }, [room.id]);

  const hydrateMessage = useCallback(async (incoming: Message): Promise<Message> => {
    const messageText = await hydrateText(incoming.text);
    let hydratedReply = incoming.replyTo || null;
    if (incoming.replyTo) {
      const replyText = await hydrateText(incoming.replyTo.text);
      hydratedReply = {
        ...incoming.replyTo,
        decryptedText: replyText.text,
        encryptedTextState: replyText.state,
      };
    }
    return {
      ...incoming,
      decryptedText: messageText.text,
      encryptedTextState: messageText.state,
      replyTo: hydratedReply,
    };
  }, [hydrateText]);

  useEffect(() => {
    const loadMessages = async () => {
      setLoading(true);
      setMessages([]);
      try {
        const res = await fetch(`/api/messages/${room.id}`);
        const data = await res.json();
        if (data.messages) {
          const hydrated = await Promise.all((data.messages as Message[]).map((item) => hydrateMessage(item)));
          setMessages(hydrated);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    const timer = setTimeout(() => {
      void loadMessages();
    }, 0);
    return () => clearTimeout(timer);
  }, [room.id, roomPassphrase, hydrateMessage]);

  const markMessageAnimated = useCallback((messageId: string) => {
    setAnimatingMessageIds((prev) => {
      const next = new Set(prev);
      next.add(messageId);
      return next;
    });
    const existingTimeout = animationTimeoutsRef.current.get(messageId);
    if (existingTimeout) clearTimeout(existingTimeout);
    const timeoutId = setTimeout(() => {
      setAnimatingMessageIds((prev) => {
        const next = new Set(prev);
        next.delete(messageId);
        return next;
      });
      animationTimeoutsRef.current.delete(messageId);
    }, 420);
    animationTimeoutsRef.current.set(messageId, timeoutId);
  }, []);

  const upsertMessage = useCallback(async (incoming: Message) => {
    const hydratedIncoming = await hydrateMessage(incoming);
    setMessages((prev) => {
      const existingIndex = prev.findIndex((item) => item.id === hydratedIncoming.id);
      if (existingIndex >= 0) {
        const next = [...prev];
        next[existingIndex] = { ...next[existingIndex], ...hydratedIncoming, pending: false };
        return next;
      }
      return [...prev, hydratedIncoming];
    });
    markMessageAnimated(hydratedIncoming.id);
  }, [markMessageAnimated, hydrateMessage]);

  const replaceTempMessage = useCallback(async (tempId: string, message: Message) => {
    const hydratedMessage = await hydrateMessage(message);
    setMessages((prev) => {
      const tempIndex = prev.findIndex((item) => item.id === tempId);
      if (tempIndex >= 0) {
        const next = prev.filter((item) => item.id !== tempId && item.id !== hydratedMessage.id);
        const insertIndex = Math.min(tempIndex, next.length);
        next.splice(insertIndex, 0, { ...hydratedMessage, pending: false });
        return next;
      }
      if (prev.some((item) => item.id === hydratedMessage.id)) {
        return prev.map((item) => (item.id === hydratedMessage.id ? { ...item, ...hydratedMessage, pending: false } : item));
      }
      return [...prev, hydratedMessage];
    });
    markMessageAnimated(hydratedMessage.id);
  }, [markMessageAnimated, hydrateMessage]);

  useEffect(() => {
    return () => {
      for (const timeoutId of animationTimeoutsRef.current.values()) {
        clearTimeout(timeoutId);
      }
      animationTimeoutsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleNewMessage = (payload?: MessageNewEventPayload) => {
      if (payload?.roomId && payload.roomId !== room.id) return;
      if (payload?.message) {
        void upsertMessage({ ...payload.message, pending: false });
        if (payload.message.userId !== user.id) {
          socket.emit('message:read', { roomId: room.id, messageId: payload.message.id });
        }
        return;
      }
      fetch(`/api/messages/${room.id}`)
        .then((res) => res.json())
        .then(async (data) => {
          if (data.messages) {
            const hydrated = await Promise.all((data.messages as Message[]).map((item) => hydrateMessage(item)));
            setMessages(hydrated);
          }
        });
    };

    const handleMessageRead = (payload?: MessageReadEventPayload) => {
      if (!payload?.messageId || !payload?.userId) {
        return;
      }
      const messageId = payload.messageId;
      const userId = payload.userId;
      const readBy = payload.readBy;
      setMessages((prev) =>
        prev.map((item) =>
          item.id === messageId
            ? { ...item, readBy: readBy || mergeReadBy(item.readBy, userId) }
            : item
        )
      );
    };

    const handleTyping = (username: string) => {
      if (username !== user.username) {
        setTypingUser(username);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 2000);
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:read', handleMessageRead);
    socket.on('message:typing', handleTyping);

    socket.emit('room:join', room.id);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:read', handleMessageRead);
      socket.off('message:typing', handleTyping);
      socket.emit('room:leave', room.id);
    };
  }, [room.id, user.id, user.username, upsertMessage, hydrateMessage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length === 0) {
      return;
    }
    const socket = getSocket();
    const pendingAcks: Array<{ roomId: string; messageId: string }> = [];
    for (const message of messages) {
      if (message.userId === user.id) {
        continue;
      }
      if (seenMessagesRef.current.has(message.id)) {
        continue;
      }
      seenMessagesRef.current.add(message.id);
      pendingAcks.push({ roomId: room.id, messageId: message.id });
    }
    if (pendingAcks.length > 0) {
      for (const payload of pendingAcks) {
        socket.emit('message:read', payload);
      }
    }
  }, [messages, room.id, user.id]);

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedText = text.trim();
    if (!trimmedText) return;
    const passphrase = roomPassphraseRef.current.trim();
    let outgoingText = trimmedText;
    if (passphrase) {
      try {
        outgoingText = await encryptHushMessage(trimmedText, passphrase, room.id);
      } catch (error) {
        console.error('Failed to encrypt message:', error);
        alert('Encryption failed. Message was not sent.');
        return;
      }
    }

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const optimisticMessage: Message = {
      id: tempId,
      text: outgoingText,
      decryptedText: trimmedText,
      encryptedTextState: 'plain',
      fileUrl: null,
      fileName: null,
      mimeType: null,
      messageType: 'text',
      userId: user.id,
      createdAt: new Date().toISOString(),
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
      replyTo: replyingTo
        ? {
            id: replyingTo.id,
            text: replyingTo.text,
            decryptedText: replyingTo.decryptedText ?? replyingTo.text,
            encryptedTextState: replyingTo.encryptedTextState || 'plain',
            fileUrl: replyingTo.fileUrl,
            fileName: replyingTo.fileName || null,
            mimeType: replyingTo.mimeType || null,
            user: replyingTo.user,
          }
        : null,
      pending: true,
    };

    void upsertMessage(optimisticMessage);
    setSendInputBurst(true);
    setTimeout(() => setSendInputBurst(false), 220);
    setText('');
    setReplyingTo(null);

    try {
      const response = await fetch(`/api/messages/${room.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: outgoingText,
          replyToId: optimisticMessage.replyTo?.id || null,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.message) {
        throw new Error('Failed to send message');
      }
      await replaceTempMessage(tempId, data.message as Message);
    } catch (err) {
      setMessages((prev) => prev.filter((message) => message.id !== tempId));
      setText(trimmedText);
      console.error('Failed to send message:', err);
    }
  };

  const handleEncryptionToggle = () => {
    const current = roomPassphraseRef.current;
    const nextValue = window.prompt('Set room encryption key. Leave empty to disable.', current);
    if (nextValue === null) {
      return;
    }
    const trimmed = nextValue.trim();
    const storageKey = `felfel:hush:${room.id}`;
    if (!trimmed) {
      sessionStorage.removeItem(storageKey);
      roomPassphraseRef.current = '';
      setRoomPassphrase('');
      return;
    }
    if (trimmed.length < 6) {
      alert('Encryption key must be at least 6 characters.');
      return;
    }
    sessionStorage.setItem(storageKey, trimmed);
    roomPassphraseRef.current = trimmed;
    setRoomPassphrase(trimmed);
  };

  const handleTyping = () => {
    const socket = getSocket();
    socket.emit('message:typing', room.id);
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    try {
      if (file.size > 50 * 1024 * 1024) {
        alert('File size should be less than 50MB');
        return;
      }

      console.log('📁 File upload:', file.name, 'Type:', file.type, 'Size:', file.size);

      // Compress ONLY if it's an image
      const isImage = file.type.startsWith('image/');
      const finalFile = isImage ? await compressImage(file) : file;
      const mimeType = file.type; // Use original file type (important!)

      console.log('✅ MIME type:', mimeType);

      const formData = new FormData();
      formData.append('file', finalFile);

      const uploadRes = await fetch('/api/upload', { method: 'POST', body: formData });
      const uploadData = await uploadRes.json();

      console.log('📤 Upload result:', uploadData);

      if (uploadData.fileUrl) {
        const messageData = {
          fileUrl: uploadData.fileUrl,
          fileName: file.name,
          fileSize: uploadData.fileSize,
          mimeType,
        };
        
        console.log('💬 Sending message:', messageData);
        
        const messageRes = await fetch(`/api/messages/${room.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messageData),
        });
        const messageJson = await messageRes.json();
        if (messageRes.ok && messageJson.message) {
          void upsertMessage(messageJson.message as Message);
        }
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
    setUploading(false);
  };

  const handleEmojiSelect = (emoji: string) => {
    setText((prev) => prev + emoji);
  };

  const handleStickerSelect = async (stickerId: string, stickerUrl: string) => {
    try {
      const res = await fetch(`/api/messages/${room.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: null,
          fileUrl: stickerUrl,
          messageType: 'sticker',
          replyToId: replyingTo?.id || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        void upsertMessage(data.message as Message);
      }

      setReplyingTo(null);
    } catch (error) {
      console.error('Failed to send sticker:', error);
    }
  };

  const handleGifSelect = async (gifId: string, gifUrl: string, format: string) => {
    try {
      const res = await fetch(`/api/messages/${room.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: null,
          fileUrl: gifUrl,
          mimeType: format === 'mp4' ? 'video/mp4' : 'image/gif',
          messageType: 'gif',
          replyToId: replyingTo?.id || null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        void upsertMessage(data.message as Message);
      }

      setReplyingTo(null);
    } catch (error) {
      console.error('Failed to send gif:', error);
    }
  };

  // Upload room profile photo (superAdmin only)
  const handleRoomPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      alert('Image must be less than 5MB');
      return;
    }

    setUploadingRoomPhoto(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/rooms/${room.id}/profile-photo`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        await res.json();
        // Refresh page to show new photo
        window.location.reload();
      } else {
        alert('Failed to upload photo');
      }
    } catch (error) {
      console.error('Failed to upload room photo:', error);
      alert('Failed to upload photo');
    }
    setUploadingRoomPhoto(false);
  };

  // Remove room profile photo
  const handleRemoveRoomPhoto = async () => {
    if (!confirm(t('room.removePhoto') + '?')) return;

    try {
      const res = await fetch(`/api/rooms/${room.id}/profile-photo`, {
        method: 'DELETE',
      });

      if (res.ok) {
        window.location.reload();
      } else {
        alert('Failed to remove photo');
      }
    } catch (error) {
      console.error('Failed to remove room photo:', error);
      alert('Failed to remove photo');
    }
  };

  // Get other user for private call
  const otherUser = room.type === 'PRIVATE'
    ? room.members.find((m) => m.user.id !== user.id)?.user
    : null;

  const isOtherOnline = otherUser ? onlineUsers.has(otherUser.id) : false;

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="chat-shell">
      {/* Chat Header */}
      <div
        className="chat-header"
        style={{
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onToggleSidebar}>
            <AppIcon name="menu" size={18} />
          </button>
          
          {/* Room avatar/icon - clickable for groups */}
          <div
            style={{
              cursor: room.type !== 'PRIVATE' ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
            onClick={() => room.type !== 'PRIVATE' && setShowMembersModal(true)}
          >
            {room.profilePhotoUrl ? (
              <Image
                src={room.profilePhotoUrl}
                alt={room.name}
                width={40}
                height={40}
                unoptimized
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: '50%',
                  objectFit: 'cover',
                }}
              />
            ) : (
              <div
                className="avatar"
                style={{ background: getAvatarColor(roomDisplayName) }}
              >
                {room.type === 'CHANNEL' ? <AppIcon name="channel" size={20} /> : room.type === 'GROUP' ? <AppIcon name="group" size={20} /> : roomDisplayName.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>{roomDisplayName}</div>
              <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
                {room.type === 'PRIVATE' ? (
                  isOtherOnline ? (
                    <span style={{ color: 'var(--online)' }}>● {t('chat.online')}</span>
                  ) : (
                    t('chat.offline')
                  )
                ) : (
                  `${room.members.length} ${t('chat.members')}`
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-ghost btn-icon btn-sm"
            onClick={handleEncryptionToggle}
            title={roomPassphrase ? 'Encryption enabled' : 'Enable encryption'}
            style={{ color: roomPassphrase ? 'var(--accent)' : undefined }}
          >
            <AppIcon name="lock" size={16} />
          </button>
          {/* Room photo upload (superAdmin only, for groups/channels) */}
          {user.isSuperAdmin && room.type !== 'PRIVATE' && (
            <div>
              <input
                ref={roomPhotoInputRef}
                type="file"
                accept="image/*"
                hidden
                onChange={handleRoomPhotoUpload}
              />
              <button
                className="btn btn-ghost btn-icon btn-sm"
                onClick={() => roomPhotoInputRef.current?.click()}
                disabled={uploadingRoomPhoto}
                title={t('room.uploadPhoto')}
              >
                {uploadingRoomPhoto ? <div className="spinner" style={{ width: 16, height: 16 }} /> : <AppIcon name="camera" size={16} />}
              </button>
              {room.profilePhotoUrl && (
                <button
                  className="btn btn-ghost btn-icon btn-sm"
                  onClick={handleRemoveRoomPhoto}
                  title={t('room.removePhoto')}
                  style={{ color: 'var(--error)' }}
                >
                  <AppIcon name="trash" size={16} />
                </button>
              )}
            </div>
          )}
          
          {/* Voice call button — only for private chats */}
          {room.type === 'PRIVATE' && otherUser && (
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => onStartCall(otherUser.id, otherUser.displayName || otherUser.username)}
              title={t('call.voice')}
            >
              <AppIcon name="phone" size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div className="chat-messages" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {loading ? (
          <div style={{ display: 'grid', gap: 10, padding: 8 }}>
            {Array.from({ length: 10 }).map((_, index) => (
              <div
                key={`msg-skeleton-${index}`}
                style={{
                  alignSelf: index % 3 === 0 ? 'flex-end' : 'flex-start',
                  width: `${36 + ((index * 9) % 28)}%`,
                  minWidth: 120,
                  height: 36,
                  borderRadius: 14,
                  background: index % 3 === 0 ? 'rgba(255, 104, 58, 0.26)' : 'rgba(255, 146, 108, 0.16)',
                }}
              />
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 40, fontSize: 14 }}>
            {t('chat.noMessages')}
          </div>
        ) : (
          messages.map((msg, idx) => {
              const isOwn = msg.userId === user.id;
              const prevMsg = messages[idx - 1];
              const nextMsg = messages[idx + 1];
              const showAvatar = !nextMsg || nextMsg.userId !== msg.userId;
              const isFirstInGroup = !prevMsg || prevMsg.userId !== msg.userId;
              const isEntering = animatingMessageIds.has(msg.id);
              const isPending = Boolean(msg.pending);
              const messageText = msg.decryptedText ?? null;
              const hasDisplayText = Boolean(messageText);
              const encryptedState = msg.encryptedTextState || 'plain';
              const showEncryptedPlaceholder = Boolean(msg.text) && encryptedState !== 'plain' && !hasDisplayText;
              const encryptedPlaceholderText = encryptedState === 'failed'
                ? 'Encrypted message (failed to decrypt)'
                : 'Encrypted message';
              const replyText = msg.replyTo?.decryptedText ?? msg.replyTo?.text ?? null;
              const replyHasPlaceholder = Boolean(msg.replyTo?.text) && (msg.replyTo?.encryptedTextState || 'plain') !== 'plain' && !replyText;
              const replyPreviewText = replyText || (replyHasPlaceholder ? 'Encrypted message' : null);
              const readByUsers = splitReadBy(msg.readBy);
              const isReadByPeer = otherUser ? readByUsers.includes(otherUser.id) : readByUsers.length > 0;
              const ownStatusText = isPending ? '...' : isReadByPeer ? '✓✓' : '✓';
              const ownStatusColor = isPending ? 'rgba(255,255,255,0.5)' : isReadByPeer ? '#9be2b3' : 'rgba(255,255,255,0.72)';

              return (
                <div
                  key={msg.id}
                  className={isEntering ? 'chat-message-enter' : undefined}
                  style={{
                    display: 'flex',
                    flexDirection: isOwn ? (dir === 'rtl' ? 'row' : 'row-reverse') : (dir === 'rtl' ? 'row-reverse' : 'row'),
                  alignItems: 'flex-end',
                  gap: 8,
                  marginTop: isFirstInGroup ? 12 : 2,
                }}
              >
                {/* Avatar (side) - clickable */}
                <div
                  style={{ width: 32, flexShrink: 0, cursor: showAvatar && !isOwn ? 'pointer' : 'default' }}
                  onClick={() => showAvatar && !isOwn && setViewingUser(msg.user.id)}
                  title={showAvatar && !isOwn ? 'View Profile' : ''}
                >
                  {showAvatar && !isOwn && (
                    <div
                      className="avatar avatar-xs"
                      style={{
                        background: msg.user.avatarUrl ? 'transparent' : getAvatarColor(msg.user.username),
                      }}
                    >
                      {msg.user.avatarUrl ? (
                        <Image
                          src={msg.user.avatarUrl}
                          alt="Avatar"
                          width={32}
                          height={32}
                          unoptimized
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
                        />
                      ) : (
                        (msg.user.displayName || msg.user.username).charAt(0).toUpperCase()
                      )}
                    </div>
                  )}
                </div>

                {/* Bubble */}
                <div
                  ref={(el) => {
                    if (el) messageRefs.current.set(msg.id, el);
                  }}
                  style={{
                    maxWidth: '70%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                  }}
                >
                  <div
                    className={isPending ? 'chat-message-pending' : undefined}
                    style={{
                      padding: '10px 14px',
                      borderRadius: isOwn
                        ? dir === 'rtl' ? '16px 4px 16px 16px' : '4px 16px 16px 16px'
                        : dir === 'rtl' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                      background: isOwn
                        ? 'var(--bubble-own)'
                        : 'var(--bubble-other)',
                      color: isOwn ? 'var(--bubble-own-text)' : 'var(--bubble-other-text)',
                      boxShadow: '0 8px 18px rgba(0,0,0,0.14)',
                      wordBreak: 'break-word',
                      opacity: isPending ? 0.75 : 1,
                      filter: isPending ? 'saturate(0.8)' : 'none',
                    }}
                  >
                    {/* Sender name (only in groups, for others' messages) */}
                    {!isOwn && room.type !== 'PRIVATE' && (
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: isOwn ? 'rgba(255,255,255,0.9)' : 'var(--accent)',
                          marginBottom: 4,
                          cursor: 'pointer',
                        }}
                        onClick={() => setViewingUser(msg.user.id)}
                      >
                        {msg.user.displayName || msg.user.username}
                      </div>
                    )}

                    {/* Reply preview */}
                    {msg.replyTo && (
                      <div
                        onClick={() => {
                          const targetEl = messageRefs.current.get(msg.replyTo!.id);
                          if (targetEl) {
                            targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            // Flash effect
                            targetEl.style.opacity = '0.5';
                            setTimeout(() => { targetEl.style.opacity = '1'; }, 200);
                          }
                        }}
                        style={{
                          padding: '6px 10px',
                          marginBottom: 6,
                          borderLeft: `3px solid ${isOwn ? 'rgba(255,255,255,0.4)' : 'var(--accent)'}`,
                          background: isOwn ? 'rgba(0,0,0,0.2)' : 'rgba(0,0,0,0.1)',
                          borderRadius: 4,
                          fontSize: 12,
                          cursor: 'pointer',
                          opacity: 0.8,
                        }}
                      >
                        <div style={{ fontWeight: 600, marginBottom: 2 }}>
                          {t('chat.replyTo')} {msg.replyTo.user.displayName || msg.replyTo.user.username}
                        </div>
                        <div style={{ opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {replyPreviewText || (msg.replyTo.fileUrl ? t('chat.attachFile') : '...')}
                        </div>
                      </div>
                    )}

                    {/* Render file if present */}
                    {msg.fileUrl && (() => {
                      const fileUrl = msg.fileUrl;
                      const mimeType = msg.mimeType || '';
                      const msgType = msg.messageType || 'file';
                      
                      // Sticker rendering
                      if (msgType === 'sticker') {
                        return (
                          <div style={{ marginBottom: hasDisplayText || showEncryptedPlaceholder ? 8 : 0 }}>
                            <Image
                              src={fileUrl}
                              alt="Sticker"
                              width={150}
                              height={150}
                              unoptimized
                              style={{
                                width: 150,
                                height: 150,
                                objectFit: 'contain',
                                borderRadius: 8,
                                display: 'block',
                              }}
                            />
                          </div>
                        );
                      }
                      
                      // GIF rendering
                      if (msgType === 'gif') {
                        return (
                          <div style={{ marginBottom: hasDisplayText || showEncryptedPlaceholder ? 8 : 0 }}>
                            {mimeType === 'video/mp4' ? (
                              <video
                                src={fileUrl}
                                autoPlay
                                loop
                                muted
                                playsInline
                                style={{
                                  width: 200,
                                  height: 200,
                                  objectFit: 'contain',
                                  borderRadius: 8,
                                  display: 'block',
                                }}
                              />
                            ) : (
                              <Image
                                src={fileUrl}
                                alt="GIF"
                                width={200}
                                height={200}
                                unoptimized
                                style={{
                                  width: 200,
                                  height: 200,
                                  objectFit: 'contain',
                                  borderRadius: 8,
                                  display: 'block',
                                }}
                              />
                            )}
                          </div>
                        );
                      }
                      
                      // Regular file detection (images, audio, video, etc.)
                      const detectedMime = mimeType || '';
                      const isImage = detectedMime.startsWith('image/') && !detectedMime.includes('gif');
                      const isVideo = detectedMime.startsWith('video/') && !detectedMime.includes('gif');
                      const isAudio = detectedMime.startsWith('audio/');
                      const fileName = msg.fileName || fileUrl.split('/').pop() || 'file';
                      
                      if (isImage) {
                        return (
                          <div style={{ marginBottom: hasDisplayText || showEncryptedPlaceholder ? 8 : 0 }}>
                            <Image
                              src={fileUrl}
                              alt={fileName}
                              width={640}
                              height={480}
                              unoptimized
                              onClick={() => setPreviewImage(fileUrl)}
                              style={{
                                maxWidth: '100%',
                                width: 'auto',
                                height: 'auto',
                                maxHeight: '250px',
                                objectFit: 'contain',
                                borderRadius: 8,
                                cursor: 'pointer',
                                transition: 'transform 0.2s, opacity 0.2s',
                                display: 'block',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.transform = 'scale(1.02)';
                                e.currentTarget.style.opacity = '0.9';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.transform = 'scale(1)';
                                e.currentTarget.style.opacity = '1';
                              }}
                            />
                            <div style={{ fontSize: 11, color: isOwn ? 'rgba(255,255,255,0.7)' : 'var(--fg-muted)', marginTop: 4 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <AppIcon name="image" size={16} />
                                <span>Image • Click to view</span>
                              </span>
                            </div>
                          </div>
                        );
                      }
                      
                      if (isAudio) {
                        return (
                          <div style={{ marginBottom: hasDisplayText || showEncryptedPlaceholder ? 8 : 0, minWidth: 280, maxWidth: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <AppIcon name="music" size={20} />
                              <span style={{ 
                                fontSize: 14, 
                                fontWeight: 500, 
                                overflow: 'hidden', 
                                textOverflow: 'ellipsis', 
                                whiteSpace: 'nowrap',
                                flex: 1,
                              }}>
                                {fileName}
                              </span>
                            </div>
                            <audio
                              controls
                              style={{
                                width: '100%',
                                height: 40,
                                borderRadius: 6,
                                outline: 'none',
                              }}
                            >
                              <source src={fileUrl} />
                              Your browser does not support audio playback.
                            </audio>
                            <a
                              href={fileUrl}
                              download={fileName}
                              style={{
                                fontSize: 11,
                                color: isOwn ? 'rgba(255,255,255,0.8)' : 'var(--accent)',
                                textDecoration: 'none',
                                marginTop: 4,
                                display: 'inline-block',
                              }}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <AppIcon name="download" size={15} />
                                <span>Download</span>
                              </span>
                            </a>
                          </div>
                        );
                      }
                      
                      if (isVideo) {
                        return (
                          <div style={{ marginBottom: hasDisplayText || showEncryptedPlaceholder ? 8 : 0 }}>
                            <video
                              controls
                              style={{
                                maxWidth: '100%',
                                width: 'auto',
                                height: 'auto',
                                maxHeight: '250px',
                                borderRadius: 8,
                                display: 'block',
                                backgroundColor: '#000',
                              }}
                            >
                              <source src={fileUrl} />
                              Your browser does not support video playback.
                            </video>
                            <div style={{ fontSize: 11, color: isOwn ? 'rgba(255,255,255,0.7)' : 'var(--fg-muted)', marginTop: 4 }}>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                <AppIcon name="video" size={16} />
                                <span>Video</span>
                              </span>
                            </div>
                          </div>
                        );
                      }
                      
                      // Document/File link
                      return (
                        <a
                          href={fileUrl}
                          target="_blank"
                          rel="noopener"
                          download={fileName}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '10px 12px',
                            background: isOwn ? 'rgba(0,0,0,0.2)' : 'var(--bg-tertiary)',
                            borderRadius: 8,
                            textDecoration: 'none',
                            color: isOwn ? '#fff' : 'var(--fg)',
                            marginBottom: hasDisplayText || showEncryptedPlaceholder ? 8 : 0,
                            transition: 'background 0.15s',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = isOwn ? 'rgba(0,0,0,0.3)' : 'var(--bg-hover)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = isOwn ? 'rgba(0,0,0,0.2)' : 'var(--bg-tertiary)';
                          }}
                        >
                          <div style={{
                            width: 40,
                            height: 40,
                            borderRadius: 8,
                            background: 'var(--accent-gradient)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 18,
                            flexShrink: 0,
                          }}>
                            <AppIcon name="paperclip" size={16} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {fileName}
                            </div>
                            <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>
                              Click to download
                            </div>
                          </div>
                        </a>
                      );
                    })()}

                    {/* Text */}
                    {hasDisplayText && !msg.fileUrl && (
                      <div style={{ fontSize: 14, wordBreak: 'break-word', lineHeight: 1.5 }}>
                        {messageText}
                      </div>
                    )}
                    {hasDisplayText && msg.fileUrl && (
                      <div style={{ fontSize: 13, opacity: 0.8, wordBreak: 'break-word' }}>
                        {messageText}
                      </div>
                    )}
                    {showEncryptedPlaceholder && (
                      <div style={{ fontSize: 13, opacity: 0.8, fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <AppIcon name="lock" size={14} />
                        <span>{encryptedPlaceholderText}</span>
                      </div>
                    )}

                    {/* Time */}
                    <div style={{
                      fontSize: 10,
                      opacity: 0.6,
                      marginTop: 4,
                      textAlign: isOwn ? 'start' : 'end',
                    }}>
                      {formatTime(msg.createdAt)}
                      {isOwn && (
                        <span style={{ marginInlineStart: 6, letterSpacing: 0.4, color: ownStatusColor }}>
                          {ownStatusText}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Reply button */}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setReplyingTo(msg)}
                    style={{
                      alignSelf: isOwn ? 'flex-end' : 'flex-start',
                      fontSize: 11,
                      padding: '2px 8px',
                      opacity: 0.6,
                    }}
                  >
                    ↩ {t('chat.reply')}
                  </button>
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {typingUser && (
          <div style={{ fontSize: 13, color: 'var(--fg-muted)', padding: '4px 40px' }}>
            {typingUser} {t('chat.typing')}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Message Input */}
      {(room.type !== 'CHANNEL' || user.isSuperAdmin) && (
        <>
          {/* Reply preview bar */}
          {replyingTo && (
            <div style={{
              padding: '8px 20px',
              background: 'var(--bg-tertiary)',
              borderTop: '1px solid var(--bg-tertiary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                  {t('chat.replyTo')} {replyingTo.user.displayName || replyingTo.user.username}
                </div>
                <div style={{ fontSize: 13, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {replyingTo.decryptedText || replyingTo.text || (replyingTo.fileUrl ? t('chat.attachFile') : '...')}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setReplyingTo(null)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <AppIcon name="close" size={14} />
                  <span>{t('chat.cancelReply')}</span>
                </span>
              </button>
            </div>
          )}

        <form
          onSubmit={sendMessage}
          className="chat-composer"
          style={{
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          {/* File upload */}
          <input
            ref={fileInputRef}
            type="file"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileUpload(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title={t('chat.attachFile')}
          >
            {uploading ? <div className="spinner" style={{ width: 18, height: 18 }} /> : <AppIcon name="paperclip" size={18} />}
          </button>

          {/* Emoji/Sticker/GIF Picker Button */}
          <div style={{ position: 'relative' }}>
            <button
              type="button"
              className="btn btn-ghost btn-icon"
              onClick={() => setShowPicker(!showPicker)}
              title="Emoji / Sticker / GIF"
            >
              <AppIcon name="emoji" size={18} />
            </button>
            
            {showPicker && (
              <EmojiStickerPicker
                onEmojiSelect={handleEmojiSelect}
                onStickerSelect={handleStickerSelect}
                onGifSelect={handleGifSelect}
                onClose={() => setShowPicker(false)}
                dir={dir}
                t={t}
              />
            )}
          </div>

          {/* Text input */}
          <input
            className="input"
            style={{
              flex: 1,
              height: 42,
              borderRadius: 9999,
              paddingInline: 16,
              opacity: sendInputBurst ? 0.55 : 1,
              transform: sendInputBurst ? 'translateY(1px) scale(0.995)' : 'translateY(0) scale(1)',
              transition: 'opacity 0.2s ease, transform 0.2s ease',
            }}
            placeholder={roomPassphrase ? `${t('chat.typeMessage')} (E2EE)` : t('chat.typeMessage')}
            value={text}
            onChange={(e) => { setText(e.target.value); handleTyping(); }}
            autoComplete="off"
          />

          {/* Send */}
          <button
            type="submit"
            className="btn btn-primary btn-icon"
            disabled={!text.trim() && !uploading}
            style={{
              transform: dir === 'rtl' ? 'scaleX(-1)' : 'none',
              transition: 'transform 0.2s ease',
              width: 42,
              height: 42,
            }}
          >
            <AppIcon name="send" size={18} />
          </button>
        </form>
        </>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
      )}

      {/* User Profile Modal */}
      {viewingUser && (
        <UserProfileModal
          userId={viewingUser}
          onClose={() => setViewingUser(null)}
        />
      )}

      {/* Group Members Modal */}
      {showMembersModal && (
        <GroupMembersModal
          roomId={room.id}
          roomName={room.name}
          isOpen={showMembersModal}
          onClose={() => setShowMembersModal(false)}
          onMemberClick={(userId) => {
            setShowMembersModal(false);
            setViewingUser(userId);
          }}
          t={t}
          dir={dir}
        />
      )}
    </div>
  );
}
