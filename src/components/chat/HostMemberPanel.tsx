import { useState } from 'react';
import type { RoomMember } from '../../lib/realtime/types';
import Handle from '../Handle';
import { decideMember, kickMember } from './chatApi';

interface Props {
  members: RoomMember[];
  onActionComplete?: () => void;
}

export default function HostMemberPanel({ members }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const pendingMembers = members.filter((m) => m.status === 'PENDING');
  const approvedMembers = members.filter((m) => m.status === 'APPROVED');

  const handleDecide = async (memberId: string, decision: 'APPROVE' | 'REJECT') => {
    if (busyId) return;
    setBusyId(memberId);
    setActionError(null);
    const result = await decideMember(memberId, decision);
    setBusyId(null);
    if (!result.ok) {
      setActionError(
        result.error === 'ROOM_FULL'
          ? 'Kapasitas room sudah penuh. Tidak bisa menyetujui member lagi.'
          : 'Gagal memproses permintaan member.'
      );
    }
  };

  const handleKick = async (memberId: string) => {
    if (busyId) return;
    if (!window.confirm('Keluarkan member ini dari room?')) return;
    setBusyId(memberId);
    setActionError(null);
    const result = await kickMember(memberId);
    setBusyId(null);
    if (!result.ok) {
      setActionError('Gagal mengeluarkan member.');
    }
  };

  return (
    <aside className="glass-card mp" aria-label="Panel member">
      <h2 className="mp__title">
        Member{' '}
        <span className="pill">
          {approvedMembers.length} approve · {pendingMembers.length} nunggu
        </span>
      </h2>

      {actionError && (
        <div className="card warn" style={{ padding: '8px 12px', fontSize: '0.85rem' }}>
          {actionError}
        </div>
      )}

      {pendingMembers.length > 0 && (
        <>
          <p className="mp__section">Menunggu persetujuan</p>
          {pendingMembers.map((p) => (
            <div key={p.id} className="mp__pending-card">
              <div className="mp__row" style={{ borderBottom: 0, paddingTop: 0 }}>
                <span className="mp__avatar" aria-hidden="true">
                  ?
                </span>
                <div className="mp__text">
                  <span className="mp__name">
                    <Handle handle={p.handle} badge={p.handle_verified ? 'VERIFIED' : null} />
                  </span>
                  <span className="mp__meta">Menunggu di lobi</span>
                </div>
              </div>
              <div className="mp__actions">
                <button
                  className="btn btn--sm btn--brand"
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => handleDecide(p.id, 'APPROVE')}
                >
                  {busyId === p.id ? '…' : 'Setujui'}
                </button>
                <button
                  className="btn btn--sm btn--ghost"
                  type="button"
                  disabled={busyId === p.id}
                  onClick={() => handleDecide(p.id, 'REJECT')}
                >
                  Tolak
                </button>
              </div>
            </div>
          ))}
        </>
      )}

      <p className="mp__section">Anggota di dalam room</p>
      {approvedMembers.length === 0 ? (
        <p className="help" style={{ margin: '8px 0' }}>
          Belum ada member yang masuk.
        </p>
      ) : (
        approvedMembers.map((m) => (
          <div key={m.id} className="mp__row">
            <span className="mp__avatar" aria-hidden="true">
              {m.handle.slice(0, 2)}
            </span>
            <div className="mp__text">
              <span className="mp__name">
                <Handle handle={m.handle} badge={m.handle_verified ? 'VERIFIED' : null} />
              </span>
              <span className="mp__meta">Aktif</span>
            </div>
            <button
              className="btn btn--sm btn--ghost"
              type="button"
              disabled={busyId === m.id}
              onClick={() => handleKick(m.id)}
              style={{ color: 'var(--red-deep, #c53030)' }}
            >
              Kick
            </button>
          </div>
        ))
      )}
    </aside>
  );
}

