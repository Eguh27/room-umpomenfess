import { useCallback, useRef, useState, type SyntheticEvent } from 'react';
import TurnstileBox from './TurnstileBox';

export type SubmitPassword = (password: string, turnstileToken: string) => void;

type Props = {
  dev: boolean;
  siteKey: string | undefined;
  busy: boolean;
  formError: string | null;
  onSubmit: SubmitPassword;
  /** Nihil: naik setiap retry supaya widget Turnstile dibuat ulang. */
  widgetNonce: number;
  onWidgetTokenChange: (token: string | null) => void;
};

const PASSWORD_PATTERN = /^[A-Z0-9]{6}$/;

/**
 * Form password room + widget Turnstile. Password dinormalkan huruf besar
 * dan diverifikasi lokal sebelum kirim (TASK: case-insensitive, 6 karakter).
 */
export default function JoinForm({
  dev,
  siteKey,
  busy,
  formError,
  onSubmit,
  widgetNonce,
  onWidgetTokenChange,
}: Props) {
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const tokenRef = useRef<string | null>(null);

  const handleToken = useCallback(
    (token: string | null) => {
      tokenRef.current = token;
      onWidgetTokenChange(token);
    },
    [onWidgetTokenChange],
  );

  const handleSubmit = useCallback(
    (event: SyntheticEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (busy) return;

      const normalized = password.trim().toUpperCase();
      if (!PASSWORD_PATTERN.test(normalized)) {
        setLocalError('Enam karakter — huruf dan angka. Huruf besar-kecil tidak berpengaruh.');
        return;
      }
      setLocalError(null);
      onSubmit(normalized, tokenRef.current ?? '');
    },
    [busy, password, onSubmit],
  );

  const shownError = localError ?? formError;
  const canSubmit = busy || tokenRef.current !== null || (dev && !siteKey);

  return (
    <section className="glass-card stage" aria-labelledby="t-password">
      <h1 id="t-password">Masuk room</h1>
      <p className="stage__sub">Tanyakan passwordnya ke orang yang membagikan link ini.</p>
      <form noValidate onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="pw">Password room</label>
          <input
            className="input input--code"
            id="pw"
            name="password"
            type="text"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
            maxLength={6}
            inputMode="text"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={busy}
          />
          <p className="help">Enam karakter — huruf dan angka yang tidak mirip (tanpa 0/O, 1/I).</p>
        </div>

        {shownError !== null && (
          <div className="error-note" role="alert">
            {shownError}
          </div>
        )}

        <TurnstileBox key={widgetNonce} siteKey={siteKey} dev={dev} onToken={handleToken} />

        <button
          className="btn btn--primary btn--block"
          type="submit"
          disabled={!canSubmit}
          aria-busy={busy}
        >
          {busy ? 'Memeriksa…' : 'Kirim & masuk'}
        </button>
      </form>
      <p className="help">
        Lima password salah dari jaringan yang sama dalam 15 menit membuat percobaan masuk terkunci
        sementara.
      </p>
    </section>
  );
}
