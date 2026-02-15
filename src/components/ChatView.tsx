'use client';

import { useState, useEffect, useRef, FormEvent } from 'react';
import { getSocket } from '@/lib/socket';
import ImagePreviewModal from './ImagePreviewModal';
import UserProfileModal from './UserProfileModal';
import { compressImage } from '@/lib/imageCompression';

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
  members: { user: { id: string; username: string; displayName: string | null; lastSeen: string } }[];
}

interface Message {
  id: string;
  text: string | null;
  fileUrl: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  userId: string;
  createdAt: string;
  user: { id: string; username: string; displayName: string | null; avatarUrl?: string | null };
  replyTo?: {
    id: string;
    text: string | null;
    fileUrl: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    user: { id: string; username: string; displayName: string | null; avatarUrl?: string | null };
  } | null;
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
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [profileUserId, setProfileUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Fetch messages
  useEffect(() => {
    setLoading(true);
    setMessages([]);

    fetch(`/api/messages/${room.id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.messages) setMessages(data.messages);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [room.id]);

  // Socket: listen for new messages in this room
  useEffect(() => {
    const socket = getSocket();

    const handleNewMessage = () => {
      // Refetch to get proper user data
      fetch(`/api/messages/${room.id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.messages) setMessages(data.messages);
        });
    };

    const handleTyping = (username: string) => {
      if (username !== user.username) {
        setTypingUser(username);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 2000);
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:typing', handleTyping);

    // Join room
    socket.emit('room:join', room.id);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:typing', handleTyping);
      socket.emit('room:leave', room.id);
    };
  }, [room.id, user.username]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Send message
  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;

