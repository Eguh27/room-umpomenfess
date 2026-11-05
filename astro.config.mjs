// @ts-check
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, envField } from 'astro/config';
import vercel from '@astrojs/vercel';
import react from '@astrojs/react';

// REQUEST (F, T-51, 2026-11-05): node_modules di mesin pengembangan ini dipindah
// ke tmpfs dan di-symlink karena partisi /mnt/shared ber-NTFS3 (melarang ':' pada
// nama folder, sementara astro/vite menulis folder virtual `node_modules/astro:…`).
// Vite menolak menyajikan realpath di luar root saat dev (403 /@fs) — blok di bawah
// mengizinkan target symlink BILA ada. Di mesin tanpa symlink, realpath === dir
// sendiri sehingga tidak ada yang ditambahkan; produksi tidak terpengaruh
// (server.fs hanya dipakai dev server).
const devFsAllow = (() => {
  try {
    const real = realpathSync('node_modules');
    return real === resolve('node_modules') ? [] : [real];
  } catch {
    return [];
  }
})();

// SSR di Vercel. Rahasia server HANYA lewat astro:env (access: 'secret', context: 'server').
// Jangan pernah memakai awalan PUBLIC_ untuk service role key atau secret lain.
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  security: { checkOrigin: true },
  vite: { server: { fs: { allow: ['.', ...devFsAllow] } } },
  env: {
    schema: {
      PUBLIC_SUPABASE_URL: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_SUPABASE_ANON_KEY: envField.string({ context: 'client', access: 'public' }),
      PUBLIC_TURNSTILE_SITE_KEY: envField.string({ context: 'client', access: 'public' }),
      SUPABASE_SERVICE_ROLE_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      TURNSTILE_SECRET_KEY: envField.string({
        context: 'server',
        access: 'secret',
        optional: true,
      }),
      IP_HASH_SALT: envField.string({ context: 'server', access: 'secret', optional: true }),
    },
  },
});
