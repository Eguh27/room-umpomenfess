/**
 * Form buat room (T-51; D-17/19/20). Visibilitas default PRIVAT; kapasitas
 * dibatasi cap tier; default keluar-otomatis 15 menit (publik) / 30 (privat).
 * Password dari create_room ditampilkan SEKALI oleh parent (DashboardRooms)
 * agar tetap terlihat walaupun form digantikan kartu batas kuota.
 */

import { useState } from 'react';
import { APP_DEFAULTS } from '../../lib/config';
import { categories } from '../mockData';
import { createRoom, hostErrorFor, type CreatedRoom, type Quota } from './hostApi';

const IDLE_CHOICES = [10, 15, 30, 60, 120, 240];

interface Props {
  /** Batas kapasitas Guest tier ini (dicerminkan TIER_DEFAULTS). */
  guestsCap: number;
  publicQuota: Quota;
  /** Dipanggil setelah room dibuat; parent menyegarkan daftar. */
  onCreated: (created: CreatedRoom, name: string) => void;
}

function defaultIdle(visibility: 'PRIVATE' | 'PUBLIC'): number {
  return visibility === 'PUBLIC' ? 15 : 30;
}

export default function CreateRoomForm({ guestsCap, publicQuota, onCreated }: Props) {
  const [name, setName] = useState('');
  const [visibility, setVisibility] = useState<'PRIVATE' | 'PUBLIC'>('PRIVATE');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(categories[0]);
  const [capacity, setCapacity] = useState(Math.min(16, guestsCap));
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [typingEnabled, setTypingEnabled] = useState(true);
  const [idle, setIdle] = useState(defaultIdle('PRIVATE'));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const publicFull = publicQuota.used >= publicQuota.max;
  const publicBlocked = publicFull;

  const pickVisibility = (next: 'PRIVATE' | 'PUBLIC') => {
    setVisibility(next);
    setIdle(defaultIdle(next));
  };

  const submit = async () => {
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Isi nama room dulu.');
      return;
    }
    setSubmitting(true);
    setError('');
    const result = await createRoom({
      name: trimmed,
      maxGuests: capacity,
      approvalRequired,
      idleTimeoutMinutes: idle,
      typingEnabled,
      visibility,
      description: description.trim(),
      category,
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(hostErrorFor(result.error));
      return;
    }
    setName('');
    setDescription('');
    onCreated(result.data, trimmed);
    // Kembali ke default aman — visibilitas default PRIVAT, bukan pilihan terakhir.
    pickVisibility('PRIVATE');
  };

  return (
    <form
      className="glass-card hcreate"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="field">
        <label htmlFor="h-name">Nama room</label>
        <input
          className="input"
          id="h-name"
          type="text"
          maxLength={80}
          placeholder="Rapat & Koordinasi KKN"
          value={name}
          onInput={(event) => setName(event.currentTarget.value)}
        />
        <p className="help">Tampak di bar room. Maksimum 80 karakter.</p>
      </div>

      <fieldset className="hcreate__visibility">
        <legend>Visibilitas room</legend>
        <div className="hcreate__choices">
          <label className="hchoice">
            <input
              type="radio"
              name="h-visibility"
              value="PRIVATE"
              checked={visibility === 'PRIVATE'}
              onChange={() => pickVisibility('PRIVATE')}
            />
            <span className="hchoice__body">
              <strong>Privat</strong>
              <span className="help">Link + password. Tidak tampil di FYP.</span>
            </span>
          </label>
          <label className="hchoice">
            <input
              type="radio"
              name="h-visibility"
              value="PUBLIC"
              checked={visibility === 'PUBLIC'}
              disabled={publicBlocked}
              onChange={() => pickVisibility('PUBLIC')}
            />
            <span className="hchoice__body">
              <strong>Publik</strong>
              <span className="help">Tanpa password. Metadata tampil di FYP.</span>
            </span>
          </label>
        </div>
        <p className="help">
          Visibilitas dikunci setelah room dibuat. Hanya publik → privat; privat tidak bisa menjadi
          publik.
        </p>
        {publicBlocked && (
          <p className="help" role="note">
            Opsi publik dimatikan karena kuota room publikmu sudah penuh ({publicQuota.used}/
            {publicQuota.max}).
          </p>
        )}
      </fieldset>

      {visibility === 'PUBLIC' && (
        <div className="hnotice" role="note">
          <strong>Room publik:</strong> isi chat dapat dibaca dan disalin siapa pun yang join.
          Jangan menulis data pribadi atau hal yang tidak ingin tersebar.
        </div>
      )}

      <div className="field">
        <label htmlFor="h-desc">Deskripsi</label>
        <textarea
          className="input"
          id="h-desc"
          maxLength={200}
          rows={3}
          placeholder="Ruang cerita ringan untuk mahasiswa. Jangan bagikan data pribadi."
          value={description}
          onInput={(event) => setDescription(event.currentTarget.value)}
        />
        <p className="help">Tampil di FYP untuk room publik. Maksimum 200 karakter.</p>
      </div>

      <div className="field">
        <label htmlFor="h-cat">Kategori</label>
        <select
          className="select"
          id="h-cat"
          value={category}
          onChange={(event) => setCategory(event.currentTarget.value)}
        >
          {categories.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <p className="help">
          Dipakai filter FYP; room privat tetap menyimpan kategori untuk arsip.
        </p>
      </div>

      <p className="hcreate__quota">
        Sisa kuota publik:{' '}
        <strong>
          {publicQuota.used}/{publicQuota.max}
        </strong>{' '}
        room publik aktif terpakai. Room publik wajib memakai email terkonfirmasi.
      </p>

      <div className="field">
        <label htmlFor="h-cap">Kapasitas Guest</label>
        <input
          id="h-cap"
          type="range"
          min={2}
          max={guestsCap}
          value={capacity}
          step={1}
          onInput={(event) => setCapacity(Number(event.currentTarget.value))}
        />
        <output className="hcreate__out" htmlFor="h-cap">
          {capacity} Guest
        </output>
        <p className="help">
          <strong>Batasmu: {guestsCap} (tier kamu).</strong> Melebihi batas ini memerlukan tier
          lebih tinggi.
        </p>
      </div>

      <div className="htoggles">
        <label className="toggle">
          <input
            type="checkbox"
            checked={approvalRequired}
            onChange={(event) => setApprovalRequired(event.currentTarget.checked)}
          />
          <span className="toggle__track"></span>
          <span className="toggle__label">Persetujuan masuk manual</span>
        </label>
        <p className="help">Guest menunggu di lobi sampai kamu menyetujui.</p>

        <label className="toggle">
          <input
            type="checkbox"
            checked={typingEnabled}
            onChange={(event) => setTypingEnabled(event.currentTarget.checked)}
          />
          <span className="toggle__track"></span>
          <span className="toggle__label">Indikator mengetik</span>
        </label>
        <p className="help">Otomatis mati bila kanal global dimatikan atau kapasitas &gt; 20.</p>
      </div>

      <div className="field">
        <label htmlFor="h-idle">Keluarkan Guest yang diam</label>
        <select
          className="select"
          id="h-idle"
          value={idle}
          onChange={(event) => setIdle(Number(event.currentTarget.value))}
        >
          {IDLE_CHOICES.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes === defaultIdle(visibility)
                ? `${minutes} menit (default)`
                : `${minutes} menit`}
            </option>
          ))}
        </select>
        <p className="help">Guest yang keluar otomatis bisa masuk lagi tanpa password baru.</p>
      </div>

      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      <button className="btn btn--primary btn--block" type="submit" disabled={submitting}>
        {submitting ? 'Membuat room…' : 'Buat room'}
      </button>
      <p className="help">
        Room aktif {APP_DEFAULTS.roomActiveDays} hari, arsip {APP_DEFAULTS.roomGraceDays} hari, lalu
        dihapus permanen.
      </p>
    </form>
  );
}
