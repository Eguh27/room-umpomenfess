import { describe, expect, it } from 'vitest';
import { joinRequestSchema } from './schemas';

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
