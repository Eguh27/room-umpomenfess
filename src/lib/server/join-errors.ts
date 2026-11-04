export type JoinErrorBody = {
  error: string;
  retryAfter?: number;
};

export type JoinErrorMapping = {
  status: number;
  body: JoinErrorBody;
  headers?: Record<string, string>;
};

const RETRYABLE_CODES = new Set(['LOCKED', 'ROOM_COOLDOWN', 'RATE_LIMITED']);

const FORBIDDEN_CODES = new Set([
  'ROOM_FULL',
  'MAX_ROOMS_PER_GUEST',
  'KICKED',
  'REJECTED',
  'ROOM_CLOSED',
  'FEATURE_DISABLED',
  'USER_SUSPENDED',
]);

const NOT_FOUND_CODES = new Set(['ROOM_NOT_FOUND', 'ROOM_HIDDEN', 'ROOM_BANNED']);

/** Kode error RPC report_room (migrasi 0012) dan status HTTP-nya. */
const REPORT_CODE_STATUS: Record<string, number> = {
  ALREADY_REPORTED: 409,
  REPORT_NOT_ALLOWED: 403,
  USER_SUSPENDED: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
};

/** Memetakan kode error RPC report_room ke respons HTTP. */
export function mapReportError(code: string): JoinErrorMapping {
  const status = REPORT_CODE_STATUS[code];
  if (status !== undefined) {
    return { status, body: { error: code } };
  }
  // Kode tak dikenal tidak membocorkan detail internal.
  return { status: 500, body: { error: 'SERVER_ERROR' } };
}

/** DETAIL dari Postgres berupa JSON, mis. {"retry_after":600}. */
export function parseRetryAfter(details: string | null | undefined): number | null {
  if (!details) return null;
  try {
    const parsed: unknown = JSON.parse(details);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const value = (parsed as { retry_after?: unknown }).retry_after;
    const seconds = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return Math.ceil(seconds);
  } catch {
    return null;
  }
}

/** Memetakan kode error RPC join_room ke respons HTTP. */
export function mapJoinError(
  code: string,
  details?: string | null,
): JoinErrorMapping {
  if (code === 'WRONG_PASSWORD') {
    return { status: 401, body: { error: code } };
  }

  if (RETRYABLE_CODES.has(code)) {
    const retryAfter = parseRetryAfter(details);
    return {
      status: 429,
      body: retryAfter ? { error: code, retryAfter } : { error: code },
      headers: retryAfter ? { 'retry-after': String(retryAfter) } : undefined,
    };
  }

  if (FORBIDDEN_CODES.has(code)) {
    return { status: 403, body: { error: code } };
  }

  if (NOT_FOUND_CODES.has(code)) {
    return { status: 404, body: { error: code } };
  }

  if (code === 'ONE_ROOM_LIMIT') {
    return { status: 409, body: { error: code } };
  }

  if (code === 'INVALID_INPUT') {
    return { status: 400, body: { error: code } };
  }

  // Jangan bocorkan detail internal ke client.
  return { status: 500, body: { error: 'SERVER_ERROR' } };
}
