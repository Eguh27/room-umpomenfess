import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getBrowserClient } from '../../lib/supabase/browser';
import { destinationAfterAuth } from './authApi';
import { authErrorFor } from './authMessages';
import { syncSessionCookie } from './sessionCookie';

type Props = { next: string };

type CallbackState = { kind: 'working' } | { kind: 'error'; message: string };

function readCallback(): {
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  error: string | null;
} {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  return {
    accessToken: hash.get('access_token'),
    refreshToken: hash.get('refresh_token'),
    code: query.get('code'),
    // Supabase bisa mengirim error di query (PKCE) maupun hash (implicit).
    error:
      query.get('error_description') ??
      query.get('error') ??
      hash.get('error_description') ??
      hash.get('error'),
  };
}

export default function AuthCallback({ next }: Props) {
  const [state, setState] = useState<CallbackState>({ kind: 'working' });

  useEffect(() => {
    let alive = true;

    void (async () => {
      const callback = readCallback();
      // Jangan biarkan token tertinggal di address bar atau riwayat browser.
      window.history.replaceState(null, '', window.location.pathname);

      if (callback.error) {
        if (alive)
          setState({
            kind: 'error',
            message: 'Tautan konfirmasi tidak valid atau sudah kedaluwarsa.',
          });
        return;
      }

      const client = getBrowserClient();
      let session: Session | null;

      if (callback.accessToken && callback.refreshToken) {
        const { data, error } = await client.auth.setSession({
          access_token: callback.accessToken,
          refresh_token: callback.refreshToken,
        });
        if (error) {
          if (alive) setState({ kind: 'error', message: authErrorFor(error) });
          return;
        }
        session = data.session;
      } else if (callback.code) {
        const { data, error } = await client.auth.exchangeCodeForSession(callback.code);
        if (error) {
          if (alive) setState({ kind: 'error', message: authErrorFor(error) });
          return;
        }
        session = data.session;
      } else {
        const { data } = await client.auth.getSession();
        session = data.session;
      }

      if (!alive) return;
      if (!session) {
        setState({ kind: 'error', message: 'Sesi konfirmasi tidak ditemukan. Coba masuk lagi.' });
        return;
      }

      syncSessionCookie(session);
      const destination = await destinationAfterAuth(next);
      if (destination.kind === 'mfa') {
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
        return;
      }
      window.location.assign(destination.href);
    })();

    return () => {
      alive = false;
    };
  }, [next]);

  return (
    <section className="glass-card auth__card" aria-live="polite">
      {state.kind === 'working' ? (
        <>
          <span className="badge badge--pending">KONFIRMASI</span>
          <h2>Membuka sesi…</h2>
          <p className="auth__sub">Tunggu sebentar, kami sedang memeriksa tautan email.</p>
        </>
      ) : (
        <>
          <span className="badge badge--danger">GAGAL</span>
          <h2>Konfirmasi belum berhasil</h2>
          <p className="error-note" role="alert">
            {state.message}
          </p>
          <a className="btn btn--primary btn--block" href="/login">
            Kembali ke halaman masuk
          </a>
        </>
      )}
    </section>
  );
}
