begin;

create extension if not exists pgtap with schema extensions;

-- Room publik dari seed dev (devpub%) menggeser hitungan agregat laporan;
-- file tes ini wajib deterministik terhadap isi seed.
delete from public.rooms where slug like 'devpub%';

-- Helper JWT untuk simulasi sesi Admin/Authenticated/AAL2/tanpa sesi.
-- RPC Admin SECURITY DEFINER: identitas hanya dari GUC JWT, jadi semua
-- pemanggilan cukup memakai GUC di atas role koneksi; hak EXECUTE tetap
-- diuji lewat pg_catalog di bagian akhir.
create schema test_helpers_t17;
grant usage on schema test_helpers_t17 to authenticated;

create function test_helpers_t17.act_as(
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
    json_strip_nulls(
      json_build_object(
        'sub', p_user,
        'role', 'authenticated',
        'is_anonymous', p_anonymous,
        'aal', p_aal
      )
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end;
$$;

create function test_helpers_t17.act_clear()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
end;
$$;

grant execute on function test_helpers_t17.act_as(uuid, boolean, text) to authenticated;
grant execute on function test_helpers_t17.act_clear() to authenticated;

-- Fixtures: 3 akun login (1 admin, dibuat trigger) + 3 anonim.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'e2100000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 't17-admin@example.com',
    extensions.crypt('adminpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '2020-06-01'::timestamptz, now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e2100000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 't17-user2@example.com',
    extensions.crypt('userpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '2021-01-01'::timestamptz, now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e2100000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 't17-user3@example.com',
    extensions.crypt('userpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    '2022-01-01'::timestamptz, now(), false
  );

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000',
  ('e2200000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', null, null, null,
  '{"provider":"anonymous","providers":[]}'::jsonb, '{}'::jsonb,
  now(), now(), true
from generate_series(5, 7) as n;

update public.profiles
set role = 'admin'
where user_id = 'e2100000-0000-4000-8000-000000000001';

-- created_at profil eksplisit agar paginasi keyset deterministik.
update public.profiles
set created_at = '2020-06-01'::timestamptz
where user_id = 'e2100000-0000-4000-8000-000000000001';

update public.profiles
set created_at = '2021-01-01'::timestamptz
where user_id = 'e2100000-0000-4000-8000-000000000002';

update public.profiles
set created_at = '2022-01-01'::timestamptz
where user_id = 'e2100000-0000-4000-8000-000000000003';

-- Rooms: E akan ditutup admin, B sudah tutup, lainnya aktif.
with pw as (
  select extensions.crypt('ABC234', extensions.gen_salt('bf', 10)) as hash
)
insert into public.rooms (
  slug, host_id, name, password_hash, approval_required, max_guests,
  idle_timeout_minutes, typing_enabled, visibility, listing_status,
  listed_at, expires_at, delete_at, closed_at
)
select
  v.slug, v.host_id::uuid, v.name,
  case when v.visibility = 'PRIVATE' then pw.hash end,
  false, 10, 30, true, v.visibility, v.listing,
  case when v.visibility = 'PRIVATE' then null else now() end,
  now() + interval '7 days', now() + interval '22 days',
  case when v.closed then now() - interval '1 day' end
from (values
  ('t17a000000000001', 'e2100000-0000-4000-8000-000000000001', 'Admin Host', 'PRIVATE', 'HIDDEN', false),
  ('t17a000000000002', 'e2100000-0000-4000-8000-000000000001', 'Closed Home', 'PRIVATE', 'HIDDEN', true),
  ('t17a000000000003', 'e2100000-0000-4000-8000-000000000001', 'Reported Publik', 'PUBLIC', 'LISTED', false),
  ('t17a000000000004', 'e2100000-0000-4000-8000-000000000001', 'Listing Publik', 'PUBLIC', 'HIDDEN', false),
  ('t17a000000000005', 'e2100000-0000-4000-8000-000000000001', 'Close Publik', 'PUBLIC', 'LISTED', false),
  ('t17a000000000006', 'e2100000-0000-4000-8000-000000000001', 'Private Stay', 'PRIVATE', 'HIDDEN', false)
) as v(slug, host_id, name, visibility, listing, closed)
cross join pw;

-- member user2 di room A (aktif) dan room B (tutup); user3 di room C (aktif).
insert into public.room_members (room_id, handle, handle_verified, status, password_version, status_changed_at)
select
  r.id, p.handle, p.handle_verified, v.status::public.member_status, r.password_version, now()
from (values
  ('t17a000000000001', 'e2100000-0000-4000-8000-000000000002'::uuid, 'APPROVED'),
  ('t17a000000000002', 'e2100000-0000-4000-8000-000000000002'::uuid, 'LEFT'),
  ('t17a000000000003', 'e2100000-0000-4000-8000-000000000003'::uuid, 'APPROVED')
) as v(slug, uid, status)
join public.rooms r on r.slug = v.slug
join public.profiles p on p.user_id = v.uid;

insert into public.member_identities (member_id, room_id, user_id)
select m.id, r.id, src.uid
from (values
  ('t17a000000000001', 'e2100000-0000-4000-8000-000000000002'::uuid),
  ('t17a000000000002', 'e2100000-0000-4000-8000-000000000002'::uuid),
  ('t17a000000000003', 'e2100000-0000-4000-8000-000000000003'::uuid)
) as src(slug, uid)
join public.rooms r on r.slug = src.slug
join public.profiles p on p.user_id = src.uid
join public.room_members m
  on m.room_id = r.id
  and m.handle = p.handle;

-- Laporan dev (report_room baru ada di T-18): room C 3 pelapor unik,
-- room A 1 laporan; urutan insert menetapkan rentang id.
insert into public.room_reports (room_id, reporter_user_id, reason)
select r.id, v.reporter, v.reason
from (values
  ('t17a000000000001', 'e2200000-0000-4000-8000-000000000005'::uuid, 'SPAM'),
  ('t17a000000000003', 'e2200000-0000-4000-8000-000000000005'::uuid, 'SPAM'),
  ('t17a000000000003', 'e2200000-0000-4000-8000-000000000006'::uuid, 'ILLEGAL'),
  ('t17a000000000003', 'e2100000-0000-4000-8000-000000000003'::uuid, 'OTHER')
) as v(slug, reporter, reason)
join public.rooms r on r.slug = v.slug;

-- Anchor untuk uji idempotensi close_room.
create temporary table test_close_t17 (closed_at timestamptz) on commit drop;

select plan(84);

-- ---------------------------------------------------------------------------
-- S-27: gate admin pada setiap RPC.
-- ---------------------------------------------------------------------------

-- User biasa.
select test_helpers_t17.act_as('e2100000-0000-4000-8000-000000000002');

select throws_ok(
  $$select * from public.admin_set_tier(
    'e2100000-0000-4000-8000-000000000002', 'premium')$$,
  'P0001', 'NOT_ADMIN',
  'set_tier oleh user biasa -> NOT_ADMIN'
);

-- User biasa untuk enam RPC lain.
select test_helpers_t17.act_as('e2100000-0000-4000-8000-000000000003');

select throws_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000002', 'fresh.handle', true)$$,
  'P0001', 'NOT_ADMIN',
  'rename_handle oleh user biasa -> NOT_ADMIN'
);

select throws_ok(
  $$select * from public.admin_suspend_user(
    'e2100000-0000-4000-8000-000000000002', true)$$,
  'P0001', 'NOT_ADMIN',
  'suspend_user oleh user biasa -> NOT_ADMIN'
);

select throws_ok(
  $$select * from public.admin_close_room(
    '00000000-0000-4000-8000-000000000000')$$,
  'P0001', 'NOT_ADMIN',
  'close_room oleh user biasa -> NOT_ADMIN'
);

select throws_ok(
  $$select * from public.admin_set_listing(
    '00000000-0000-4000-8000-000000000000', 'HIDDEN')$$,
  'P0001', 'NOT_ADMIN',
  'set_listing oleh user biasa -> NOT_ADMIN'
);

select throws_ok(
  $$select * from public.admin_list_users()$$,
  'P0001', 'NOT_ADMIN',
  'list_users oleh user biasa -> NOT_ADMIN'
);

select throws_ok(
  $$select * from public.admin_list_reports()$$,
  'P0001', 'NOT_ADMIN',
  'list_reports oleh user biasa -> NOT_ADMIN'
);

-- Admin dengan AAL1 -> MFA_REQUIRED.
select test_helpers_t17.act_as('e2100000-0000-4000-8000-000000000001', false, 'aal1');

select throws_ok(
  $$select * from public.admin_set_tier(
    'e2100000-0000-4000-8000-000000000002', 'premium')$$,
  'P0001', 'MFA_REQUIRED',
  'set_tier admin AAL1 -> MFA_REQUIRED'
);

select throws_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000002', 'fresh.handle2', true)$$,
  'P0001', 'MFA_REQUIRED',
  'rename_handle admin AAL1 -> MFA_REQUIRED'
);

-- JWT anonim (tanpa baris profiles) -> NOT_ADMIN.
select test_helpers_t17.act_as('e2200000-0000-4000-8000-000000000005', true);

select throws_ok(
  $$select * from public.admin_set_tier(
    'e2100000-0000-4000-8000-000000000002', 'premium')$$,
  'P0001', 'NOT_ADMIN',
  'set_tier JWT anonim -> NOT_ADMIN'
);

-- Tanpa JWT sama sekali.
select test_helpers_t17.act_clear();

select throws_ok(
  $$select * from public.admin_set_tier(
    'e2100000-0000-4000-8000-000000000002', 'premium')$$,
  'P0001', 'NOT_ADMIN',
  'set_tier tanpa sesi -> NOT_ADMIN'
);

-- Semua gagal gate tidak memberi jejak audit.
select is(
  (select count(*)::int from public.admin_audit_log),
  0,
  'gagal gate tidak menulis audit'
);

-- ---------------------------------------------------------------------------
-- S-28: validasi rename_handle (admin AAL2).
-- ---------------------------------------------------------------------------
select test_helpers_t17.act_as('e2100000-0000-4000-8000-000000000001', false, 'aal2');

select throws_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000002', 'bagus.banget', false)$$,
  'P0001', 'HANDLE_INVALID',
  'rename dengan p_verified=false -> HANDLE_INVALID'
);

select throws_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000002', null, true)$$,
  'P0001', 'HANDLE_INVALID',
  'rename tanpa handle -> HANDLE_INVALID'
);

select throws_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000002', 'aaaa11111', true)$$,
  'P0001', 'HANDLE_INVALID',
  'rename ke pola 9-acak -> HANDLE_INVALID'
);

