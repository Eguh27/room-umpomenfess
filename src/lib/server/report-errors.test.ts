import { describe, expect, it } from 'vitest';
import { mapReportError } from './join-errors';

describe('mapReportError', () => {
  it('laporan ganda -> 409', () => {
    expect(mapReportError('ALREADY_REPORTED')).toEqual({
      status: 409,
      body: { error: 'ALREADY_REPORTED' },
    });
  });

  it.each(['REPORT_NOT_ALLOWED', 'USER_SUSPENDED'])('%s -> 403', (code) => {
    expect(mapReportError(code)).toEqual({
      status: 403,
      body: { error: code },
    });
  });

  it('room tidak ditemukan -> 404', () => {
    expect(mapReportError('NOT_FOUND')).toEqual({
      status: 404,
      body: { error: 'NOT_FOUND' },
    });
  });

  it('input tidak valid -> 400', () => {
    expect(mapReportError('INVALID_INPUT')).toEqual({
      status: 400,
      body: { error: 'INVALID_INPUT' },
    });
  });

  it('kode tak dikenal tidak membocorkan detail -> 500', () => {
    expect(mapReportError('SOMETHING_INTERNAL')).toEqual({
      status: 500,
      body: { error: 'SERVER_ERROR' },
    });
  });
});
