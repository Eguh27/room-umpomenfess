/**
 * Island dasbor Host (T-51). Memanggil RPC lewat sesi browser (auth.uid()
 * di dalam fungsi); halaman Astro cukup memastikan pengunjung login non-anonim.
 * Semua error RPC ditampilkan sebagai kalimat Indonesia dari hostErrorFor.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TIER_DEFAULTS } from '../../lib/config';
import CreateRoomForm from './CreateRoomForm';
import HostRoomList, { type RoomAction } from './HostRoomList';
import {
  closeRoom,
  fetchHostedRooms,
  hostErrorFor,
  makeRoomPrivate,
  regeneratePassword,
  type CreatedRoom,
  type HostedRoom,
} from './hostApi';

export default function DashboardRooms({ dev }: { dev: boolean }) {
  const [rooms, setRooms] = useState<HostedRoom[] | null>(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  /** Hasil create_room terakhir — panel password sekali-tampil milik parent agar
   * tetap terlihat walau form digantikan kartu batas kuota. */
  const [oneTime, setOneTime] = useState<CreatedRoom | null>(null);

  const copyGuestLink = async (slug: string) => {
    try {
      const url = `${window.location.origin}/r/${slug}`;
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    } catch {
      // Browser mungkin melarang clipboard tanpa interaksi langsung
    }
  };

  const load = useCallback(async () => {
    const result = await fetchHostedRooms();
    if (!result.ok) {
      setError(hostErrorFor(result.error));
      setRooms(null);
      return;
    }
    setError('');
    setRooms(result.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Cap kapasitas tier: petakan max_active_rooms ke batas tier — server tetap sumber kebenaran. */
  const guestsCap = useMemo(() => {
    const first = rooms?.[0];
    if (!first) return TIER_DEFAULTS.free.maxGuestsCap;
    const max = first.quota.max ?? 0;
    const tier = Object.values(TIER_DEFAULTS).find((t) => t.maxActiveRooms === max);
    return tier?.maxGuestsCap ?? TIER_DEFAULTS.free.maxGuestsCap;
  }, [rooms]);

  const quota =
    rooms?.[0]?.quota ??
    (rooms !== null && rooms.length === 0
      ? { used: 0, max: TIER_DEFAULTS.free.maxActiveRooms }
      : null);
  /** Mirror tier_limits.max_public tier free untuk host tanpa room — fallback UI,
   * server tetap sumber kebenaran. (REQUEST ke R: tambahkan maxPublicRooms di
   * TIER_DEFAULTS supaya angka ini tidak duplikat.) */
  const publicQuota = rooms?.[0]?.public_quota ?? { used: 0, max: 1 };
  const activeCount = rooms?.filter((room) => room.status === 'ACTIVE').length ?? 0;
  const quotaFull = quota !== null && activeCount >= quota.max;

  const onCreated = (created: CreatedRoom, name: string) => {
    setOneTime(created);
    setFlash(
      `Room "${name}" dibuat.` +
        (created.password ? ' Password tampil sekali di panel bawah form.' : ''),
    );
    void load();
  };

  const runAction = async (
    roomId: string,
    action: RoomAction,
  ): Promise<{ password: string | null } | null> => {
    setBusyId(roomId);
    const result =
      action === 'regenerate'
        ? await regeneratePassword(roomId)
        : action === 'private'
          ? await makeRoomPrivate(roomId)
          : await closeRoom(roomId);
    setBusyId(null);
    if (!result.ok) {
      setError(hostErrorFor(result.error));
      return null;
    }
    setError('');
    const password = action === 'close' ? null : (result.data as string | null) || null;
    setFlash(
      action === 'close'
        ? 'Room ditutup. Arsip tetap tersimpan sampai jadwal penghapusan.'
        : action === 'private'
          ? 'Room kini privat — password barunya tampil sekali.'
          : 'Password room diganti — tampil sekali.',
    );
    void load();
    return { password };
  };

  if (error && rooms === null) {
    return (
      <div className="hdash__error card" role="alert">
        <h2>Dasbor tidak bisa dimuat</h2>
        <p>{error}</p>
        <button type="button" className="btn btn--ghost" onClick={() => void load()}>
          Coba lagi
        </button>
      </div>
    );
  }

  return (
    <div className="hdash">
      {/* kuota */}
      <div className="hquota" aria-busy={rooms === null}>
        <span className="hquota__label">Room aktif</span>
        <div
          className="hquota__track"
          role="img"
          aria-label={
            quota ? `${quota.used} dari ${quota.max} room aktif terpakai` : 'Memuat kuota…'
          }
        >
          {quota && (
            <div
              className="hquota__fill"
              style={{ width: `${Math.min(100, (quota.used / Math.max(1, quota.max)) * 100)}%` }}
            />
          )}
        </div>
        <span className="hquota__num">{quota ? `${quota.used}/${quota.max}` : '…'}</span>
        {dev && <span className="pill pill--ghost">(sesi browser)</span>}
      </div>

      {flash && (
        <p className="hflash" role="status">
          {flash}
        </p>
      )}

      {/* panel password sekali-tampil (hasil create_room terakhir) */}
      {oneTime && (
        <details className="hpw" open>
          <summary>✧ Password room {oneTime.slug} — tampil sekali</summary>
          <div className="hpw__panel">
            {oneTime.password ? (
              <>
                <p className="hpw__code">{oneTime.password}</p>
                <p className="help">
                  Simpan sekarang — password ini tidak bisa ditampilkan lagi. Bagikan lewat link
                  join ke Guest.
                </p>
              </>
            ) : (
              <p className="help">Room publik tidak memakai password — cukup bagikan linknya.</p>
            )}
            <div className="row" style={{ gap: '8px', marginTop: '14px', flexWrap: 'wrap' }}>
              <a className="btn btn--sm btn--brand" href={`/dashboard/r/${oneTime.room_id}`}>
                Masuk ke Ruang Chat
              </a>
              <button
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => void copyGuestLink(oneTime.slug)}
              >
                {copiedLink ? '✓ Link Guest Disalin!' : 'Salin Link Undangan Guest'}
              </button>
            </div>
          </div>
        </details>
      )}

      {/* daftar room */}
      <h2 className="hdash__section">Room kamu</h2>
      {rooms === null && !error ? (
        <p className="help">Memuat room…</p>
      ) : rooms !== null && rooms.length === 0 ? (
        <div className="card hempty">
          <h3>Belum ada room</h3>
          <p className="help">Buat room pertamamu lewat formulir di bawah.</p>
        </div>
      ) : (
        rooms && <HostRoomList rooms={rooms} busyId={busyId} onAction={runAction} />
      )}

      {/* form disembunyikan bila kuota penuh — pesan yang benar untuk kuota habis.
          Tetap tampil untuk host baru (0 room) dan setelah list termuat. */}
      {rooms !== null &&
        (quotaFull ? (
          <div className="card hquota-full" role="status">
            <h3>
              Batas room aktif tercapai ({activeCount}/{quota?.max})
            </h3>
            <p>
              Tutup salah satu room biar bisa bikin baru. Pembayaran belum tersedia — semua tier
              disetel lewat konfigurasi manual.
            </p>
          </div>
        ) : (
          <>
            <h2 className="hdash__section">Buat room</h2>
            <CreateRoomForm guestsCap={guestsCap} publicQuota={publicQuota} onCreated={onCreated} />
          </>
        ))}
    </div>
  );
}
