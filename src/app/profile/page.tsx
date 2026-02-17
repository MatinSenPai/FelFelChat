'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import { compressAvatar } from '@/lib/imageCompression';
import Image from 'next/image';

export default function ProfilePage() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { t, dir } = useI18n();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setAvatarUrl(user.avatarUrl || '');
    }
  }, [user]);

  const handleAvatarUpload = async (file: File) => {
    setUploading(true);
    try {
      // Compress avatar before upload
      const compressed = await compressAvatar(file);

      const formData = new FormData();
      formData.append('file', compressed);

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();

      if (data.fileUrl) {
        setAvatarUrl(data.fileUrl);
      } else {
        alert('Upload failed');
      }
    } catch (err) {
      console.error('Avatar upload error:', err);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, bio, avatarUrl }),
      });

      if (res.ok) {
        await refreshUser();
        router.push('/');
      } else {
        const data = await res.json();
        alert(data.error || 'Save failed');
      }
    } catch (err) {
      console.error('Save error:', err);
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  };

  if (!user) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: dir }}>
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid var(--bg-tertiary)',
          background: 'var(--bg-secondary)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <button className="btn btn-ghost btn-sm" onClick={() => router.push('/')}>
          ← {t('common.back')}
        </button>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Profile Settings</h1>
      </div>

      <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Avatar */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div
              className="avatar"
              style={{
                width: 120,
                height: 120,
                fontSize: 48,
                background: avatarUrl ? 'transparent' : 'var(--accent-gradient)',
              }}
            >
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="Avatar"
                  width={120}
                  height={120}
                  unoptimized
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                (displayName || user.username).charAt(0).toUpperCase()
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarUpload(file);
                e.target.value = '';
              }}
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : '📷 Change Avatar'}
            </button>
          </div>

          {/* Username (read-only) */}
          <div>
            <label style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'block', marginBottom: 4 }}>
              Username
            </label>
            <input className="input" value={user.username} disabled />
          </div>

          {/* Display Name */}
          <div>
            <label style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'block', marginBottom: 4 }}>
              Display Name
            </label>
            <input
              className="input"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your display name"
            />
          </div>

          {/* Bio */}
          <div>
            <label style={{ fontSize: 13, color: 'var(--fg-secondary)', display: 'block', marginBottom: 4 }}>
              Bio ({bio.length}/200)
            </label>
            <textarea
              className="input"
              value={bio}
              onChange={(e) => {
                if (e.target.value.length <= 200) setBio(e.target.value);
              }}
              placeholder="Tell us about yourself..."
              rows={3}
              style={{ resize: 'vertical', fontFamily: 'inherit' }}
            />
          </div>

          {/* Save Button */}
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : '💾 Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
