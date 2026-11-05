import { describe, expect, it } from 'vitest';
import { mapAdminError } from './join-errors';

describe('mapAdminError', () => {
  it.each(['NOT_ADMIN', 'MFA_REQUIRED'])('%s -> 403', (code) => {
    expect(mapAdminError(code)).toEqual({
      status: 403,
      body: { error: code },
    });
  });

  it('handle dipakai -> 409', () => {
    expect(mapAdminError('HANDLE_TAKEN')).toEqual({
      status: 409,
      body: { error: 'HANDLE_TAKEN' },
    });
  });

  it('handle tidak valid -> 400', () => {
    expect(mapAdminError('HANDLE_INVALID')).toEqual({
      status: 400,
      body: { error: 'HANDLE_INVALID' },
    });
  });

  it('kode tak dikenal tidak membocorkan detail -> 500', () => {
    expect(mapAdminError('SOMETHING_INTERNAL')).toEqual({
      status: 500,
      body: { error: 'SERVER_ERROR' },
    });
  });
});
