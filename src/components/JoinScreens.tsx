import { useEffect, useState, type ReactNode } from 'react';
import Handle from './Handle';
import type { JoinFeedback, JoinSuccess } from './joinTypes';

type StageProps = { children: ReactNode };

function Stage({ children }: StageProps) {
  return <section className="glass-card stage">{children}</section>;
}

function Countdown({ until }: { until: number }) {
  const [left, setLeft] = useState(() => Math.max(0, until - Date.now()));
  useEffect(() => {
    const timer = setInterval(() => {
      setLeft(Math.max(0, until - Date.now()));
    }, 1000);
    return () => clearInterval(timer);
  }, [until]);

  const seconds = Math.ceil(left / 1000);
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');

  return (
    <p className="stage__count" role="timer" aria-live="polite" aria-label="Sisa waktu tunggu">
      {mm}:{ss}
    </p>
  );
}

/** Layar disclaimers awal. */
export function DisclaimerStage({ slug, onContinue }: { slug: string; onContinue: () => void }) {
  return (
    <Stage>
      <div className="stage__icon" aria-hidden="true">
        <svg
          viewBox="0 0 24 24"
          width="26"
          height="26"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6h16v12H4z" />
          <path d="M4 7l8 6 8-6" />
        </svg>
      </div>
      <h1>Sebelum masuk room</h1>
      <ul className="stage__list">
        <li>
          Percakapan ini berbentuk teks saja — Host yang membuat room bisa membacanya dan
          mengeluarkan pengganggu.
        </li>
        <li>
          Kamu tampil dengan handle acak sembilan karakter, bukan nama atau akun. Host tidak pernah
          menerima identitas akunmu.
        </li>
        <li>
          <strong>Room publik:</strong> isi chat dapat dibaca dan disalin siapa pun yang join.
          Jangan menulis data pribadi atau hal yang tidak ingin tersebar.
        </li>
        <li>
          Berlaku 7 hari aktif lalu 15 hari arsip — setiap kata bisa dibaca sampai dihapus permanen,
          jadi tulis seolah dibaca publik.
        </li>
      </ul>
      <button className="btn btn--primary btn--block" type="button" onClick={onContinue}>
        Verifikasi &amp; lanjut
      </button>
      <span className="pill">{slug}</span>
    </Stage>
  );
}

/** Layar kegagalan besar (terkunci, room penuh, dst). */
export function BlockedStage({
  feedback,
  countdownUntil,
  onRetry,
}: {
  feedback: JoinFeedback;
  countdownUntil: number | null;
  onRetry: () => void;
}) {
  return (
    <Stage>
      <div
        className={feedback.tone === 'danger' ? 'stage__icon stage__icon--warn' : 'stage__icon'}
        aria-hidden="true"
      >
        <svg
          viewBox="0 0 24 24"
          width="30"
          height="30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5" />
          <path d="M12 16h.01" />
        </svg>
      </div>
      <h1 id="t-blocked">{feedback.title}</h1>
      <p className="stage__body">{feedback.body}</p>
      {feedback.countdown && countdownUntil !== null && <Countdown until={countdownUntil} />}
      {feedback.cta !== null &&
        (feedback.cta.target === 'home' ? (
          <a className="btn btn--ghost btn--block" href="/">
            {feedback.cta.label}
          </a>
        ) : feedback.cta.target === 'rooms' ? (
          <a className="btn btn--ghost btn--block" href="/rooms">
            {feedback.cta.label}
          </a>
        ) : (
          <button className="btn btn--primary btn--block" type="button" onClick={onRetry}>
            {feedback.cta.label}
          </button>
        ))}
    </Stage>
  );
}

/** Layar lulus + masuk APPROVED. */
export function ApprovedStage({ success, slug }: { success: JoinSuccess; slug: string }) {
  return (
    <Stage>
      <span className="badge badge--active">MASUK</span>
      <h1>Berhasil masuk</h1>
      <p className="stage__body">
        Kamu tampil di room ini sebagai <Handle handle={success.handle} />. Handle ini dipakai
        sampai kamu keluar.
      </p>
      <a className="btn btn--primary btn--block" href={`/r/${slug}?state=chat`}>
        Lanjut ke percakapan
      </a>
      <p className="stage__foot help">
        Percakapan berjalan di halaman chat — bagian realtime disambung T-53.
      </p>
    </Stage>
  );
}

/** Layar lobi PENDING + tombol segarkan. */
export function PendingStage({
  success,
  busy,
  onRefresh,
}: {
  success: JoinSuccess;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <Stage>
      <span className="badge badge--pending">MENUNGGU PERSETUJUAN</span>
      <h1>Permintaanmu tertulis di lobi</h1>
      <p className="stage__body">
        Host perlu menyetujui permintaanmu. Boleh tutup halaman ini — kembali kapan saja lewat link
        yang sama. Permintaan yang tidak disetujui dalam 24 jam gugur sendiri.
      </p>
      <button
        className="btn btn--primary btn--block"
        type="button"
        disabled={busy}
        aria-busy={busy}
        onClick={onRefresh}
      >
        {busy ? 'Menyegarkan…' : 'Segarkan status'}
      </button>
      <span className="pill">
        <Handle handle={success.handle} /> · lobi
      </span>
    </Stage>
  );
}
