import { useState, type SyntheticEvent } from 'react';

type Props = {
  factorName: string;
  busy: boolean;
  error: string | null;
  bare?: boolean;
  onSubmit: (code: string) => void;
};

const CODE_PATTERN = /^\d{6}$/;

function CodeForm({ busy, error, onSubmit }: Omit<Props, 'factorName' | 'bare'>) {
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;

    const normalized = code.replace(/\s/g, '');
    if (!CODE_PATTERN.test(normalized)) {
      setLocalError('Masukkan enam angka dari aplikasi autentikator.');
      return;
    }
    setLocalError(null);
    onSubmit(normalized);
  };

  const shownError = localError ?? error;

  return (
    <form noValidate onSubmit={submit}>
      <div className="field">
        <label htmlFor="mfa-code">Kode TOTP</label>
        <input
          className="input input--code"
          id="mfa-code"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          value={code}
          onInput={(event) => setCode(event.currentTarget.value)}
          disabled={busy}
          required
        />
      </div>

      {shownError !== null && (
        <div className="error-note" role="alert">
          {shownError}
        </div>
      )}

      <button
        className="btn btn--primary btn--block"
        type="submit"
        disabled={busy}
        aria-busy={busy}
      >
        {busy ? 'Memeriksa kode…' : 'Verifikasi'}
      </button>
    </form>
  );
}

export default function MfaChallengeForm({
  factorName,
  busy,
  error,
  bare = false,
  onSubmit,
}: Props) {
  if (bare) return <CodeForm busy={busy} error={error} onSubmit={onSubmit} />;

  return (
    <section className="glass-card auth__card" aria-labelledby="mfa-title">
      <span className="badge badge--active">MFA</span>
      <h2 id="mfa-title">Verifikasi dua langkah</h2>
      <p className="auth__sub">
        Masukkan kode enam angka dari <strong>{factorName}</strong>. Kode berganti setiap beberapa
        detik.
      </p>

      <CodeForm busy={busy} error={error} onSubmit={onSubmit} />
      <p className="help">
        Jangan bagikan kode ini. Admin platform wajib MFA sebelum membuka data.
      </p>
    </section>
  );
}