select throws_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000002', 'ba d!', true)$$,
  'P0001', 'HANDLE_INVALID',
  'rename ke handle liar -> HANDLE_INVALID'
);

select throws_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000002', 'mod', true)$$,
  'P0001', 'HANDLE_RESERVED',
  'rename ke reserved -> HANDLE_RESERVED'
);

-- Rename sukses user3 -> taker3.test (member room C ikut).
select lives_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000003', 'taker3.test', true)$$,
  'rename user3 -> taker3.test'
);

select is(
  (
    select handle || '|' || handle_verified::text
    from public.profiles
    where user_id = 'e2100000-0000-4000-8000-000000000003'
  ),
  'taker3.test|true',
  'profil user3 memakai handle Admin terverifikasi'
);

select is(
  (
    select m.handle || '|' || m.handle_verified::text
    from public.member_identities mi
    join public.room_members m on m.id = mi.member_id
    where mi.room_id = (select id from public.rooms where slug = 't17a000000000003')
      and mi.user_id = 'e2100000-0000-4000-8000-000000000003'
  ),
  'taker3.test|true',
  'ticket room C user3 ikut terganti'
);

select is(
  (
    select count(*)::int
    from public.handle_history
    where user_id = 'e2100000-0000-4000-8000-000000000003'
      and new_handle = 'taker3.test'
      and changed_by = 'e2100000-0000-4000-8000-000000000001'
  ),
  1,
  'handle_history tercatat dengan changed_by admin'
);

