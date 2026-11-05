import { describe, expect, it } from 'vitest';
import { mapPublicRoomsError } from './join-errors';

describe('mapPublicRoomsError', () => {
  it('flag FYP mati -> 403', () => {
    expect(mapPublicRoomsError('FEATURE_DISABLED')).toEqual({
      status: 403,
      body: { error: 'FEATURE_DISABLED' },
    });
  });

  it('query tidak valid -> 400', () => {
    expect(mapPublicRoomsError('INVALID_INPUT')).toEqual({
      status: 400,
      body: { error: 'INVALID_INPUT' },
    });
  });

  it('kode tak dikenal tidak membocorkan detail -> 500', () => {
    expect(mapPublicRoomsError('SOMETHING_INTERNAL')).toEqual({
      status: 500,
      body: { error: 'SERVER_ERROR' },
    });
  });
});
