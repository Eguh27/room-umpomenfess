import { useEffect, useRef } from 'react';

type TurnstileRenderOptions = {
  sitekey: string;
  theme: 'light';
  callback: (token: string) => void;
  'expired-callback': () => void;
  'timeout-callback': () => void;
  'error-callback': () => void;
};

type TurnstileApi = {
  render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoad: Promise<void> | null = null;

/** Muat script Turnstile sekali per halaman. */
function loadTurnstile(): Promise<void> {
  scriptLoad ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('TURNSTILE_SCRIPT'));
    document.head.append(s);
  });
  return scriptLoad;
}

type Props = {
  /** PUBLIC_TURNSTILE_SITE_KEY; kosong berarti kunci env belum dipasang. */
  siteKey: string | undefined;
  /** Mode dev: server juga meloloskan tanpa secret, token dummy cukup. */
  dev: boolean;
  onToken: (token: string | null) => void;
};

/**
 * Widget Cloudflare Turnstile. Token memancar lewat onToken;
 * parent harus menganggap token itu sekali pakai dan me-reset komponen ini
 * (ganti key) setiap kali gagal.
 */
export default function TurnstileBox({ siteKey, dev, onToken }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!siteKey) {
      if (dev) {
        // Env kunci belum dipasang — coba dgn server dev (ia meloloskan token
        // saat TURNSTILE_SECRET_KEY kosong). Produksi tetap menutup akses.
        onToken('dev');
        return;
      }
      onToken(null);
      return;
    }
    void loadTurnstile()
      .then(() => {
        if (cancelled || !holder.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(holder.current, {
          sitekey: siteKey,
          theme: 'light',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'timeout-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => {
        if (!cancelled) onToken(null);
      });
    return () => {
      cancelled = true;
      if (widgetId.current !== null && window.turnstile) {
        window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      }
    };
  }, [siteKey, dev, onToken]);

  return (
    <div className="turnstile-ph">
      {siteKey ? (
        <div ref={holder} aria-label="Pengecekan manusia Cloudflare Turnstile" />
      ) : (
        <span>
          {dev
            ? 'Verifikasi manusia: lintas-cepat mode dev (kunci Turnstile belum dipasang).'
            : 'Widget verifikasi belum tersedia — kunci Turnstile belum dipasang pengelola.'}
        </span>
      )}
    </div>
  );
}