select is(
  (
    select count(*)::int
    from public.admin_audit_log
    where action = 'rename_handle'
      and target_id = 'e2100000-0000-4000-8000-000000000003'
  ),
  1,
  'audit rename_handle user3 tercatat'
);

-- Bentrok dengan handle profil lain.
select throws_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000002', 'taker3.test', true)$$,
  'P0001', 'HANDLE_TAKEN',
  'rename ke handle user3 -> HANDLE_TAKEN'
);

-- Rename ke handle yang sama: tidak menulis riwayat baru.
select lives_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000003', 'taker3.test', true)$$,
  'rename idempoten tanpa galat'
);

select is(
  (
    select count(*)::int
    from public.handle_history
    where user_id = 'e2100000-0000-4000-8000-000000000003'
  ),
  1,
  'rename ke handle sama tidak menulis history baru'
);

select is(
  (
    select count(*)::int
    from public.admin_audit_log
    where action = 'rename_handle'
      and target_id = 'e2100000-0000-4000-8000-000000000003'
  ),
  2,
  'rename idempoten tetap teraudit'
);

-- Rename user2: hanya room ACTIVE (A) yang diubah, room B (tutup) tidak.
select lives_ok(
  $$select * from public.admin_rename_handle(
    'e2100000-0000-4000-8000-000000000002', 'login2.take-me', true)$$,
  'rename user2 -> login2.take-me'
);

