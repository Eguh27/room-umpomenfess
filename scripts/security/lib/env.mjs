import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** Parser sederhana untuk .env/.env.local; tidak menimpa env proses. */
function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, 'utf8');
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} belum diset`);
  return value;
}

export function loadConfig() {
  const envFile = process.env.SECURITY_ENV_FILE || resolve(ROOT, '.env.local');
  loadDotEnv(envFile);

  const url = (process.env.SECURITY_BASE_URL || required('PUBLIC_SUPABASE_URL')).replace(
    /\/+$/,
    '',
  );
  const anonKey = process.env.SECURITY_ANON_KEY || required('PUBLIC_SUPABASE_ANON_KEY');
  const serviceKey = process.env.SECURITY_SERVICE_ROLE_KEY || required('SUPABASE_SERVICE_ROLE_KEY');
  const ipHashSalt = process.env.IP_HASH_SALT || '';

  const isLocal = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i.test(url);
  if (!isLocal && process.env.ALLOW_REMOTE_SECURITY_TESTS !== '1') {
    throw new Error(
      'Script keamanan menolak URL non-lokal. Set ALLOW_REMOTE_SECURITY_TESTS=1 hanya untuk lingkungan uji yang disetujui.',
    );
  }

  return { url, anonKey, serviceKey, ipHashSalt, envFile, isLocal };
}
