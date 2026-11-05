import { describe, expect, it } from 'vitest';
import {
  adminCreateUserSchema,
  joinRequestSchema,
  publicRoomsQuerySchema,
  reportRequestSchema,
} from './schemas';

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

describe('publicRoomsQuerySchema', () => {
  it('default: sort ACTIVE, limit 20, tanpa filter', () => {
    const parsed = publicRoomsQuerySchema.parse({});
    expect(parsed).toEqual({ sort: 'ACTIVE', category: null, q: null, cursor: null, limit: 20 });
  });

  it('limit dari query string dikonversi ke angka', () => {
    expect(publicRoomsQuerySchema.parse({ limit: '10' }).limit).toBe(10);
  });

  it.each(['0', '51', 'abc'])('limit %s ditolak', (limit) => {
    expect(publicRoomsQuerySchema.safeParse({ limit }).success).toBe(false);
  });

  it('sort di luar enum ditolak', () => {
    expect(publicRoomsQuerySchema.safeParse({ sort: 'POPULAR' }).success).toBe(false);
  });

  it('kursor wajib pola slug', () => {
    expect(publicRoomsQuerySchema.safeParse({ cursor: 'xx' }).success).toBe(false);
    expect(publicRoomsQuerySchema.parse({ cursor: validSlug }).cursor).toBe(validSlug);
  });

  it('q/kategori kosong dinormalisasi ke null', () => {
    const parsed = publicRoomsQuerySchema.parse({ q: '  ', category: '' });
    expect(parsed.q).toBeNull();
    expect(parsed.category).toBeNull();
  });
});

describe('adminCreateUserSchema', () => {
  const base = { email: 'Org@Example.com', handle: 'org-keamanan' };

  it('email dilowercase, handle dipertahankan', () => {
    const parsed = adminCreateUserSchema.parse(base);
    expect(parsed.email).toBe('org@example.com');
    expect(parsed.handle).toBe('org-keamanan');
  });

  it.each(['abcdefghi', 'ab', 'org keamanan!', 'org_keamanan#'])(
    'handle %s ditolak',
    (handle) => {
      expect(adminCreateUserSchema.safeParse({ ...base, handle }).success).toBe(false);
    },
  );

  it('email tidak valid ditolak', () => {
    expect(adminCreateUserSchema.safeParse({ ...base, email: 'bukan-email' }).success).toBe(false);
  });
});
