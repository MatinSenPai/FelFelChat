'use client';

import { useEffect, useState } from 'react';

interface User {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  lastSeen: string;
  createdAt: string;
}

interface UserProfileModalProps {
  userId: string;
  onClose: () => void;
  onStartChat?: (userId: string, username: string) => void;
}

export default function UserProfileModal({ userId, onClose, onStartChat }: UserProfileModalProps) {
  const [profile, setProfile] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) setProfile(data.profile);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [userId]);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const getInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-secondary)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 400,
          width: '90%',
        }}
      >
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <div className="spinner" />
          </div>
        ) : profile ? (
          <>
            {/* Avatar */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              <div
                className="avatar"
                style={{
                  width: 100,
                  height: 100,
                  fontSize: 40,
                  background: profile.avatarUrl ? 'transparent' : 'var(--accent-gradient)',
                }}
              >
                {profile.avatarUrl ? (
                  <img
                    src={profile.avatarUrl}
                    alt="Avatar"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  getInitials(profile.displayName || profile.username)
                )}
              </div>

              {/* Name */}
              <div style={{ textAlign: 'center' }}>
                <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
                  {profile.displayName || profile.username}
                </h2>
                {profile.displayName && (
                  <p style={{ fontSize: 14, color: 'var(--fg-muted)' }}>@{profile.username}</p>
                )}
              </div>
            </div>

            {/* Bio */}
            {profile.bio && (
              <div style={{ marginBottom: 20, padding: 12, background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                <p style={{ fontSize: 14, lineHeight: 1.5 }}>{profile.bio}</p>
              </div>
            )}

            {/* Info */}
            <div style={{ marginBottom: 20, fontSize: 13, color: 'var(--fg-secondary)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span>Last seen:</span>
                <span>{formatDate(profile.lastSeen)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Member since:</span>
                <span>{formatDate(profile.createdAt)}</span>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              {onStartChat && (
                <button
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => {
                    onStartChat(profile.id, profile.displayName || profile.username);
                    onClose();
                  }}
                >
                  💬 Start Chat
                </button>
              )}
              <button className="btn btn-ghost" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--fg-muted)' }}>User not found</div>
        )}
      </div>
    </div>
  );
}
