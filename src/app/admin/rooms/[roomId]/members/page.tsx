'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Member {
  userId: string;
  joinedAt: string;
  user: {
    id: string;
    username: string;
    displayName: string | null;
    isBanned: boolean;
    lastSeen: string;
  };
}

interface User {
  id: string;
  username: string;
  displayName: string | null;
}

export default function RoomMembersPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [members, setMembers] = useState<Member[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchMembers();
    fetchAllUsers();
  }, [roomId]);

  const fetchMembers = async () => {
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/members`);
      const data = await res.json();
      if (res.ok) setMembers(data.members || []);
    } catch (err) {
      console.error('Failed to fetch members:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const res = await fetch('/api/users?search=');
      const data = await res.json();
      if (res.ok) setAllUsers(data.users || []);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  const handleAddMember = async (userId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        await fetchMembers();
        setShowAddModal(false);
        setSearchQuery('');
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add member');
      }
    } catch (err) {
      console.error('Failed to add member:', err);
      alert('Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveMember = async (userId: string, username: string) => {
    if (!confirm(`Remove ${username} from this room?`)) return;

    try {
      const res = await fetch(`/api/admin/rooms/${roomId}/members`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (res.ok) {
        await fetchMembers();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to remove member');
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
      alert('Failed to remove member');
    }
  };

  const memberIds = new Set(members.map((m) => m.userId));
  const availableUsers = allUsers.filter(
    (u) =>
      !memberIds.has(u.id) &&
      (u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        u.displayName?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div style={{ padding: 20 }}>
      <div style={{ marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost" onClick={() => router.push('/admin/rooms')}>
          ← Back
        </button>
        <h1 style={{ fontSize: 24, fontWeight: 700, flex: 1 }}>Manage Members</h1>
        <button className="btn btn-primary" onClick={() => setShowAddModal(true)}>
          + Add Member
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Display Name</th>
                <th>Status</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.userId}>
                  <td>{member.user.username}</td>
                  <td>{member.user.displayName || '—'}</td>
                  <td>
                    {member.user.isBanned ? (
                      <span className="badge badge-error">Banned</span>
                    ) : (
                      <span className="badge badge-success">Active</span>
                    )}
                  </td>
                  <td>{new Date(member.joinedAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-error"
                      onClick={() => handleRemoveMember(member.userId, member.user.username)}
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Member Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 16 }}>Add Member</h2>

            <input
              className="input"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ marginBottom: 16 }}
            />

            <div style={{ maxHeight: 300, overflowY: 'auto', marginBottom: 16 }}>
              {availableUsers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 20, color: 'var(--fg-muted)' }}>
                  {searchQuery ? 'No matching users found' : 'All users are already members'}
                </div>
              ) : (
                availableUsers.map((user) => (
                  <div
                    key={user.id}
                    style={{
                      padding: '10px 12px',
                      borderBottom: '1px solid var(--bg-tertiary)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600 }}>{user.username}</div>
                      {user.displayName && (
                        <div style={{ fontSize: 13, opacity: 0.7 }}>{user.displayName}</div>
                      )}
                    </div>
                    <button
                      className="btn btn-sm btn-primary"
                      onClick={() => handleAddMember(user.id)}
                      disabled={submitting}
                    >
                      Add
                    </button>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
