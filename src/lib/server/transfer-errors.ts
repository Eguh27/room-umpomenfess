import type { JoinErrorMapping } from './join-errors';

/**
 * Kode error RPC kode lanjut (migrasi 0013) dan status HTTP-nya.
 * `CODE_INVALID` menyatukan tidak-ada/kedaluwarsa/terpakai/dicabut supaya
 * client tidak bisa memakai respons sebagai oracle status kode.
 */
const TRANSFER_CODE_STATUS: Record<string, number> = {
  CODE_INVALID: 404,
  IDENTITY_IN_USE: 409,
  SAME_IDENTITY: 400,
  NOT_ANONYMOUS: 403,
  NOT_MEMBER: 403,
  RATE_LIMITED: 429,
  INVALID_INPUT: 400,
  UNAUTHORIZED: 401,
};

/** Memetakan kode error RPC kode lanjut ke respons HTTP. */
export function mapTransferError(code: string): JoinErrorMapping {
  const status = TRANSFER_CODE_STATUS[code];
  if (status !== undefined) {
    return { status, body: { error: code } };
  }
  // Kode tak dikenal tidak membocorkan detail internal.
  return { status: 500, body: { error: 'SERVER_ERROR' } };
}
