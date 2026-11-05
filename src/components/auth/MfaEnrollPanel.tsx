import { useCallback, useEffect, useState } from 'react';
import { getBrowserClient } from '../../lib/supabase/browser';
import {
  challengeTotp,
  currentSession,
  enrollTotp,
  verifiedTotpFactors,
  type TotpEnrollment,
  type TotpFactor,
} from './authApi';
import { authErrorFor } from './authMessages';
import { syncSessionCookie } from './sessionCookie';
import MfaChallengeForm from './MfaChallengeForm';

type Props = { next: string };
type Status = 'loading' | 'ready' | 'enroll' | 'challenge' | 'active' | 'error';

function QrPanel({ enrollment }: { enrollment: TotpEnrollment }) {
  const src = `data:image/svg+xml;utf8,${encodeURIComponent(enrollment.qrCode)}`;
  return (
    <div className="mfa-enroll">
      <img
        className="mfa-qr"
        src={src}
        alt="Kode QR untuk memindai ke aplikasi autentikator"
        width={180}
        height={180}
      />
      <p className="help">
        Pindai QR ini dengan aplikasi autentikator, atau masukkan kunci manual berikut:
      </p>
      <code className="mfa-secret">{enrollment.secret}</code>
    </div>
  );
}

export default function MfaEnrollPanel({ next }: Props) {
  const [status, setStatus] = useState<Status>('loading');
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const session = await currentSession();
    if (!session) {
      window.location.assign(`/login?next=${encodeURIComponent(`/admin/mfa?next=${next}`)}`);
      return;
    }
    syncSessionCookie(session);

    const { data } = await getBrowserClient().auth.mfa.getAuthenticatorAssuranceLevel();
    if (data?.currentLevel === 'aal2') {
      setStatus('active');
      return;
    }

    const verified = await verifiedTotpFactors();
    if (verified.length > 0) {
      setFactors(verified);
      setStatus('challenge');
      return;
    }
    setStatus('ready');
  }, [next]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEnroll = useCallback(async () => {
    setBusy(true);
    setError(null);
    const result = await enrollTotp();
    setBusy(false);
    if (!result.ok) {
      setError(authErrorFor(result.error));
      setStatus('error');
      return;
    }
    setEnrollment(result.enrollment);
    setStatus('enroll');
  }, []);

  const verify = useCallback(
    async (code: string) => {
      const factorId = enrollment?.factorId ?? factors[0]?.id;
      if (!factorId) {
        setError('Faktor MFA tidak ditemukan. Muat ulang halaman.');
        return;
      }
      setBusy(true);
      setError(null);
      const result = await challengeTotp(factorId, code);
      setBusy(false);
      if (!result.ok) {
        setError(authErrorFor(result.error));
        return;
      }
      window.location.assign(next);
    },
    [enrollment, factors, next],
  );

  if (status === 'loading') {
    return (
      <section className="glass-card auth__card" role="status">
        Memeriksa status MFA…
      </section>
    );
  }

  if (status === 'active') {
    return (
      <section className="glass-card auth__card">
        <span className="badge badge--active">AAL2 AKTIF</span>
        <h2>MFA sudah aktif</h2>
        <p className="auth__sub">
          Sesi ini sudah mencapai AAL2. Kamu bisa membuka konsol Admin atau kembali ke dasbor.
        </p>
        <a className="btn btn--primary btn--block" href={next}>
          Lanjut
        </a>
      </section>
    );
  }

  if (status === 'challenge') {
    return (
      <MfaChallengeForm
        factorName={factors[0]?.name ?? 'Aplikasi autentikator'}
        busy={busy}
        error={error}
        onSubmit={(code) => void verify(code)}
      />
    );
  }

  return (
    <section className="glass-card auth__card">
      <span className="badge badge--pending">WAJIB UNTUK ADMIN</span>
      <h2>Aktifkan MFA</h2>
      <p className="auth__sub">
        Admin platform wajib memakai TOTP sebelum membuka data. Aplikasi autentikator seperti Aegis,
        Google Authenticator, atau 1Password bisa memindai QR di bawah.
      </p>

      {error !== null && (
        <div className="error-note" role="alert">
          {error}
        </div>
      )}

      {status === 'ready' && (
        <button
          className="btn btn--primary btn--block"
          type="button"
          disabled={busy}
          aria-busy={busy}
          onClick={() => void startEnroll()}
        >
          {busy ? 'Menyiapkan…' : 'Mulai pendaftaran MFA'}
        </button>
      )}

      {status === 'enroll' && enrollment !== null && (
        <>
          <QrPanel enrollment={enrollment} />
          <MfaChallengeForm
            bare
            factorName="aplikasi autentikator"
            busy={busy}
            error={error}
            onSubmit={(code) => void verify(code)}
          />
        </>
      )}

      {status === 'error' && (
        <button
          className="btn btn--ghost btn--block"
          type="button"
          disabled={busy}
          onClick={() => void startEnroll()}
        >
          Coba lagi
        </button>
      )}
    </section>
  );
}
