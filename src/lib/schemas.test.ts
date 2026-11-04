import { describe, expect, it } from 'vitest';
import { joinRequestSchema, reportRequestSchema } from './schemas';

const validSlug = 'devroom000000001';

describe('joinRequestSchema', () => {
  const base = { slug: validSlug, turnstileToken: 'tok' };

  it('menerima body tanpa password (room publik)', () => {
    const parsed = joinRequestSchema.parse(base);
    expect(parsed.password).toBeNull();
  });

  it('password kosong dinormalisasi menjadi null', () => {
    const parsed = joinRequestSchema.parse({ ...base, password: '' });
    expect(parsed.password).toBeNull();
  });

  it('password terisi diteruskan apa adanya', () => {
    const parsed = joinRequestSchema.parse({ ...base, password: 'ABC234' });
    expect(parsed.password).toBe('ABC234');
  });

  it('slug di luar pola ditolak', () => {
    expect(joinRequestSchema.safeParse({ ...base, slug: 'short' }).success).toBe(false);
  });

  it('turnstileToken kosong ditolak', () => {
    expect(joinRequestSchema.safeParse({ slug: validSlug, turnstileToken: '' }).success).toBe(
      false,
    );
  });
});

describe('reportRequestSchema', () => {
  const base = { roomId: 'e2100000-0000-4000-8000-000000000001', turnstileToken: 'tok' };

  it.each(['SPAM', 'ABUSE', 'ILLEGAL', 'OTHER'])('alasan %s diterima', (reason) => {
    const parsed = reportRequestSchema.parse({ ...base, reason });
    expect(parsed.reason).toBe(reason);
  });

  it('roomId wajib uuid', () => {
    expect(reportRequestSchema.safeParse({ ...base, roomId: 'bukan-uuid' }).success).toBe(false);
  });

  it('alasan di luar enum ditolak', () => {
    expect(reportRequestSchema.safeParse({ ...base, reason: 'HACK' }).success).toBe(false);
  });
});
