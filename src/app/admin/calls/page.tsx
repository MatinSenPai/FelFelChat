'use client';

import { useState, useEffect } from 'react';
import { useI18n } from '@/components/providers/I18nProvider';
import { connectSocket, getSocket } from '@/lib/socket';
import Link from 'next/link';

interface CallInfo {
  callerId: string;
  calleeId: string;
  callerName: string;
  logId: string;
  startedAt: string;
  status?: string;
}

export default function AdminCallsPage() {
  const { t, dir } = useI18n();
  const [activeCall, setActiveCall] = useState<CallInfo | null>(null);
  const [callHistory, setCallHistory] = useState<CallInfo[]>([]);

  useEffect(() => {
    const socket = connectSocket();

    socket.on('call:started', (call: CallInfo) => {
      setActiveCall(call);
    });

    socket.on('call:updated', (call: CallInfo) => {
      setActiveCall(call);
    });

    socket.on('call:ended', (call: CallInfo) => {
      setActiveCall(null);
      setCallHistory((prev) => [call, ...prev]);
    });

    return () => {
      socket.off('call:started');
      socket.off('call:updated');
      socket.off('call:ended');
    };
  }, []);

  const terminateCall = () => {
    if (activeCall) {
      const socket = getSocket();
      socket.emit('call:terminate', { logId: activeCall.logId });
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', direction: dir }}>
      <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--bg-tertiary)', background: 'var(--bg-secondary)', display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link href="/admin" className="btn btn-ghost btn-sm">← {t('common.back')}</Link>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>📞 {t('admin.calls')}</h1>
      </div>
      <div style={{ padding: 24 }}>
        {/* Active Call */}
        <div className="card" style={{ marginBottom: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('admin.activeCall')}</h3>
          {activeCall ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <span style={{ color: 'var(--online)', animation: 'pulse 1.5s infinite' }}>●</span>
                  <span style={{ fontWeight: 600, fontSize: 16 }}>
                    {activeCall.callerName} → {activeCall.calleeId}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: 'var(--fg-muted)' }}>
                  {t('call.duration')}: {new Date(Date.now() - new Date(activeCall.startedAt).getTime()).toISOString().substr(14, 5)}
                </div>
              </div>
              <button className="btn btn-danger" onClick={terminateCall}>
                {t('admin.terminateCall')}
              </button>
            </div>
          ) : (
            <p style={{ color: 'var(--fg-muted)' }}>{t('admin.noActiveCall')}</p>
          )}
        </div>

        {/* Call History */}
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{t('admin.callHistory')}</h3>
        {callHistory.length === 0 ? (
          <p style={{ color: 'var(--fg-muted)' }}>{t('common.noResults')}</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Caller</th>
                  <th>Callee</th>
                  <th>Status</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {callHistory.map((call, i) => (
                  <tr key={i}>
                    <td>{call.callerName}</td>
                    <td>{call.calleeId}</td>
                    <td>
                      <span className="badge" style={{
                        background: call.status === 'TERMINATED' ? 'rgba(244,67,54,0.2)' : 'rgba(76,175,80,0.2)',
                        color: call.status === 'TERMINATED' ? 'var(--danger)' : 'var(--success)',
                      }}>
                        {call.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 13, color: 'var(--fg-muted)' }}>{new Date(call.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
