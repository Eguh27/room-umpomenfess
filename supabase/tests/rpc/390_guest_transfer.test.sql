begin;

create extension if not exists pgtap with schema extensions;

select plan(28);

-- ---------------------------------------------------------------------------
-- Data uji: host, akun login, dua identitas anonim lama, tiga anonim baru.
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'f0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 't390-host@example.com',
    extensions.crypt('hostpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 't390-login@example.com',
    extensions.crypt('loginpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f1000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"anonymous","providers":[]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f1000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"anonymous","providers":[]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f2000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"anonymous","providers":[]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f2000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"anonymous","providers":[]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'f2000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"anonymous","providers":[]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  );

with pw as (
  select extensions.crypt('ABC234', extensions.gen_salt('bf', 10)) as hash
)
insert into public.rooms (
  slug, host_id, name, password_hash, approval_required, max_guests,
  idle_timeout_minutes, typing_enabled, visibility, listing_status,
  expires_at, delete_at
)
select
  v.slug, 'f0000000-0000-4000-8000-000000000001', v.name, pw.hash,
  false, 5, 30, false, 'PRIVATE', 'LISTED',
  now() + interval '7 days', now() + interval '22 days'
from (values
  ('t390000000000001', 'Transfer A'),
  ('t390000000000002', 'Transfer B')
) as v(slug, name)
cross join pw;

-- oldA di room 1, oldB dan new2 di room 2.
create temporary table test_join_t390 (
  key text primary key,
  member_id uuid not null,
  handle text not null
) on commit drop;

insert into test_join_t390
select 'oldA', member_id, handle
from public.join_room(
  'f1000000-0000-4000-8000-000000000001', true,
  't390000000000001', 'ABC234', repeat('a', 64)
);

insert into test_join_t390
select 'oldB', member_id, handle
from public.join_room(
  'f1000000-0000-4000-8000-000000000002', true,
  't390000000000002', 'ABC234', repeat('b', 64)
);

insert into test_join_t390
select 'new2', member_id, handle
from public.join_room(
  'f2000000-0000-4000-8000-000000000002', true,
  't390000000000002', 'ABC234', repeat('c', 64)
);

-- ---------------------------------------------------------------------------
-- Penerbitan kode.
-- ---------------------------------------------------------------------------
select ok(
  public.issue_guest_transfer_code(
    'f1000000-0000-4000-8000-000000000001', repeat('1', 64), 86400
  ) is not null,
  'kode lanjut terbit untuk anonim dengan keanggotaan APPROVED'
);

select is(
  (
    select count(*)::int
    from public.guest_transfer_codes
    where user_id = 'f1000000-0000-4000-8000-000000000001'
      and used_at is null
      and revoked_at is null
  ),
  1,
  'hanya satu kode aktif per identitas'
);

-- Kode kedua mencabut kode pertama.
select ok(
  public.issue_guest_transfer_code(
    'f1000000-0000-4000-8000-000000000001', repeat('3', 64), 86400
  ) is not null,
  'kode pengganti terbit'
);

select is(
  (
    select revoked_at is not null
    from public.guest_transfer_codes
    where code_hash = repeat('1', 64)
  ),
  true,
  'kode lama dicabut saat kode baru terbit'
);

select throws_ok(
  $$select * from public.adopt_guest_identity(
      repeat('1', 64), 'f2000000-0000-4000-8000-000000000001'
    )$$,
  'P0001', 'CODE_INVALID',
  'kode yang dicabut tidak bisa ditukar'
);

-- ---------------------------------------------------------------------------
-- Redeem sukses.
-- ---------------------------------------------------------------------------
create temporary table test_adopt_t390 (
  old_user_id uuid not null,
  slug text not null
) on commit drop;

insert into test_adopt_t390
select old_user_id, slug
from public.adopt_guest_identity(
  repeat('3', 64), 'f2000000-0000-4000-8000-000000000001'
);

select is(
  (select count(*)::int from test_adopt_t390),
  1,
  'adopt mengembalikan satu baris room'
);

select is(
  (select old_user_id from test_adopt_t390),
  'f1000000-0000-4000-8000-000000000001'::uuid,
  'old_user_id lama dikembalikan untuk pembersihan'
);

select is(
  (select slug from test_adopt_t390),
  't390000000000001',
  'slug room hasil adopsi benar'
);

select is(
  (
    select count(*)::int
    from public.member_identities
    where user_id = 'f1000000-0000-4000-8000-000000000001'
  ),
  0,
  'identitas lama tidak lagi punya keanggotaan'
);

select is(
  (
    select count(*)::int
    from public.member_identities
    where user_id = 'f2000000-0000-4000-8000-000000000001'
  ),
  1,
  'identitas baru menerima keanggotaan'
);

select is(
  (
    select m.handle
    from public.member_identities mi
    join public.room_members m on m.id = mi.member_id
    where mi.user_id = 'f2000000-0000-4000-8000-000000000001'
  ),
  (select handle from test_join_t390 where key = 'oldA'),
  'handle di room tetap sama setelah pindah perangkat'
);

select is(
  (
    select m.status::text
    from public.member_identities mi
    join public.room_members m on m.id = mi.member_id
    where mi.user_id = 'f2000000-0000-4000-8000-000000000001'
  ),
  'APPROVED',
  'status keanggotaan tetap APPROVED'
);

select is(
  (
    select used_by
    from public.guest_transfer_codes
    where code_hash = repeat('3', 64)
  ),
  'f2000000-0000-4000-8000-000000000001'::uuid,
  'kode ditandai terpakai oleh identitas baru'
);

select throws_ok(
  $$select * from public.adopt_guest_identity(
      repeat('3', 64), 'f2000000-0000-4000-8000-000000000001'
    )$$,
  'P0001', 'CODE_INVALID',
  'kode yang sudah dipakai tidak bisa diulang'
);

-- ---------------------------------------------------------------------------
-- Penolakan.
-- ---------------------------------------------------------------------------
select ok(
  public.issue_guest_transfer_code(
    'f1000000-0000-4000-8000-000000000002', repeat('2', 64), 86400
  ) is not null,
  'kode untuk identitas kedua terbit'
);

select throws_ok(
  $$select * from public.adopt_guest_identity(
      repeat('2', 64), 'f1000000-0000-4000-8000-000000000002'
    )$$,
  'P0001', 'SAME_IDENTITY',
  'identitas tidak bisa memindahkan ke dirinya sendiri'
);

select throws_ok(
  $$select * from public.adopt_guest_identity(
      repeat('2', 64), 'f2000000-0000-4000-8000-000000000002'
    )$$,
  'P0001', 'IDENTITY_IN_USE',
  'identitas baru yang sudah punya keanggotaan ditolak'
);

select throws_ok(
  $$select * from public.adopt_guest_identity(
      repeat('2', 64), 'f0000000-0000-4000-8000-000000000002'
    )$$,
  'P0001', 'NOT_ANONYMOUS',
  'akun login tidak bisa memakai kode lanjut'
);

select throws_ok(
  $$select public.issue_guest_transfer_code(
      'f0000000-0000-4000-8000-000000000002', repeat('a', 64), 86400
    )$$,
  'P0001', 'NOT_ANONYMOUS',
  'kode tidak terbit untuk akun login'
);

select throws_ok(
  $$select public.issue_guest_transfer_code(
      'f2000000-0000-4000-8000-000000000003', repeat('a', 64), 86400
    )$$,
  'P0001', 'NOT_MEMBER',
  'anonim tanpa keanggotaan APPROVED tidak boleh membuat kode'
);

insert into public.guest_transfer_codes (code_hash, user_id, created_at, expires_at)
values (
  repeat('4', 64),
  'f2000000-0000-4000-8000-000000000003',
  now() - interval '2 days',
  now() - interval '1 day'
);

select throws_ok(
  $$select * from public.adopt_guest_identity(
      repeat('4', 64), 'f2000000-0000-4000-8000-000000000001'
    )$$,
  'P0001', 'CODE_INVALID',
  'kode kedaluwarsa ditolak'
);

select throws_ok(
  $$select * from public.adopt_guest_identity(
      repeat('9', 64), 'f2000000-0000-4000-8000-000000000001'
    )$$,
  'P0001', 'CODE_INVALID',
  'kode tidak dikenal ditolak'
);

select throws_ok(
  $$select * from public.adopt_guest_identity(
      'bukan-hash', 'f2000000-0000-4000-8000-000000000001'
    )$$,
  'P0001', 'INVALID_INPUT',
  'format hash tidak valid ditolak'
);

select throws_ok(
  $$select public.issue_guest_transfer_code(
      'f1000000-0000-4000-8000-000000000002', repeat('a', 64), 10
    )$$,
  'P0001', 'INVALID_INPUT',
  'TTL terlalu pendek ditolak'
);

-- ---------------------------------------------------------------------------
-- Grant dan RLS.
-- ---------------------------------------------------------------------------
set local role authenticated;

select throws_ok(
  $$select public.issue_guest_transfer_code(
      'f1000000-0000-4000-8000-000000000002', repeat('a', 64), 86400
    )$$,
  '42501', null,
  'authenticated tidak bisa menerbitkan kode'
);

reset role;
set local role anon;

select throws_ok(
  $$select * from public.adopt_guest_identity(
      repeat('a', 64), 'f2000000-0000-4000-8000-000000000003'
    )$$,
  '42501', null,
  'anon tidak bisa menukar kode'
);

reset role;
set local role authenticated;

select throws_ok(
  $$select * from public.guest_transfer_codes$$,
  '42501', null,
  'tabel kode tidak terbaca oleh authenticated'
);

reset role;

select throws_ok(
  $$select public.issue_guest_transfer_code(
      'f1000000-0000-4000-8000-000000000001', repeat('a', 64), 86400
    )$$,
  'P0001', 'NOT_MEMBER',
  'identitas lama tanpa keanggotaan tidak bisa membuat kode baru'
);
