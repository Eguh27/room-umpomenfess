/**
 * CSP per dokumen (T-22).
 * Sumber tunggal agar identik antara dev dan produksi: vercel.json tetap menangani header
 * lain (Referrer-Policy, X-Frame-Options, dst.) — CSP sengaja TIDAK ada di sana supaya
 * tidak muncul dua kebijakan yang harus saling mempersempit.
 *
 * Izin: Turnstile memuat skrip + iframe dari challenges.cloudflare.com; data REST lewat
 * https://*.supabase.co dan Realtime lewat wss://*.supabase.co (TASK bagian 7).
 * Origin lokal Supabase dev ikut dikabulkan agar pratinjau dev tidak melanggar.
 *
 * Dirender sebagai teks biasa di semua respons SSR — tidak ada token user di nilai ini.
 */

import { PUBLIC_SUPABASE_URL } from 'astro:env/client';
import type { MiddlewareHandler } from 'astro';

const isDev = import.meta.env.DEV;

/** Origin Supabase sesuai env: kong lokal di dev, proyek hosted `.supabase.co` di prod. */
const supabaseOrigin = new URL(PUBLIC_SUPABASE_URL).origin;
/** Realtime memakai skema ws/wss di host yang sama. */
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, 'ws');

const CONNECT_SRC_BASE =
  "'self' https://*.supabase.co wss://*.supabase.co https://challenges.cloudflare.com";

const CspParts = {
  dev: {
    // Vite dev memakai inline script/eval untuk HMR; dev bukan gerbang keamanan.
    'script-src': "'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
    'connect-src': `${CONNECT_SRC_BASE} ${supabaseOrigin} ${supabaseWsOrigin} ws: http://127.0.0.1:4321 ws://127.0.0.1:4321`,
  },
  prod: {
    'script-src': "'self' https://challenges.cloudflare.com",
    'connect-src': CONNECT_SRC_BASE,
  },
};

const cspParts = isDev ? CspParts.dev : CspParts.prod;

const CSP = [
  "default-src 'self'",
  `script-src ${cspParts['script-src']}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data:",
  "font-src 'self' https://fonts.gstatic.com",
  `connect-src ${cspParts['connect-src']}`,
  'frame-src https://challenges.cloudflare.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ');

export const onRequest: MiddlewareHandler = async (_context, next) => {
  const response = await next();
  response.headers.set('Content-Security-Policy', CSP);
  return response;
};
