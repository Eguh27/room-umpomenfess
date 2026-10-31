/**
 * Daftar FYP room publik (T-32; D-18/20/21). Client-side filter/sort/cari di atas
 * snapshot yang dioper halaman — sambungan nyata ke GET /api/rooms/public memakai
 * pemisahan respons yang sama saat T-24 (kolom whitelist saja, tanpa personalisasi).
 */

import { useMemo, useState } from 'react';
import type { PublicRoom } from './mockData';
import { categories } from './mockData';
import { reportHideThreshold } from './reportTypes';
import type { ReportReason } from './reportTypes';
import ReportModal from './ReportModal';

type Sort = 'aktif' | 'terbaru';

interface Props {
  rooms: PublicRoom[];
}

/** Label "aktivitas terakhir" dari menit sejak pesan terakhir (D-18). */
function activityLabel(minutes: number): string {
  if (minutes < 1) return 'aktif baru saja';
  if (minutes < 60) return `aktif ${minutes} menit lalu`;
  if (minutes < 1440) return `aktif ${Math.floor(minutes / 60)} jam lalu`;
  return `aktif ${Math.floor(minutes / 1440)} hari lalu`;
}

export default function ExploreRooms({ rooms }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState<Sort>('aktif');
  /** Laporan yang sudah dikirim di sesi ini (pratinjau; kirim nyata menyusul T-25). */
  const [reported, setReported] = useState<Record<string, ReportReason>>({});
  const [openRoom, setOpenRoom] = useState<PublicRoom | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const filtered = rooms.filter(
      (room) =>
        (category === '' || room.category === category) &&
        (needle === '' || room.name.toLowerCase().includes(needle)),
    );
    if (sort !== 'aktif') return filtered;
    // Sort "Ramai": proxy messages_last_hour — semakin segar semakin atas, lalu jumlah anggota.
    return [...filtered].sort(
      (a, b) => a.lastActivityMinutes - b.lastActivityMinutes || b.approvedCount - a.approvedCount,
    );
  }, [rooms, query, category, sort]);

  const submitReport = (reason: ReportReason) => {
    if (openRoom) setReported((prev) => ({ ...prev, [openRoom.slug]: reason }));
    setOpenRoom(null);
  };

  return (
    <div className="fyp">
      <div className="fyp__controls">
        <div className="field fyp__search">
          <label htmlFor="fyp-q">Cari nama room</label>
          <input
            className="input"
            id="fyp-q"
            type="search"
            placeholder="mis. curhat, kuis"
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
          />
        </div>
        <div className="field fyp__sort">
          <label htmlFor="fyp-sort">Urutan</label>
          <select
            className="select"
            id="fyp-sort"
            value={sort}
            onChange={(event) => setSort(event.currentTarget.value as Sort)}
          >
            <option value="aktif">Ramai</option>
            <option value="terbaru">Terbaru</option>
          </select>
        </div>
      </div>

      <div className="fyp__cats" role="group" aria-label="Filter kategori">
        <button
          type="button"
          className={`pill ${category === '' ? 'pill--on' : 'pill--ghost'}`}
          aria-pressed={category === ''}
          onClick={() => setCategory('')}
        >
          Semua
        </button>
        {categories.map((item) => (
          <button
            key={item}
            type="button"
            className={`pill ${category === item ? 'pill--on' : 'pill--ghost'}`}
            aria-pressed={category === item}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="card fyp__empty">
          <h3>Tidak ada room yang cocok</h3>
          <p className="help">
            Coba kata lain atau kosongkan filter. Room privat tidak pernah tampil di daftar ini.
          </p>
        </div>
      ) : (
        <ul className="fyp__list">
          {visible.map((room) => {
            const pct = Math.min(100, Math.round((room.approvedCount / room.maxGuests) * 100));
            const done = room.slug in reported;
            return (
              <li key={room.slug} className="glass-card fyp-card">
                <div className="fyp-card__head">
                  <h3>{room.name}</h3>
                  <span className={`badge ${room.isFull ? 'badge--danger' : 'badge--active'}`}>
                    {room.isFull ? 'Penuh' : 'Bisa gabung'}
                  </span>
                </div>
                <p className="fyp-card__desc">{room.description}</p>
                <div
                  className="fyp-card__track"
                  role="img"
                  aria-label={`${room.approvedCount} dari ${room.maxGuests} kursi terpakai`}
                >
                  <span
                    className={`fyp-card__fill ${room.isFull ? 'fyp-card__fill--full' : ''}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="fyp-card__meta">
                  <span className="pill pill--ghost">{room.category}</span>
                  <span>
                    {room.approvedCount}/{room.maxGuests} anggota
                  </span>
                  <span>{activityLabel(room.lastActivityMinutes)}</span>
                </p>
                <div className="fyp-card__row">
                  {room.isFull ? (
                    <button type="button" className="btn btn--sm btn--brand" disabled>
                      Kursi penuh
                    </button>
                  ) : (
                    <a className="btn btn--sm btn--brand" href={`/r/${room.slug}`}>
                      Gabung
                    </a>
                  )}
                  <button
                    type="button"
                    className="btn btn--sm btn--ghost"
                    disabled={done}
                    onClick={() => setOpenRoom(room)}
                  >
                    {done ? 'Laporan tercatat (pratinjau)' : 'Laporkan'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="help fyp__note">
        Laporan dihitung dari pelapor unik — {reportHideThreshold} pelapor berbeda membuat room
        turun dari daftar ini sampai Admin meninjau. Di pratinjau ini laporan hanya dicatat di sesi
        browser.
      </p>

      {openRoom && (
        <ReportModal
          roomName={openRoom.name}
          onClose={() => setOpenRoom(null)}
          onSubmit={submitReport}
        />
      )}
    </div>
  );
}