select is(
  (
    select m.handle
    from public.member_identities mi
    join public.room_members m on m.id = mi.member_id
    where mi.room_id = (select id from public.rooms where slug = 't17a000000000001')
      and mi.user_id = 'e2100000-0000-4000-8000-000000000002'
  ),
  'login2.take-me',
  'ticket room A (aktif) user2 terganti'
);

select is(
  (
    select m.handle
    from public.member_identities mi
    join public.room_members m on m.id = mi.member_id
    where mi.room_id = (select id from public.rooms where slug = 't17a000000000002')
      and mi.user_id = 'e2100000-0000-4000-8000-000000000002'
  ),
  (
    select old_handle
    from public.handle_history
    where user_id = 'e2100000-0000-4000-8000-000000000002'
    limit 1
  ),
  'ticket room B (tutup) user2 tetap handle lama'
);

select is(
  (
    select count(*)::int
    from public.handle_history
    where user_id = 'e2100000-0000-4000-8000-000000000002'
      and new_handle = 'login2.take-me'
  ),
  1,
  'history user2 tercatat'
);

-- Target anonim tanpa profil -> NOT_FOUND.
select throws_ok(
  $$select * from public.admin_rename_handle(
    'e2200000-0000-4000-8000-000000000005', 'hayo.nama', true)$$,
  'P0001', 'NOT_FOUND',
  'rename user anonim -> NOT_FOUND'
);

-- ---------------------------------------------------------------------------
-- set_tier.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select * from public.admin_set_tier(
    'e2100000-0000-4000-8000-000000000002', 'premium')$$,
  'set_tier user2 -> premium'
);

select is(
  (
    select tier
    from public.profiles
    where user_id = 'e2100000-0000-4000-8000-000000000002'
  ),
  'premium',
  'tier user2 menjadi premium'
);

select throws_ok(
  $$select * from public.admin_set_tier(
    'e2100000-0000-4000-8000-000000000002', 'gold')$$,
  'P0001', 'INVALID_INPUT',
  'tier asal -> INVALID_INPUT'
);

select throws_ok(
  $$select * from public.admin_set_tier(
    'e2200000-0000-4000-8000-000000000006', 'premium')$$,
  'P0001', 'NOT_FOUND',
  'set_tier user anonim -> NOT_FOUND'
);

select is(
  (
    select count(*)::int
    from public.admin_audit_log
    where action = 'set_tier'
      and target_id = 'e2100000-0000-4000-8000-000000000002'
  ),
  1,
  'audit set_tier user2 tercatat'
);

-- ---------------------------------------------------------------------------
-- suspend_user.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$select * from public.admin_suspend_user(
    'e2100000-0000-4000-8000-000000000002', true)$$,
  'suspend user2'
);

