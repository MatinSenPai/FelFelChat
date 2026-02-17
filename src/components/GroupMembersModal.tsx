'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

interface Member {
  id: string;
  userId: string;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    bio: string | null;
  };
}

interface GroupMembersModalProps {
  roomId: string;
  roomName: string;
  isOpen: boolean;
  onClose: () => void;
  onMemberClick?: (userId: string) => void;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
}

export default function GroupMembersModal({
  roomId,
  roomName,
  isOpen,
  onClose,
  onMemberClick,
  t,
  dir,
}: GroupMembersModalProps) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !roomId) return;

    const fetchMembers = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/rooms/${roomId}/members`);
        const data = await res.json();
        if (data.members) {
          setMembers(data.members);
        }
      } catch (error) {
        console.error('Failed to fetch members:', error);
      }
      setLoading(false);
    };

    fetchMembers();
  }, [isOpen, roomId]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: 20,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 16,
          width: '100%',
          maxWidth: 500,
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
          direction: dir,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
              {roomName}
            </h2>
            <p style={{ fontSize: 14, color: 'var(--fg-muted)' }}>
              {t('room.memberCount').replace('{count}', String(members.length))}
            </p>
          </div>
          <button
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            style={{ fontSize: 20 }}
          >
            ✕
          </button>
        </div>

        {/* Members List */}
        <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div className="spinner" style={{ width: 32, height: 32 }} />
            </div>
          ) : members.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--fg-muted)', padding: 40 }}>
              {t('room.members')}: 0
            </p>
          ) : (
            members.map((member) => (
              <div
                key={member.id}
                style={{
                  padding: '12px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: onMemberClick ? 'pointer' : 'default',
                  transition: 'background 0.15s',
                }}
                onClick={() => onMemberClick?.(member.userId)}
                onMouseOver={(e) => onMemberClick && (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {/* Avatar */}
                {member.user.avatarUrl ? (
                  <Image
                    src={member.user.avatarUrl}
                    alt={member.user.displayName || member.user.username}
                    width={48}
                    height={48}
                    unoptimized
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      objectFit: 'cover',
                      flex: 'none',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 20,
                      fontWeight: 600,
                      flex: 'none',
                    }}
                  >
                    {(member.user.displayName || member.user.username).charAt(0).toUpperCase()}
                  </div>
                )}

                {/* User Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 2 }}>
                    {member.user.displayName || member.user.username}
                  </div>
                  {member.user.bio && (
                    <div
                      style={{
                        fontSize: 14,
                        color: 'var(--fg-muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {member.user.bio}
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: 'var(--fg-muted)', marginTop: 2 }}>
                    @{member.user.username}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