    try {
      await fetch(`/api/messages/${room.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          text: text.trim(),
          replyToId: replyingTo?.id || null,
        }),
      });

      // Emit via socket for realtime
      const socket = getSocket();
      socket.emit('message:send', { roomId: room.id, text: text.trim() });

      setText('');
      setReplyingTo(null);
    } catch (err) {
      console.error('Failed to send message:', err);
    }
  };

  // Handle typing indicator
  const handleTyping = () => {
    const socket = getSocket();
    socket.emit('message:typing', room.id);
  };

  // Upload file
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
          fileName: file.name, // Original filename
          fileSize: uploadData.fileSize,
          mimeType, // Send MIME type to server
        };
        
        console.log('💬 Sending message:', messageData);
        
        await fetch(`/api/messages/${room.id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(messageData),
        });

        const socket = getSocket();
        socket.emit('message:send', { roomId: room.id, text: `📎 ${uploadData.fileName}` });
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
    setUploading(false);
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
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Chat Header */}
      <div style={{
        height: 'var(--header-height)',
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--bg-tertiary)',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onToggleSidebar}>
            ☰
          </button>
          <div
            className="avatar"
            style={{ background: getAvatarColor(roomDisplayName) }}
          >
            {room.type === 'CHANNEL' ? '📢' : room.type === 'GROUP' ? '👥' : roomDisplayName.charAt(0).toUpperCase()}
          </div>
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

        <div style={{ display: 'flex', gap: 4 }}>
          {/* Voice call button — only for private chats */}
          {room.type === 'PRIVATE' && otherUser && (
            <button
              className="btn btn-ghost btn-icon"
              onClick={() => onStartCall(otherUser.id, otherUser.displayName || otherUser.username)}
              title={t('call.voice')}
            >
              📞
            </button>
          )}
        </div>
      </div>

      {/* Messages Area */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" />
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

              return (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    flexDirection: isOwn ? (dir === 'rtl' ? 'row' : 'row-reverse') : (dir === 'rtl' ? 'row-reverse' : 'row'),
                  alignItems: 'flex-end',
                  gap: 8,
                  marginTop: isFirstInGroup ? 12 : 2,
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                {/* Avatar (side) - clickable */}
                <div
                  style={{ width: 32, flexShrink: 0, cursor: showAvatar && !isOwn ? 'pointer' : 'default' }}
                  onClick={() => showAvatar && !isOwn && setProfileUserId(msg.user.id)}
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
                        <img
                          src={msg.user.avatarUrl}
                          alt="Avatar"
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
                    style={{
                      padding: '10px 14px',
                      borderRadius: isOwn
                        ? dir === 'rtl' ? '16px 4px 16px 16px' : '4px 16px 16px 16px'
                        : dir === 'rtl' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                      background: isOwn
                        ? 'linear-gradient(135deg, #e84545, #c03030)'
                        : 'var(--bg-secondary)',
                      color: isOwn ? '#fff' : 'var(--fg)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                      wordBreak: 'break-word',
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
                        onClick={() => setProfileUserId(msg.user.id)}
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
                          {msg.replyTo.text || (msg.replyTo.fileUrl ? '📎 ' + t('chat.attachFile') : '...')}
                        </div>
                      </div>
                    )}

                    {/* Smart Media Preview */}
                    {msg.fileUrl && (() => {
                      const fileUrl = msg.fileUrl;
                      const fileName = msg.fileName || fileUrl.split('/').pop() || 'file'; // Use original name or fallback
                      const mimeType = msg.mimeType || '';
                      
                      // Determine file type from MIME type (preferred) or extension (fallback)
                      const isImage = mimeType.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(fileUrl);
                      const isGif = mimeType === 'image/gif' || /\.gif$/i.test(fileUrl);
                      const isAudio = mimeType.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(fileUrl);
                      const isVideo = mimeType.startsWith('video/') || /\.(mp4|webm|mov|avi|mkv)$/i.test(fileUrl);
                      
                      if (isImage) {
                        return (
                          <div style={{ marginBottom: msg.text ? 8 : 0 }}>
                            <img
                              src={fileUrl}
                              alt={fileName}
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
                              {isGif ? '🎬 GIF' : '🖼️ Image'} • Click to view
                            </div>
                          </div>
                        );
                      }
                      
                      if (isAudio) {
                        return (
                          <div style={{ marginBottom: msg.text ? 8 : 0, minWidth: 280, maxWidth: '100%' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                              <span style={{ fontSize: 20 }}>🎵</span>
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
                              📥 Download
                            </a>
                          </div>
                        );
                      }
                      
                      if (isVideo) {
                        return (
                          <div style={{ marginBottom: msg.text ? 8 : 0 }}>
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
                              🎥 Video
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
                            marginBottom: msg.text ? 8 : 0,
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
                            📎
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
                    {msg.text && !msg.fileUrl && (
                      <div style={{ fontSize: 14, wordBreak: 'break-word', lineHeight: 1.5 }}>
                        {msg.text}
                      </div>
                    )}
                    {msg.text && msg.fileUrl && (
                      <div style={{ fontSize: 13, opacity: 0.8, wordBreak: 'break-word' }}>
                        {msg.text}
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
                  {replyingTo.text || (replyingTo.fileUrl ? '📎 ' + t('chat.attachFile') : '...')}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setReplyingTo(null)}
              >
                ✕ {t('chat.cancelReply')}
              </button>
            </div>
          )}

        <form
          onSubmit={sendMessage}
          style={{
            padding: '12px 20px',
            borderTop: '1px solid var(--bg-tertiary)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            background: 'var(--bg-secondary)',
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
            {uploading ? <div className="spinner" style={{ width: 18, height: 18 }} /> : '📎'}
          </button>

          {/* Text input */}
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder={t('chat.typeMessage')}
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
            }}
          >
            ➤
          </button>
        </form>
        </>
      )}

      {/* Image Preview Modal */}
      {previewImage && (
        <ImagePreviewModal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
      )}

      {/* User Profile Modal */}
      {profileUserId && (
        <UserProfileModal
          userId={profileUserId}
          onClose={() => setProfileUserId(null)}
        />
      )}
    </div>
  );
}
