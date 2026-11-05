import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getBrowserClient } from '../../lib/supabase/browser';
import { clearSessionCookie, syncSessionCookie } from './sessionCookie';

export default function AuthNav() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const client = getBrowserClient();
    let active = true;

    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      syncSessionCookie(nextSession);
      setSession(nextSession);
    });

    void client.auth.getSession().then(({ data: current }) => {
      if (!active) return;
      syncSessionCookie(current.session);
      setSession(current.session);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    await getBrowserClient().auth.signOut();
    clearSessionCookie();
    setBusy(false);
    window.location.assign('/');
  };

  if (session === undefined) return <span className="auth-nav__placeholder" aria-hidden="true" />;

  if (session === null) {
    return (
      <a className="btn btn--brand btn--sm" href="/login">
        Masuk
      </a>
    );
  }

  return (
    <span className="auth-nav">
      <a className="btn btn--ghost btn--sm" href="/dashboard">
        Dasbor
      </a>
      <button
        className="btn btn--ghost btn--sm"
        type="button"
        disabled={busy}
        onClick={() => void signOut()}
      >
        {busy ? 'Keluar…' : 'Keluar'}
      </button>
    </span>
  );
}
