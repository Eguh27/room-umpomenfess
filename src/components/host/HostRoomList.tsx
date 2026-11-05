/**
 * Daftar room milik Host (T-51) + aksi per room. Password dari regenerate /
 * jadikan-privat tampil SEKALI di panel bawah baris terkait. Tutup room
 * memakai dialog konfirmasi karena tidak bisa dibalik (arsip tetap jalan).
 */

import { useState } from 'react';
import type { HostedRoom } from './hostApi';

export type RoomAction = 'regenerate' | 'private' | 'close';

interface Props {
  rooms: HostedRoom[];
  /** Room yang sedang menjalankan aksi (tombol room itu disabled). */
  busyId: string | null;
  /**
   * Jalankan aksi; mengembalikan password baru (regenerate/privat) atau null
   * (tutup). Bila gagal, parent menampilkan error dan mengembalikan null.
   */
  onAction: (roomId: string, action: RoomAction) => Promise<{ password: string | null } | null>;
}

function hoursUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / 3_600_000);
}

/** Sisa waktu room — hitungan menit untuk < 1 jam (server: ACTIVE/CLOSED). */
function remainingLabel(room: HostedRoom): string {
  if (room.status === 'CLOSED') {
    const days = room.delete_at ? hoursUntil(room.delete_at) / 24 : 0;
    return days > 0 ? `ditutup · arsip ± ${Math.floor(days)} hari lagi` : 'ditutup';
  }
  const hours = hoursUntil(room.expires_at);
  if (hours >= 48) return `berakhir ${Math.floor(hours / 24)} hari lagi`;
  if (hours >= 1) return `berakhir ${hours} jam lagi`;
  const minutes = Math.max(
    0,
    Math.round((new Date(room.expires_at).getTime() - Date.now()) / 60_000),
  );
  return `berakhir ${minutes} menit lagi`;
}

interface PasswordOnce {
  roomId: string;
  password: string;
  /** Konteks tampilan: password regeneran atau hasil turun-privat. */
  note: string;
}

export default function HostRoomList({ rooms, busyId, onAction }: Props) {
  const [pw, setPw] = useState<PasswordOnce | null>(null);

  const run = async (room: HostedRoom, action: RoomAction) => {
    if (action === 'close') {
      const ok = window.confirm(
        `Tutup room "${room.name}"? Guest langsung kehilangan akses dan room tidak bisa dibuka lagi. Isi chat masuk masa arsip, lalu terhapus permanen.`,
      );
      if (!ok) return;
    }
    const result = await onAction(room.id, action);
    if (result === null) {
      setPw(null);
      return;
    }
    if (result.password) {
      setPw({
        roomId: room.id,
        password: result.password,
        note:
          action === 'regenerate'
            ? 'Password baru tampil sekali. Password lama langsung tidak berlaku.'
            : 'Room kini privat: turun dari FYP dan memakai password baru ini (tampil sekali).',
      });
    } else {
      setPw(null);
    }
  };

  return (
    <ul className="hrooms">
      {rooms.map((room) => {
        const active = room.status === 'ACTIVE';
        const busy = busyId === room.id;
        return (
          <li key={room.id} className={`hroom${active ? '' : ' hroom--closed'}`}>
            <div className="hroom__info">
              <h3>{room.name}</h3>
              <p className="hroom__meta">
                {room.approved_count}/{room.max_guests} Guest
                {room.pending_count > 0 ? ` · ${room.pending_count} nunggu` : ''} ·{' '}
                {remainingLabel(room)} · mengetik {room.typing_effective ? 'aktif' : 'mati'}
              </p>
              <p className="hroom__meta">
                <span className="pill pill--ghost">{room.category ?? 'tanpa kategori'}</span>
                {room.approval_required && <span>· lobi persetujuan</span>}
              </p>
            </div>
            <span className={`badge ${active ? 'badge--active' : 'badge--muted'}`}>
              {active ? 'AKTIF' : 'TUTUP'}
            </span>
            <span
              className={`badge ${room.visibility === 'PUBLIC' ? 'badge--pending' : 'badge--muted'}`}
            >
              {room.visibility === 'PUBLIC' ? 'PUBLIK' : 'PRIVAT'}
            </span>
            <div className="hroom__actions">
              <a className="btn btn--sm btn--brand" href={`/dashboard/r/${room.id}`}>
                {active ? 'Kelola' : 'Lihat'}
              </a>
              {active && room.visibility === 'PRIVATE' && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  disabled={busy}
                  onClick={() => void run(room, 'regenerate')}
                >
                  Ganti password
                </button>
              )}
              {active && room.visibility === 'PUBLIC' && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost-danger"
                  disabled={busy}
                  onClick={() => void run(room, 'private')}
                >
                  Jadikan privat
                </button>
              )}
              {active && (
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  disabled={busy}
                  onClick={() => void run(room, 'close')}
                >
                  Tutup
                </button>
              )}
            </div>
            {pw && pw.roomId === room.id && (
              <div className="hpw hpw--inline" role="status">
                <span className="st-tag">✧ password tampil sekali</span>
                <p className="hpw__code">{pw.password}</p>
                <p className="help">{pw.note} Simpan di tempat aman sekarang.</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