select is(
  (
    select suspended::text
    from public.profiles
    where user_id = 'e2100000-0000-4000-8000-000000000002'
  ),
  'true',
  'user2 suspended'
);

select throws_ok(
  $$select * from public.admin_suspend_user(
    'e2100000-0000-4000-8000-000000000002', null)$$,
  'P0001', 'INVALID_INPUT',
  'suspend tanpa nilai -> INVALID_INPUT'
);

select throws_ok(
  $$select * from public.admin_suspend_user(
    'e2200000-0000-4000-8000-000000000006', true)$$,
  'P0001', 'NOT_FOUND',
  'suspend user anonim -> NOT_FOUND'
);

select is(
  (
    select count(*)::int
    from public.admin_audit_log
    where action = 'suspend_user'
      and target_id = 'e2100000-0000-4000-8000-000000000002'
  ),
  1,
  'audit suspend_user tercatat'
);

-- ---------------------------------------------------------------------------
-- admin_close_room.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.admin_close_room(
    '00000000-0000-4000-8000-ffffffffffff')$$,
  'P0001', 'NOT_FOUND',
  'close_room room tak dikenal -> NOT_FOUND'
);

select lives_ok(
  $$select * from public.admin_close_room(
    (select id from public.rooms where slug = 't17a000000000005'))$$,
  'close room E'
);

insert into test_close_t17
select closed_at from public.rooms where slug = 't17a000000000005';

select ok(
  (select closed_at is not null from public.rooms where slug = 't17a000000000005'),
  'room E tutup'
);

select ok(
  (
    select extract(epoch from (r.delete_at - r.closed_at))
    between coalesce(
              (select (value)::bigint * 86400
               from public.app_config
               where key = 'room_grace_days'),
              15 * 86400
            ) - 2
        and coalesce(
              (select (value)::bigint * 86400
               from public.app_config
               where key = 'room_grace_days'),
              15 * 86400
            ) + 2
    from public.rooms r
    where r.slug = 't17a000000000005'
  ),
  'delete_at = closed_at + grace'
);

select lives_ok(
  $$select * from public.admin_close_room(
    (select id from public.rooms where slug = 't17a000000000005'))$$,
  'close room E kedua kali idempoten'
);

select is(
  (
    select closed_at
    from public.rooms
    where slug = 't17a000000000005'
  ),
  (
    select closed_at
    from test_close_t17
  ),
  'close kedua tidak mengubah closed_at'
);

select is(
  (
    select count(*)::int
    from public.admin_audit_log
    where action = 'close_room'
      and target_id = (
        select id::text from public.rooms where slug = 't17a000000000005'
      )
  ),
  2,
  'audit close_room tercatat dua kali'
);

-- ---------------------------------------------------------------------------
-- admin_set_listing.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$select * from public.admin_set_listing(
    '00000000-0000-4000-8000-ffffffffffff', 'LISTED')$$,
  'P0001', 'NOT_FOUND',
  'set_listing room tak dikenal -> NOT_FOUND'
);

select throws_ok(
  $$select * from public.admin_set_listing(
    (select id from public.rooms where slug = 't17a000000000004'), 'PINNED')$$,
  'P0001', 'INVALID_INPUT',
  'status katalog asal -> INVALID_INPUT'
);

select throws_ok(
  $$select * from public.admin_set_listing(
    (select id from public.rooms where slug = 't17a000000000001'), 'LISTED')$$,
  'P0001', 'VISIBILITY_LOCKED',
  'room privat -> LISTED -> VISIBILITY_LOCKED'
);

select lives_ok(
  $$select * from public.admin_set_listing(
    (select id from public.rooms where slug = 't17a000000000004'), 'HIDDEN')$$,
  'set_listing D -> HIDDEN'
);

select is(
  (
    select listing_status || '|' || (listed_at is null)::text
    from public.rooms
    where slug = 't17a000000000004'
  ),
  'HIDDEN|true',
  'D HIDDEN tanpa listed_at'
);

select lives_ok(
  $$select * from public.admin_set_listing(
    (select id from public.rooms where slug = 't17a000000000004'), 'BANNED')$$,
  'set_listing D -> BANNED'
);

