import { useCallback, useEffect, useState } from 'react';
import { getBrowserClient } from '../../lib/supabase/browser';
import Handle from '../Handle';
import { formatRemainingTime } from '../chat/chatApi';

export interface MyRoomItem {
  room_id: string;
  slug: string;
  name: string;
  room_status: 'ACTIVE' | 'CLOSED';
  my_status: 'PENDING' | 'APPROVED' | 'IDLE';
  handle: string;
  handle_verified: boolean;
  expires_at: string;
}

export default function MyRooms() {
  const [rooms, setRooms] = useState<MyRoomItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const client = getBrowserClient();
      const { data, error: rpcError } = await client.rpc('my_rooms');
      if (rpcError) {
        setError(rpcError.message);
        setRooms(null);
      } else {
        setRooms((data as MyRoomItem[]) ?? []);
      }
    } catch (err: any) {
      setError(err?.message ?? 'Gagal memuat daftar room.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
        <p className="help">Memuat daftar room kamu…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card warn" role="alert" style={{ padding: '24px', textAlign: 'center' }}>
        <h2>Gagal memuat room</h2>
        <p style={{ margin: '8px 0 16px' }}>{error}</p>
        <button type="button" className="btn btn--ghost" onClick={() => void load()}>
          Coba lagi
        </button>
      </div>
    );
  }

  if (rooms && rooms.length === 0) {
    return (
      <div className="card hempty" style={{ textAlign: 'center', padding: '36px 20px' }}>
        <h3>Belum ada room yang kamu ikuti</h3>
        <p className="help" style={{ margin: '12px 0 20px', maxWidth: '480px', marginInline: 'auto' }}>
          Kamu belum bergabung ke ruang obrolan manapun. Masuk ke room lewat tautan undangan dari Host atau buat room milikmu sendiri di Dasbor Host.
        </p>
        <div className="row" style={{ justifyContent: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <a className="btn btn--primary" href="/dashboard">
            Dasbor Host
          </a>
          <a className="btn btn--ghost" href="/jelajahi">
            Jelajahi Room Publik
          </a>
        </div>
      </div>
    );
  }

  return (
    <ul className="rooms">
      {rooms?.map((room) => {
        const isApproved = room.my_status === 'APPROVED';
        const isPending = room.my_status === 'PENDING';
        const isIdle = room.my_status === 'IDLE';

        return (
          <li key={room.room_id} className="room">
            <div className="room__info">
              <h3>{room.name}</h3>
              <p className="room__meta">
                {formatRemainingTime(room.expires_at)}
                {room.handle && (
                  <span>
                    {' · kamu: '}
                    <Handle
                      handle={room.handle}
                      badge={room.handle_verified ? 'VERIFIED' : null}
                    />
                  </span>
                )}
              </p>
            </div>

            {isApproved && <span className="badge badge--active">AKTIF</span>}
            {isPending && <span className="badge badge--pending">MENUNGGU PERSETUJUAN</span>}
            {isIdle && <span className="badge badge--muted">IDLE</span>}

            <div className="room__actions">
              {isApproved && (
                <a className="btn btn--sm btn--brand" href={`/r/${room.slug}?state=chat`}>
                  Buka Chat
                </a>
              )}
              {isPending && (
                <a className="btn btn--sm btn--ghost" href={`/r/${room.slug}`}>
                  Cek Status
                </a>
              )}
              {isIdle && (
                <a className="btn btn--sm btn--brand" href={`/r/${room.slug}?state=chat`}>
                  Masuk Lagi
                </a>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
