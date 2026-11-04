-- S-21…S-32: verifikasi keamanan sisi database untuk fitur Admin/FYP/public.
-- Sumber: TASK.md bagian 9 (matriks aturan keamanan) baris S-21..S-32.
-- File ini jalur database-nya saja; skrip scripts/security/** milik S (T-61a).

begin;

create extension if not exists pgtap with schema extensions;

create schema test_helpers_t19;
grant usage on schema test_helpers_t19 to authenticated;

-- Identitas lewat GUC JWT (pola test_helpers_t17).
create function test_helpers_t19.act_as(
  p_user uuid,
  p_anonymous boolean default false,
  p_aal text default null
)
returns void
language plpgsql
as $$
begin
  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_user,
      'role', 'authenticated',
      'is_anonymous', p_anonymous,
      'aal', p_aal
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
end;
$$;

create function test_helpers_t19.room_id(p_slug text)
returns uuid
language sql
as $$
  select id from public.rooms where slug = p_slug
$$;

grant execute on function test_helpers_t19.act_as(uuid, boolean, text)
  to authenticated;
grant execute on function test_helpers_t19.room_id(text) to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'e5000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 't19-host@example.com',
    extensions.crypt('hostpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  -- @2: email belum terkonfirmasi (S-31).
  (
    '00000000-0000-0000-0000-000000000000',
    'e5000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 't19-unconf@example.com',
    extensions.crypt('hostpass', extensions.gen_salt('bf')), null,
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e5000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 't19-user2@example.com',
    extensions.crypt('userpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e5000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 't19-user3@example.com',
    extensions.crypt('userpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e5100000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', 't19-anon1@example.com',
    extensions.crypt('anonpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e5100000-0000-4000-8000-000000000006',
    'authenticated', 'authenticated', 't19-anon2@example.com',
    extensions.crypt('anonpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  );

-- @1 = admin platform (S-27/S-28).
update public.profiles set role = 'admin'
where user_id = 'e5000000-0000-4000-8000-000000000001';

-- Room publik LISTED dengan slug deterministik (join_room butuh slug).
insert into public.rooms (
  slug, host_id, name, description, category, approval_required,
  max_guests, idle_timeout_minutes, typing_enabled, visibility,
  listing_status, listed_at, expires_at, delete_at
)
values
  (
    't19a000000000003', 'e5000000-0000-4000-8000-000000000001',
    'S21 Pub A', 'room publik a', 'umum', false, 5, 30, true,
    'PUBLIC', 'LISTED', now(), now() + interval '7 days',
    now() + interval '22 days'
  ),
  (
    't19a000000000004', 'e5000000-0000-4000-8000-000000000003',
    'S21 Pub B', 'room publik b', 'umum', false, 5, 30, true,
    'PUBLIC', 'LISTED', now(), now() + interval '7 days',
    now() + interval '22 days'
  );

-- Room privat milik @1 (S-21/S-23/S-25/S-30) dan @3 (kuota S-31).
with pw as (
  select extensions.crypt('T19PASS', extensions.gen_salt('bf', 10)) as hash
)
insert into public.rooms (
  slug, host_id, name, password_hash, approval_required, max_guests,
  idle_timeout_minutes, typing_enabled, visibility, listing_status,
  expires_at, delete_at
)
select
  v.slug, v.host_id::uuid, v.name, pw.hash, false, 5, 30, true,
  'PRIVATE', 'LISTED', now() + interval '7 days', now() + interval '22 days'
from (values
  ('t19a000000000001', 'e5000000-0000-4000-8000-000000000001', 'S21 Private'),
  ('t19a000000000002', 'e5000000-0000-4000-8000-000000000003', 'S31 Priv B')
) as v(slug, host_id, name)
cross join pw;

-- FYP aktif untuk S-21/S-22/S-25/S-30/S-31; dikembalikan di akhir file.
update public.app_config set value = 'true'::jsonb
where key = 'public_rooms_enabled';

select plan(49);

-- ===== S-21: room privat tidak pernah muncul di list_public_rooms =====

select is_empty(
  $$select f.slug from public.list_public_rooms('ACTIVE', null, 'Private', null, null) f$$,
  'S-21: room privat tidak ter-list meski namanya dicari'
);

select is(
  (select count(*)::int from public.list_public_rooms('ACTIVE', null, 'S21 Pub', null, null)),
  2,
  'S-21: dua room publik kontrol tetap ter-list'
);

select is(
  (
    select count(*)::int
    from public.list_public_rooms('ACTIVE') f
    where f.slug in ('t19a000000000001', 't19a000000000002')
  ),
  0,
  'S-21: slug room privat tak pernah keluar dari FYP'
);

-- ===== S-22: anon hanya membaca kolom whitelist =====

select set_eq(
  $$select jsonb_object_keys(to_jsonb(f))
    from (select * from public.list_public_rooms() limit 1) f$$,
  $$values ('slug'), ('name'), ('description'), ('category'),
           ('approved_count'), ('max_guests'), ('last_activity_at'), ('is_full')$$,
  'S-22: kolom list_public_rooms persis whitelist 8 kolom'
);

select test_helpers_t19.act_as('e5100000-0000-4000-8000-000000000005', true);
select lives_ok(
  $$select f.slug, f.name, f.approved_count, f.is_full
    from public.list_public_rooms() f$$,
  'S-22: anon boleh membaca FYP'
);

select is(
  has_column_privilege('anon', 'public.rooms', 'password_hash', 'SELECT'),
  false,
  'S-22: kolom password_hash tidak terbuka untuk anon'
);

select is(
  has_table_privilege('anon', 'public.messages', 'SELECT'),
  false,
  'S-22: isi chat tidak terbaca anon di luar join'
);

-- ===== S-23: update_room_settings tidak bisa privat → publik =====

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000001', false, null);
select throws_ok(
  $$select public.update_room_settings(
       test_helpers_t19.room_id('t19a000000000001'),
       null, null, null, null, 'PUBLIC'
     )$$,
  'P0001',
  'VISIBILITY_LOCKED',
  'S-23: p_visibility PUBLIC pada room privat menolak'
);

select throws_ok(
  $$select public.update_room_settings(
       test_helpers_t19.room_id('t19a000000000001'),
       null, null, null, null, 'HIDDEN'
     )$$,
  'P0001',
  'INVALID_INPUT',
  'S-23: visibilitas di luar domain ditolak INVALID_INPUT'
);

select lives_ok(
  $$select public.update_room_settings(
       test_helpers_t19.room_id('t19a000000000001'),
       null, null, null, null, null
     )$$,
  'S-23: p_visibility null diterima'
);

select is(
  (
    select visibility
    from public.rooms where slug = 't19a000000000001'
  ),
  'PRIVATE',
  'S-23: room tetap PRIVATE setelah semua percobaan'
);

-- ===== S-24: satu pelapor dihitung sekali; bukan member/login ditolak =====

select test_helpers_t19.act_as('e5100000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$select public.report_room(
       test_helpers_t19.room_id('t19a000000000003'), 'SPAM'
     )$$,
  'P0001',
  'REPORT_NOT_ALLOWED',
  'S-24: anon non-member menolak melapor room publik'
);

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000004', false, null);
select lives_ok(
  $$select public.report_room(
       test_helpers_t19.room_id('t19a000000000003'), 'SPAM'
     )$$,
  'S-24: login non-member boleh melapor room publik'
);

select throws_ok(
  $$select public.report_room(
       test_helpers_t19.room_id('t19a000000000003'), 'ABUSE'
     )$$,
  'P0001',
  'ALREADY_REPORTED',
  'S-24: pelapor sama hanya dihitung sekali'
);

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000001', false, null);
select throws_ok(
  $$select public.report_room(
       test_helpers_t19.room_id('t19a000000000003'), 'SPAM'
     )$$,
  'P0001',
  'REPORT_NOT_ALLOWED',
  'S-24: host menolak melapor room miliknya'
);

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000003', false, null);
select lives_ok(
  $$select public.report_room(
       test_helpers_t19.room_id('t19a000000000003'), 'OTHER'
     )$$,
  'S-24: pelapor unik kedua diterima'
);

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000002', false, null);
select lives_ok(
  $$select public.report_room(
       test_helpers_t19.room_id('t19a000000000003'), 'ILLEGAL'
     )$$,
  'S-24: pelapor unik ketiga mencapai ambang'
);

select is(
  (
    select listing_status = 'HIDDEN' and listed_at is null
    from public.rooms where slug = 't19a000000000003'
  ),
  true,
  'S-24: ambang laporan unik mem-HIDDEN-kan room'
);

-- ===== S-25: join baru ke room HIDDEN/BANNED ditolak =====

update public.rooms
set listing_status = 'HIDDEN', listed_at = null
where slug = 't19a000000000004';

select test_helpers_t19.act_as('e5100000-0000-4000-8000-000000000006', true);
select throws_ok(
  $$select public.join_room(
       'e5100000-0000-4000-8000-000000000006'::uuid,
       true,
       't19a000000000004',
       null,
       repeat('b', 64)
     )$$,
  'P0001',
  'ROOM_HIDDEN',
  'S-25: join baru ke room publik HIDDEN ditolak'
);

update public.rooms set listing_status = 'BANNED'
where slug = 't19a000000000004';

select throws_ok(
  $$select public.join_room(
       'e5100000-0000-4000-8000-000000000006'::uuid,
       true,
       't19a000000000004',
       null,
       repeat('b', 64)
     )$$,
  'P0001',
  'ROOM_BANNED',
  'S-25: join ke room BANNED ditolak'
);

update public.rooms set listing_status = 'LISTED', listed_at = now()
where slug = 't19a000000000004';

-- ===== S-30: satu room aktif untuk anonim =====

select test_helpers_t19.act_as('e5100000-0000-4000-8000-000000000005', true);
select lives_ok(
  $$select public.join_room(
       'e5100000-0000-4000-8000-000000000005'::uuid,
       true,
       't19a000000000001',
       'T19PASS',
       repeat('c', 64)
     )$$,
  'S-30: anon masuk room privat pertama'
);

select throws_ok(
  $$select public.join_room(
       'e5100000-0000-4000-8000-000000000005'::uuid,
       true,
       't19a000000000004',
       null,
       repeat('c', 64)
     )$$,
  'P0001',
  'ONE_ROOM_LIMIT',
  'S-30: room kedua ditolak ONE_ROOM_LIMIT'
);

select lives_ok(
  $$select public.leave_room(test_helpers_t19.room_id('t19a000000000001'))$$,
  'S-30: anon keluar dari room pertama'
);

select lives_ok(
  $$select public.join_room(
       'e5100000-0000-4000-8000-000000000005'::uuid,
       true,
       't19a000000000004',
       null,
       repeat('c', 64)
     )$$,
  'S-30: setelah keluar, anon boleh masuk room berikutnya'
);

-- ===== S-29: tidak ada identifier bersama yang terlihat Host =====

select is(
  (
    select count(*)::int
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'room_members'
      and column_name = 'user_id'
  ),
  0,
  'S-29: room_members tidak menyimpan user_id'
);

select is(
  has_table_privilege('anon', 'public.member_identities', 'SELECT'),
  false,
  'S-29: tabel identitas tak terbaca anon'
);

select is(
  has_table_privilege('authenticated', 'public.member_identities', 'SELECT'),
  false,
  'S-29: tabel identitas tak terbaca authenticated'
);

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000003', false, null);
select is(
  (
    select count(*)::int
    from (select * from public.list_members(
            test_helpers_t19.room_id('t19a000000000004')
          ) limit 1) m
    cross join lateral jsonb_object_keys(to_jsonb(m)) k
    where k = 'user_id'
  ),
  0,
  'S-29: list_members tidak membawa user_id ke Host'
);

-- ===== S-26: user tidak bisa UPDATE profiles (handle/role/tier) =====

select is(
  has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  false,
  'S-26: authenticated tidak punya UPDATE profiles'
);

select is(
  has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  false,
  'S-26: authenticated tidak punya INSERT profiles'
);

set local role authenticated;
select throws_ok(
  $$update public.profiles
    set handle = 'bergerak07', handle_verified = true
    where user_id = 'e5000000-0000-4000-8000-000000000003'$$,
  '42501',
  'permission denied for table profiles',
  'S-26: UPDATE handle lewat REST/SQL ditolak'
);
reset role;

select is(
  (
    select handle = 'bergerak07'
    from public.profiles
    where user_id = 'e5000000-0000-4000-8000-000000000003'
  ),
  false,
  'S-26: handle tidak berubah setelah percobaan'
);

-- ===== S-27: RPC Admin tanpa role admin / tanpa AAL2 =====

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000003', false, 'aal2');
select throws_ok(
  $$select public.admin_list_users(null, null)$$,
  'P0001',
  'NOT_ADMIN',
  'S-27: non-admin dengan AAL2 ditolak NOT_ADMIN'
);

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000001', false, 'aal1');
select throws_ok(
  $$select public.admin_set_tier(
       'e5000000-0000-4000-8000-000000000004'::uuid, 'premium'
     )$$,
  'P0001',
  'MFA_REQUIRED',
  'S-27: admin tanpa AAL2 ditolak MFA_REQUIRED'
);

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000001', true, 'aal2');
select throws_ok(
  $$select public.admin_close_room(
       test_helpers_t19.room_id('t19a000000000002')
     )$$,
  'P0001',
  'NOT_ADMIN',
  'S-27: JWT anonim ditolak meski klaim aal2'
);

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000001', false, 'aal2');
select lives_ok(
  $$select public.admin_set_tier(
       'e5000000-0000-4000-8000-000000000004'::uuid, 'premium'
     )$$,
  'S-27: admin AAL2 penuh boleh memanggil RPC Admin'
);

select is(
  (
    select tier from public.profiles
    where user_id = 'e5000000-0000-4000-8000-000000000004'
  ),
  'premium',
  'S-27: tier berubah lewat jalur resmi'
);

-- ===== S-28: pola handle lewat RPC Admin =====

select throws_ok(
  $$select public.admin_rename_handle(
       'e5000000-0000-4000-8000-000000000003'::uuid,
       'abc123456',
       true
     )$$,
  'P0001',
  'HANDLE_INVALID',
  'S-28: pola 9-acak ditolak HANDLE_INVALID'
);

select throws_ok(
  $$select public.admin_rename_handle(
       'e5000000-0000-4000-8000-000000000003'::uuid,
       'support',
       true
     )$$,
  'P0001',
  'HANDLE_RESERVED',
  'S-28: reserved word ditolak HANDLE_RESERVED'
);

select throws_ok(
  $$select public.admin_rename_handle(
       'e5000000-0000-4000-8000-000000000003'::uuid,
       'senior-host',
       false
     )$$,
  'P0001',
  'HANDLE_INVALID',
  'S-28: tanpa p_verified=true ditolak HANDLE_INVALID'
);

select lives_ok(
  $$select public.admin_rename_handle(
       'e5000000-0000-4000-8000-000000000003'::uuid,
       'host-t19-user2',
       true
     )$$,
  'S-28: rename terverifikasi oleh admin diterima'
);

select is(
  (
    select exists (
      select 1 from public.handle_history
      where user_id = 'e5000000-0000-4000-8000-000000000003'
        and new_handle = 'host-t19-user2'
    )
  ),
  true,
  'S-28: rename tercatat di handle_history'
);

-- ===== S-31: create_room PUBLIC ditolak sesuai kondisi =====

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000002', false, null);
select throws_ok(
  $$select public.create_room(
       'S31 Unconf', 5, false, 30, true, 'PUBLIC', null, 'umum'
     )$$,
  'P0001',
  'EMAIL_NOT_CONFIRMED',
  'S-31: email belum terkonfirmasi ditolak'
);

update public.app_config set value = 'false'::jsonb
where key = 'public_rooms_enabled';

select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000004', false, null);
select throws_ok(
  $$select public.create_room(
       'S31 Flag Off', 5, false, 30, true, 'PUBLIC', null, 'umum'
     )$$,
  'P0001',
  'FEATURE_DISABLED',
  'S-31: flag FYP mati ditolak'
);

update public.app_config set value = 'true'::jsonb
where key = 'public_rooms_enabled';

select lives_ok(
  $$select public.create_room(
       'S31 Pub C', 5, false, 30, true, 'PUBLIC', null, 'umum'
     )$$,
  'S-31: host bersaldo kuota boleh membuat room publik'
);

-- @3 sudah memegang 1 room PUBLIC (t19a000000000004) = kuota tier free (1).
select test_helpers_t19.act_as('e5000000-0000-4000-8000-000000000003', false, null);
select throws_ok(
  $$select public.create_room(
       'S31 Quota', 5, false, 30, true, 'PUBLIC', null, 'umum'
     )$$,
  'P0001',
  'PUBLIC_QUOTA_REACHED',
  'S-31: kuota publik habis ditolak'
);

-- ===== S-32: admin_audit_log tidak bisa dibaca/diubah client =====

select is(
  (
    has_table_privilege('anon', 'public.admin_audit_log', 'SELECT')::int
      + has_table_privilege('authenticated', 'public.admin_audit_log', 'SELECT')::int
      + has_table_privilege('authenticated', 'public.admin_audit_log', 'INSERT')::int
  ),
  0,
  'S-32: client tidak punya grant apa pun pada admin_audit_log'
);

set local role authenticated;
select throws_ok(
  $$select count(*) from public.admin_audit_log$$,
  '42501',
  'permission denied for table admin_audit_log',
  'S-32: membaca audit log ditolak di level kueri'
);

select throws_ok(
  $$delete from public.admin_audit_log$$,
  '42501',
  'permission denied for table admin_audit_log',
  'S-32: menghapus audit log ditolak'
);
reset role;

-- Kembalikan flag agar file lain tidak terpengaruh bila transaksi tidak
-- sempat rollback.
update public.app_config set value = 'false'::jsonb
where key = 'public_rooms_enabled';

reset role;