select is(
  (
    select listing_status
    from public.rooms
    where slug = 't17a000000000004'
  ),
  'BANNED',
  'D BANNED'
);

select lives_ok(
  $$select * from public.admin_set_listing(
    (select id from public.rooms where slug = 't17a000000000004'), 'LISTED')$$,
  'set_listing D -> LISTED (relisting publik)'
);

select is(
  (
    select listing_status || '|' || (listed_at is not null)::text
    from public.rooms
    where slug = 't17a000000000004'
  ),
  'LISTED|true',
  'D kembali LISTED dengan listed_at'
);

select is(
  (
    select count(*)::int
    from public.admin_audit_log
    where action = 'set_listing'
      and target_id = (select id::text from public.rooms where slug = 't17a000000000004')
      and detail ->> 'listing_status' in ('HIDDEN', 'BANNED', 'LISTED')
  ),
  3,
  'audit tiga perubahan listing D tercatat'
);

-- ---------------------------------------------------------------------------
-- admin_list_users: pencarian dan paginasi keyset.
-- ---------------------------------------------------------------------------
select test_helpers_t17.act_as('e2100000-0000-4000-8000-000000000001', false, 'aal2');

select is(
  (
    select count(*)::int
    from (select 1
          from public.admin_list_users() u
          where u.user_id in (
            'e2100000-0000-4000-8000-000000000001',
            'e2100000-0000-4000-8000-000000000002',
            'e2100000-0000-4000-8000-000000000003'
          )) t
  ),
  3,
  'list_users menampilkan ketiga akun login'
);

select is(
  (
    select count(*)::int
    from (select 1
          from public.admin_list_users() u
          where u.user_id = 'e2200000-0000-4000-8000-000000000005') t
  ),
  0,
  'list_users tidak menampilkan anonim'
);

select is(
  (
    select count(*)::int from public.admin_list_users('aker3')
  ),
  1,
  'pencarian substring handle cocok satu user'
);

select is(
  (
    select user_id
    from public.admin_list_users('aker3')
  ),
  'e2100000-0000-4000-8000-000000000003'::uuid,
  'hasil pencarian adalah user3'
);

select is(
  (
    select count(*)::int
    from public.admin_list_users(null, 'e2100000-0000-4000-8000-000000000003')
  ),
  2,
  'cursor user3: dua user lebih tua'
);

select is(
  (
    select user_id
    from public.admin_list_users(
      null,
      'e2100000-0000-4000-8000-000000000002'
    )
  ),
  'e2100000-0000-4000-8000-000000000001'::uuid,
  'cursor user2: hanya user1 di halaman'
);

select is(
  (
    select count(*)::int
    from public.admin_list_users(null, '00000000-0000-4000-8000-ffffffffffff')
  ),
  0,
  'cursor tak dikenal mengembalikan halaman kosong'
);

select is(
  (
    select count(*)::int
    from public.admin_audit_log
    where action = 'list_users'
  ),
  7,
  'audit list_users per pemanggilan'
);

-- ---------------------------------------------------------------------------
-- admin_list_reports: agregat per room + filter + cursor.
-- ---------------------------------------------------------------------------
select is(
  (
    select count(*)::int from public.admin_list_reports()
  ),
  2,
  'list_reports agregat per room'
);

select is(
  (
    select report_count || '|' || unique_reporters
    from public.admin_list_reports()
    where slug = 't17a000000000003'
  ),
  '3|3',
  'room C: 3 laporan 3 pelapor unik'
);

select ok(
  exists (
    select 1
    from public.admin_list_reports()
    where slug = 't17a000000000003'
      and reasons @> '{SPAM,ILLEGAL,OTHER}'
      and cardinality(reasons) = 3
  ),
  'room C membawa ketiga alasan'
);

select is(
  (
    select room_status
    from public.admin_list_reports()
    where slug = 't17a000000000003'
  ),
  'ACTIVE',
  'status room diturunkan (room C ACTIVE)'
);

