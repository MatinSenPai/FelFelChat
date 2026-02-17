'use client';

import { useState, useEffect, useRef } from 'react';

interface VoiceCallProps {
  status: 'ringing' | 'incoming' | 'active';
  callerName?: string;
  calleeName?: string;
  onAccept: () => void;
  onReject: () => void;
  onEnd: () => void;
  t: (key: string) => string;
}

export default function VoiceCall({
  status,
  callerName,
  calleeName,
  onAccept,
  onReject,
  onEnd,
  t,
}: VoiceCallProps) {
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Timer for active calls
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (status === 'active') {
      let elapsed = 0;
      intervalRef.current = setInterval(() => {
        elapsed += 1;
        setDuration(elapsed);
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status]);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const contactName = callerName || calleeName || '...';

  return (
    <div className="call-overlay">
      {/* Contact avatar */}
      <div className="call-pulse" style={{ marginBottom: 32 }}>
        <div style={{
          width: '100%',
          height: '100%',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #e84545, #ff8a5c)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 48,
          fontWeight: 700,
          color: 'white',
        }}>
          {contactName.charAt(0).toUpperCase()}
        </div>
      </div>

      {/* Contact name */}
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        {contactName}
      </h2>

      {/* Status text */}
      <p style={{ color: 'var(--fg-secondary)', fontSize: 16, marginBottom: 40 }}>
        {status === 'ringing' && t('call.calling')}
        {status === 'incoming' && t('call.incoming')}
        {status === 'active' && formatDuration(duration)}
      </p>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
        {/* Incoming: Accept + Reject */}
        {status === 'incoming' && (
          <>
            <button
              onClick={onReject}
              style={{
                width: 64, height: 64, borderRadius: '50%',
                background: '#f44336', border: 'none',
                color: 'white', fontSize: 28, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
              onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              title={t('call.reject')}
            >
              ✕
            </button>
            <button
              onClick={onAccept}
              style={{
                width: 72, height: 72, borderRadius: '50%',
                background: '#4caf50', border: 'none',
                color: 'white', fontSize: 32, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.2s',
                animation: 'pulse 1.5s ease-in-out infinite',
              }}
              onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
              onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              title={t('call.accept')}
            >
              📞
            </button>
          </>
        )}

        {/* Active or Ringing: Mute + End */}
        {(status === 'active' || status === 'ringing') && (
          <>
            {status === 'active' && (
              <button
                onClick={() => setIsMuted(!isMuted)}
                style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: isMuted ? 'var(--accent)' : 'var(--bg-tertiary)',
                  border: 'none', color: 'white', fontSize: 22,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.2s',
                }}
                title={isMuted ? t('call.unmute') : t('call.mute')}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
            )}
            <button
              onClick={onEnd}
              style={{
                width: 64, height: 64, borderRadius: '50%',
                background: '#f44336', border: 'none',
                color: 'white', fontSize: 28, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'transform 0.2s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.transform = 'scale(1.1)')}
              onMouseOut={(e) => (e.currentTarget.style.transform = 'scale(1)')}
              title={t('call.end')}
            >
              ✕
            </button>
          </>
        )}
      </div>
    </div>
  );
}
