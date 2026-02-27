'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useI18n } from '@/components/providers/I18nProvider';
import Link from 'next/link';
import Image from 'next/image';
import AppIcon, { AppIconName } from '@/components/AppIcon';

interface Stats {
  totalUsers: number;
  totalMessages: number;
  totalRooms: number;
  onlineUsers: number;
  dbSize: string;
  uploadsSize: string;
  freeSpace: string;
  activeCall: { callerName: string; calleeId: string; startedAt: string } | null;
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { t, locale, setLocale, dir } = useI18n();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [registrationEnabled, setRegistrationEnabled] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [stickers, setStickers] = useState<{ id: string; fileUrl: string; fileName: string }[]>([]);
  const [gifs, setGifs] = useState<{ id: string; fileUrl: string; fileName: string; format: string }[]>([]);
  const [stickersLoading, setStickersLoading] = useState(false);
  const [gifsLoading, setGifsLoading] = useState(false);
  const [uploadingSticker, setUploadingSticker] = useState(false);
  const [uploadingGif, setUploadingGif] = useState(false);

  // Superadmin profile change state
  const [profileForm, setProfileForm] = useState({ currentPassword: '', newPassword: '', newUsername: '', newDisplayName: user?.displayName ?? '' });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleProfileSave = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileMsg(null);
    try {
      const res = await fetch('/api/admin/superadmin', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: profileForm.currentPassword,
          ...(profileForm.newPassword ? { newPassword: profileForm.newPassword } : {}),
          ...(profileForm.newUsername ? { newUsername: profileForm.newUsername } : {}),
          newDisplayName: profileForm.newDisplayName,
        }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) {
        setProfileMsg({ type: 'err', text: String((data as { error?: string }).error ?? 'error') });
      } else {
        setProfileMsg({ type: 'ok', text: 'Saved successfully' });
        setProfileForm(prev => ({ ...prev, currentPassword: '', newPassword: '', newUsername: '' }));
      }
    } catch {
      setProfileMsg({ type: 'err', text: 'Network error' });
    }
    setProfileLoading(false);
  };

  const fetchStickers = async () => {
    setStickersLoading(true);
    try {
      const res = await fetch('/api/admin/stickers');
      const data = await res.json();
      if (data.stickers) {
        setStickers(data.stickers);
      }
    } catch (error) {
      console.error('Failed to fetch stickers:', error);
    }
    setStickersLoading(false);
  };
  
  const fetchGifs = async () => {
    setGifsLoading(true);
    try {
      const res = await fetch('/api/admin/gifs');
      const data = await res.json();
      if (data.gifs) {
        setGifs(data.gifs);
      }
    } catch (error) {
      console.error('Failed to fetch gifs:', error);
    }
    setGifsLoading(false);
  };

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false));
      
    // Fetch settings
    fetch('/api/admin/settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.settings) {
          setRegistrationEnabled(data.settings.registrationEnabled);
        }
      })
      .catch(console.error);
    
    // Fetch stickers and GIFs
    const stickersTimer = setTimeout(() => {
      void fetchStickers();
    }, 0);
    const gifsTimer = setTimeout(() => {
      void fetchGifs();
    }, 0);

    return () => {
      clearTimeout(stickersTimer);
      clearTimeout(gifsTimer);
    };
  }, []);
  
  const handleStickerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/png')) {
      alert('Please upload PNG files only');
      return;
    }
    
    if (file.size > 500 * 1024) {
      alert('Sticker must be less than 500KB');
      return;
    }
    
    setUploadingSticker(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user!.id);
      
      const res = await fetch('/api/admin/stickers', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        await fetchStickers();
        e.target.value = '';
      }
    } catch (error) {
      console.error('Failed to upload sticker:', error);
    }
    setUploadingSticker(false);
  };
  
  const handleGifUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!['video/mp4', 'image/gif'].includes(file.type)) {
      alert('Please upload MP4 or GIF files only');
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      alert('GIF must be less than 2MB');
      return;
    }
    
    setUploadingGif(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('userId', user!.id);
      
      const res = await fetch('/api/admin/gifs', {
        method: 'POST',
        body: formData,
      });
      
      if (res.ok) {
        await fetchGifs();
        e.target.value = '';
      }
    } catch (error) {
      console.error('Failed to upload gif:', error);
    }
    setUploadingGif(false);
  };
  
  const handleDeleteSticker = async (id: string) => {
    if (!confirm(t('admin.deleteSticker') + '?')) return;
    
    try {
      const res = await fetch('/api/admin/stickers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      
      if (res.ok) {
        await fetchStickers();
      }
    } catch (error) {
      console.error('Failed to delete sticker:', error);
    }
  };
  
  const handleDeleteGif = async (id: string) => {
    if (!confirm(t('admin.deleteGif') + '?')) return;
    
    try {
      const res = await fetch('/api/admin/gifs', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      
      if (res.ok) {
        await fetchGifs();
      }
    } catch (error) {
      console.error('Failed to delete gif:', error);
    };
  };

  const handleToggleRegistration = async () => {
    setSettingsLoading(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ registrationEnabled: !registrationEnabled }),
      });
      
      if (res.ok) {
        setRegistrationEnabled(!registrationEnabled);
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
    }
    setSettingsLoading(false);
  };

  if (!user?.isSuperAdmin) return <div style={{ padding: 40, textAlign: 'center' }}>Forbidden</div>;

  const navItems: { href: string; icon: AppIconName; label: string }[] = [
    { href: '/admin', icon: 'dashboard', label: t('admin.dashboard') },
    { href: '/admin/users', icon: 'user', label: t('admin.users') },
    { href: '/admin/rooms', icon: 'chat', label: t('admin.rooms') },
    { href: '/admin/messages', icon: 'messages', label: t('admin.messages') },
    { href: '/admin/calls', icon: 'phone', label: t('admin.calls') },
    { href: '/admin/storage', icon: 'storage', label: t('admin.storage') },
    { href: '/admin/backup', icon: 'backup', label: t('admin.backup') },
  ];

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: dir }}>
      {/* Header */}
      <div style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--bg-tertiary)',
        background: 'var(--bg-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link href="/" className="btn btn-ghost btn-sm">
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <AppIcon name="arrowLeft" size={14} />
              <span>{t('common.back')}</span>
            </span>
          </Link>
          <AppIcon name="logo" size={20} />
          <h1 style={{ fontSize: 18, fontWeight: 700 }}>{t('admin.panel')}</h1>
        </div>
        <div className="lang-toggle">
          <button className={locale === 'fa' ? 'active' : ''} onClick={() => setLocale('fa')}>FA</button>
          <button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')}>EN</button>
        </div>
      </div>

      <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)' }}>
        {/* Sidebar Nav */}
        <nav style={{
          width: 220,
          background: 'var(--bg-secondary)',
          borderInlineEnd: '1px solid var(--bg-tertiary)',
          padding: '16px 0',
        }}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                color: 'var(--fg)',
                textDecoration: 'none',
                fontSize: 14,
                transition: 'background 0.15s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <AppIcon name={item.icon} size={16} />
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Main Content */}
        <div style={{ 
          flex: 1, 
          padding: 24,
          overflow: 'auto',
          maxHeight: 'calc(100vh - 60px)',
        }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 24 }}>{t('admin.dashboard')}</h2>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <div className="spinner" style={{ width: 40, height: 40 }} />
            </div>
          ) : stats ? (
            <>
              {/* Stats Grid */}
              <div className="stats-grid" style={{ marginBottom: 24 }}>
                <div className="stat-card">
                  <div className="stat-value">{stats.onlineUsers}</div>
                  <div className="stat-label">{t('admin.onlineUsers')}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.totalUsers}</div>
                  <div className="stat-label">{t('admin.totalUsers')}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.totalMessages}</div>
                  <div className="stat-label">{t('admin.totalMessages')}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{stats.totalRooms}</div>
                  <div className="stat-label">{t('admin.totalRooms')}</div>
                </div>
              </div>

              {/* General Settings */}
              <div className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  <AppIcon name="settings" size={16} />
                  <span>{t('admin.generalSettings') || 'General Settings'}</span>
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'var(--bg-tertiary)', borderRadius: 8 }}>
                  <div>
                    <div style={{ fontWeight: 600, marginBottom: 4 }}>{t('admin.registration') || 'User Registration'}</div>
                    <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
                      {registrationEnabled ? (t('admin.registrationEnabled') || 'New users can sign up') : (t('admin.registrationDisabled') || 'Registration is closed')}
                    </div>
                  </div>
                  <button
                    className={`btn ${registrationEnabled ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={handleToggleRegistration}
                    disabled={settingsLoading}
                    style={{ minWidth: 100 }}
                  >
                    {settingsLoading ? '...' : registrationEnabled ? (t('admin.disable') || 'Disable') : (t('admin.enable') || 'Enable')}
                  </button>
                </div>
              </div>

              {/* Sticker Management */}
              <div className="card" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <AppIcon name="paint" size={16} />
                    <span>{t('admin.stickers')}</span>
                  </h3>
                  <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
                    {t('admin.totalStickers')}: {stickers.length}
                  </div>
                </div>
                
                {/* Upload Button */}
                <label
                  htmlFor="sticker-upload"
                  className="btn btn-primary"
                  style={{ cursor: 'pointer', marginBottom: 16, display: 'inline-block' }}
                >
                  {uploadingSticker ? t('admin.uploading') : t('admin.uploadSticker')}
                  <input
                    id="sticker-upload"
                    type="file"
                    accept="image/png"
                    onChange={handleStickerUpload}
                    disabled={uploadingSticker}
                    style={{ display: 'none' }}
                  />
                </label>
                
                {/* Stickers Grid */}
                {stickersLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                    <div className="spinner" style={{ width: 30, height: 30 }} />
                  </div>
                ) : stickers.length === 0 ? (
                  <p style={{ color: 'var(--fg-muted)', textAlign: 'center', padding: 20 }}>
                    {t('picker.noStickers')}
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
                    {stickers.map((sticker) => (
                      <div
                        key={sticker.id}
                        style={{
                          position: 'relative',
                          background: 'var(--bg-tertiary)',
                          borderRadius: 8,
                          padding: 8,
                          aspectRatio: '1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <Image
                          src={sticker.fileUrl}
                          alt={sticker.fileName}
                          width={100}
                          height={100}
                          unoptimized
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                          }}
                        />
                        <button
                          onClick={() => handleDeleteSticker(sticker.id)}
                          className="btn btn-danger btn-sm"
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            padding: '2px 6px',
                            fontSize: 11,
                          }}
                          title={t('admin.deleteSticker')}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* GIF Management */}
              <div className="card" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <AppIcon name="film" size={16} />
                    <span>{t('admin.gifs')}</span>
                  </h3>
                  <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
                    {t('admin.totalGifs')}: {gifs.length}
                  </div>
                </div>
                
                {/* Upload Button */}
                <label
                  htmlFor="gif-upload"
                  className="btn btn-primary"
                  style={{ cursor: 'pointer', marginBottom: 16, display: 'inline-block' }}
                >
                  {uploadingGif ? t('admin.uploading') : t('admin.uploadGif')}
                  <input
                    id="gif-upload"
                    type="file"
                    accept="video/mp4,image/gif"
                    onChange={handleGifUpload}
                    disabled={uploadingGif}
                    style={{ display: 'none' }}
                  />
                </label>
                
                {/* GIFs Grid */}
                {gifsLoading ? (
                  <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
                    <div className="spinner" style={{ width: 30, height: 30 }} />
                  </div>
                ) : gifs.length === 0 ? (
                  <p style={{ color: 'var(--fg-muted)', textAlign: 'center', padding: 20 }}>
                    {t('picker.noGifs')}
                  </p>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))', gap: 12 }}>
                    {gifs.map((gif) => (
                      <div
                        key={gif.id}
                        style={{
                          position: 'relative',
                          background: 'var(--bg-tertiary)',
                          borderRadius: 8,
                          padding: 8,
                          aspectRatio: '1',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        {gif.format === 'mp4' ? (
                          <video
                            src={gif.fileUrl}
                            autoPlay
                            loop
                            muted
                            playsInline
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                            }}
                          />
                        ) : (
                          <Image
                            src={gif.fileUrl}
                            alt={gif.fileName}
                            width={100}
                            height={100}
                            unoptimized
                            style={{
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                            }}
                          />
                        )}
                        <button
                          onClick={() => handleDeleteGif(gif.id)}
                          className="btn btn-danger btn-sm"
                          style={{
                            position: 'absolute',
                            top: 4,
                            right: 4,
                            padding: '2px 6px',
                            fontSize: 11,
                          }}
                          title={t('admin.deleteGif')}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Storage Info */}
              <div className="card" style={{ marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('admin.diskUsage')}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                  <div>
                    <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{t('admin.dbSize')}</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.dbSize}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{t('admin.uploadsSize')}</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.uploadsSize}</div>
                  </div>
                  <div>
                    <div style={{ color: 'var(--fg-muted)', fontSize: 13 }}>{t('admin.freeSpace')}</div>
                    <div style={{ fontSize: 18, fontWeight: 600 }}>{stats.freeSpace}</div>
                  </div>
                </div>
              </div>

              {/* Active Call */}
              <div className="card">
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('admin.activeCall')}</h3>
                {stats.activeCall ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <div>
                      <span style={{ color: 'var(--online)' }}>● </span>
                      {stats.activeCall.callerName} → {stats.activeCall.calleeId}
                    </div>
                    <button className="btn btn-danger btn-sm">{t('admin.terminateCall')}</button>
                  </div>
                ) : (
                  <p style={{ color: 'var(--fg-muted)' }}>{t('admin.noActiveCall')}</p>
                )}
              </div>

              {/* Superadmin Profile */}
              <div className="card" style={{ marginTop: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>🔐 Superadmin Profile</h3>
                <form onSubmit={handleProfileSave} style={{ display: 'grid', gap: 14 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 13, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>New Username (optional)</label>
                      <input className="input" type="text" placeholder={user?.username} value={profileForm.newUsername}
                        onChange={e => setProfileForm(prev => ({ ...prev, newUsername: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>Display Name</label>
                      <input className="input" type="text" value={profileForm.newDisplayName}
                        onChange={e => setProfileForm(prev => ({ ...prev, newDisplayName: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>New Password (optional)</label>
                      <input className="input" type="password" placeholder="min 8 chars" value={profileForm.newPassword}
                        onChange={e => setProfileForm(prev => ({ ...prev, newPassword: e.target.value }))} />
                    </div>
                    <div>
                      <label style={{ fontSize: 13, color: 'var(--fg-muted)', display: 'block', marginBottom: 4 }}>Current Password <span style={{ color: 'var(--accent)' }}>*</span></label>
                      <input className="input" type="password" placeholder="required" value={profileForm.currentPassword} required
                        onChange={e => setProfileForm(prev => ({ ...prev, currentPassword: e.target.value }))} />
                    </div>
                  </div>
                  {profileMsg && (
                    <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13,
                      background: profileMsg.type === 'ok' ? 'rgba(72,199,116,0.15)' : 'rgba(255,79,79,0.15)',
                      color: profileMsg.type === 'ok' ? 'var(--success)' : 'var(--danger)' }}>
                      {profileMsg.text}
                    </div>
                  )}
                  <button type="submit" className="btn btn-primary" disabled={profileLoading} style={{ justifySelf: 'start' }}>
                    {profileLoading ? '...' : 'Save Changes'}
                  </button>
                </form>
              </div>
            </>
          ) : (
            <p>{t('common.error')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