select is(
  (
    select count(*)::int from public.admin_list_reports('BANNED')
  ),
  0,
  'filter BANNED: tidak ada room ber-laporan BANNED'
);

select is(
  (
    select count(*)::int from public.admin_list_reports('LISTED')
  ),
  1,
  'filter LISTED: hanya room C'
);

select is(
  (
    select first_report_id
    from public.admin_list_reports('LISTED')
  ),
  (
    select min(rr.id)
    from public.room_reports rr
    join public.rooms r on r.id = rr.room_id
    where r.slug = 't17a000000000003'
  ),
  'first_report_id = report id pertama room'
);

select throws_ok(
  $$select * from public.admin_list_reports('PINNED')$$,
  'P0001', 'INVALID_INPUT',
  'status filter asal -> INVALID_INPUT'
);

select is(
  (
    select count(*)::int
    from public.admin_list_reports(
      null,
      (select min(rr.id)
       from public.room_reports rr
       join public.rooms r on r.id = rr.room_id
       where r.slug = 't17a000000000003')
    )
  ),
  1,
  'cursor first_report room C: halaman berikutnya hanya room A'
);

select is(
  (
    select count(*)::int
    from public.admin_audit_log
    where action = 'list_reports'
  ),
  8,
  'audit list_reports tercatat'
);

-- ---------------------------------------------------------------------------
-- S-32: admin_audit_log tertutup untuk client; helper tak terpanggil client.
-- ---------------------------------------------------------------------------
select ok(
  (select relrowsecurity from pg_class where oid = 'public.admin_audit_log'::regclass),
  'RLS admin_audit_log aktif'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public' and tablename = 'admin_audit_log'
  ),
  0,
  'admin_audit_log tanpa policy client'
);

select is(
  (
    select count(*)::int
    from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as t(priv)
    where has_table_privilege('authenticated', 'public.admin_audit_log', t.priv)
       or has_table_privilege('anon', 'public.admin_audit_log', t.priv)
  ),
  0,
  'client tidak punya privilege apa pun pada admin_audit_log'
);

select is(
  (
    select count(*)::int
    where has_sequence_privilege('authenticated', 'public.admin_audit_log_id_seq', 'USAGE')
  ),
  0,
  'authenticated tidak punya USAGE sequence audit'
);

select ok(
  not has_function_privilege('authenticated', 'app_private.admin_gate()', 'EXECUTE'),
  'admin_gate tidak bisa dipanggil client'
);

select ok(
  not has_function_privilege('authenticated', 'app_private.admin_log(text,text,text,jsonb)', 'EXECUTE'),
  'admin_log tidak bisa dipanggil client'
);

-- RPC Admin ber-EXECUTE authenticated (bukan anon/service_role).
select is(
  (
    select count(*)::int
    from (values
      ('public.admin_rename_handle(uuid,text,boolean)'),
      ('public.admin_set_tier(uuid,text)'),
      ('public.admin_suspend_user(uuid,boolean)'),
      ('public.admin_close_room(uuid)'),
      ('public.admin_set_listing(uuid,text)'),
      ('public.admin_list_users(text,uuid)'),
      ('public.admin_list_reports(text,bigint)')
    ) as t(fn)
    where not has_function_privilege('authenticated', (t.fn)::regprocedure, 'EXECUTE')
  ),
  0,
  'ketujuh RPC Admin punya EXECUTE untuk authenticated'
);

select is(
  (
    select count(*)::int
    from (values
      ('public.admin_rename_handle(uuid,text,boolean)'),
      ('public.admin_set_tier(uuid,text)'),
      ('public.admin_suspend_user(uuid,boolean)'),
      ('public.admin_close_room(uuid)'),
      ('public.admin_set_listing(uuid,text)'),
      ('public.admin_list_users(text,uuid)'),
      ('public.admin_list_reports(text,bigint)')
    ) as t(fn)
    where has_function_privilege('anon', (t.fn)::regprocedure, 'EXECUTE')
       or has_function_privilege('service_role', (t.fn)::regprocedure, 'EXECUTE')
  ),
  0,
  'anon dan service_role tidak punya EXECUTE RPC Admin'
);

reset role;
