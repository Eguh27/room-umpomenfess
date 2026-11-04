begin;

create extension if not exists pgtap with schema extensions;

create schema test_helpers_t18;
grant usage on schema test_helpers_t18 to authenticated;

create function test_helpers_t18.act_as(
  p_user uuid,
  p_anonymous boolean default false
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
      'is_anonymous', p_anonymous
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub', coalesce(p_user::text, ''), true);
end;
$$;

grant execute on function test_helpers_t18.act_as(uuid, boolean) to authenticated;

-- Slug room bukan uuid; helper ini dipakai fixture dan pemanggilan RPC
-- yang meminta p_room_id uuid.
create function test_helpers_t18.room_id(p_slug text)
returns uuid
language sql
as $$
  select id from public.rooms where slug = p_slug
$$;

grant execute on function test_helpers_t18.room_id(text) to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 't18-host@example.com',
    extensions.crypt('hostpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 't18-rep-a@example.com',
    extensions.crypt('userpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 't18-rep-b@example.com',
    extensions.crypt('userpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', 't18-susp@example.com',
    extensions.crypt('userpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4000000-0000-4000-8000-000000000005',
    'authenticated', 'authenticated', 't18-rep-c@example.com',
    extensions.crypt('userpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4100000-0000-4000-8000-000000000006',
    'authenticated', 'authenticated', 't18-anon-a@example.com',
    extensions.crypt('anonpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4100000-0000-4000-8000-000000000007',
    'authenticated', 'authenticated', 't18-anon-b@example.com',
    extensions.crypt('anonpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e4100000-0000-4000-8000-000000000008',
    'authenticated', 'authenticated', 't18-anon-c@example.com',
    extensions.crypt('anonpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  );

update public.profiles set suspended = true
where user_id = 'e4000000-0000-4000-8000-000000000004';

-- Room FYP: 1-3 listable dengan statistik terkontrol; 4-8 harus tak ter-list
-- (HIDDEN/BANNED/PRIVATE/closed/expired); 9-13 untuk laporan dan stats.
with pw as (
  select extensions.crypt('ABC234', extensions.gen_salt('bf', 10)) as hash
)
insert into public.rooms (
  slug, host_id, name, description, category, password_hash,
  approval_required, max_guests, idle_timeout_minutes, typing_enabled,
  visibility, listing_status, listed_at, expires_at, delete_at, closed_at
)
select
  v.slug, 'e4000000-0000-4000-8000-000000000001', v.name, v.descr, v.cat,
  case when v.visibility = 'PRIVATE' then pw.hash else null end,
  false, 5, 30, true, v.visibility, v.listing_status, v.listed_at,
  coalesce(v.expires_at::timestamptz, now() + interval '7 days'),
  now() + interval '22 days',
  v.closed_at
from (values
  ('t18a000000000001', 'Alpha Public',    'room alpha',   'umum', 'PUBLIC', 'LISTED', now() - interval '3 hours',  null,                        null::timestamptz),
  ('t18a000000000002', 'Beta Public',     'room beta',    'umum', 'PUBLIC', 'LISTED', now() - interval '2 hours',  null,                        null::timestamptz),
  ('t18a000000000003', 'Gamma Main',      'room gamma',   'main', 'PUBLIC', 'LISTED', now() - interval '1 hour',   null,                        null::timestamptz),
  ('t18a000000000004', 'Hidden Delta',    'room delta',   'umum', 'PUBLIC', 'HIDDEN', now() - interval '4 hours',  null,                        null::timestamptz),
  ('t18a000000000005', 'Banned Echo',     'room echo',    'umum', 'PUBLIC', 'BANNED', now() - interval '5 hours',  null,                        null::timestamptz),
  ('t18a000000000006', 'Private Foxtrot', 'room foxtrot', 'umum', 'PRIVATE', 'LISTED', now() - interval '6 hours', null,                       null::timestamptz),
  ('t18a000000000007', 'Closed Golf',     'room golf',    'umum', 'PUBLIC', 'LISTED', now() - interval '7 hours',  null,                        now()),
  ('t18a000000000009', 'Report India',    'room india',   'umum', 'PUBLIC', 'LISTED', now() - interval '45 minutes', null,                      null::timestamptz),
  ('t18a000000000010', 'Private Kilo',    'room kilo',    'umum', 'PRIVATE', 'LISTED', now() - interval '50 minutes', null,                     null::timestamptz),
  ('t18a000000000011', 'Threshold Lima',  'room lima',    'umum', 'PUBLIC', 'LISTED', now() - interval '40 minutes', null,                     null::timestamptz),
  ('t18a000000000012', 'Join Mike',       'room mike',    'umum', 'PUBLIC', 'LISTED', now() - interval '35 minutes', null,                     null::timestamptz),
  ('t18a000000000013', 'Stats November',  'room november', 'umum', 'PUBLIC', 'LISTED', now() - interval '30 minutes', null,                    null::timestamptz)
) as v(slug, name, descr, cat, visibility, listing_status, listed_at, expires_at, closed_at)
cross join pw;

-- Room kedaluwarsa dibuat terpisah: butuh created_at lebih tua dari
-- expires_at agar lolos rooms_check (expires_at > created_at).
insert into public.rooms (
  slug, host_id, name, description, category, approval_required,
  max_guests, idle_timeout_minutes, typing_enabled, visibility,
  listing_status, listed_at, expires_at, delete_at, created_at
)
values (
  't18a000000000008', 'e4000000-0000-4000-8000-000000000001', 'Expired Hotel',
  'room hotel', 'umum', false, 5, 30, true, 'PUBLIC', 'LISTED',
  now() - interval '8 hours', now() - interval '1 hour',
  now() + interval '22 days', now() - interval '9 hours'
);

-- Statistik terkontrol. Urutan ACTIVE: (10,4) > (9,5) > (5,9) > grup nol
-- menurut slug desc: 013 > 012 > 011 > 009.
insert into public.room_stats (room_id, approved_count, messages_last_hour)
select r.id, v.approved_count, v.messages_last_hour
from (values
  ('t18a000000000001', 4, 10),
  ('t18a000000000002', 5, 9),
  ('t18a000000000003', 9, 5),
  ('t18a000000000009', 0, 0),
  ('t18a000000000011', 0, 0),
  ('t18a000000000012', 0, 0),
  ('t18a000000000013', 0, 0)
) as v(slug, approved_count, messages_last_hour)
join public.rooms r on r.slug = v.slug;

-- Member anonim: A6 di room privat Kilo (lapor sebagai member), A7 di room
-- November (untuk refresh_room_stats). A8 sengaja tanpa keanggotaan.
insert into public.room_members (room_id, handle, handle_verified, status, password_version)
select r.id, v.handle, false, 'APPROVED'::public.member_status, v.password_version
from (values
  ('t18a000000000010', 'amember06', 1),
  ('t18a000000000013', 'amember07', 1)
) as v(slug, handle, password_version)
join public.rooms r on r.slug = v.slug;

insert into public.member_identities (member_id, room_id, user_id)
select m.id, r.id, u.id
from (values
  ('t18a000000000010', 'e4100000-0000-4000-8000-000000000006'),
  ('t18a000000000013', 'e4100000-0000-4000-8000-000000000007')
) as v(room_slug, user_id)
join public.rooms r on r.slug = v.room_slug
join public.room_members m on m.room_id = r.id
join auth.users u on u.id = v.user_id::uuid;

-- Dua pesan room November: satu sudah lewat 1 jam, satu segar.
insert into public.messages (
  room_id, sender_type, member_id, sender_name, content, client_msg_id, created_at
)
values
  (
    test_helpers_t18.room_id('t18a000000000013'), 'GUEST',
    (select id from public.room_members where handle = 'amember07'),
    'amember07', 'pesan lama',
    'aaaaaaaa-0000-4000-8000-000000000001',
    now() - interval '90 minutes'
  ),
  (
    test_helpers_t18.room_id('t18a000000000013'), 'GUEST',
    (select id from public.room_members where handle = 'amember07'),
    'amember07', 'pesan baru',
    'aaaaaaaa-0000-4000-8000-000000000002',
    now()
  );

update public.app_config set value = 'true'::jsonb where key = 'public_rooms_enabled';

select plan(44);

-- ===== list_public_rooms: urutan, kursor, limit, filter =====

select results_eq(
  $$select f.slug from public.list_public_rooms() f$$,
  $$values
      ('t18a000000000001'),
      ('t18a000000000002'),
      ('t18a000000000003'),
      ('t18a000000000013'),
      ('t18a000000000012'),
      ('t18a000000000011'),
      ('t18a000000000009')$$,
  'ACTIVE: HIDDEN/BANNED/PRIVATE/closed/expired tak ter-list; urutan stats desc'
);

select results_eq(
  $$select f.slug from public.list_public_rooms('ACTIVE', null, null, null, 2) f$$,
  $$values ('t18a000000000001'), ('t18a000000000002')$$,
  'ACTIVE: limit 2 memotong halaman pertama'
);

select results_eq(
  $$select f.slug from public.list_public_rooms('ACTIVE', null, null, 't18a000000000002', null) f$$,
  $$values
      ('t18a000000000003'),
      ('t18a000000000013'),
      ('t18a000000000012'),
      ('t18a000000000011'),
      ('t18a000000000009')$$,
  'ACTIVE: kursor slug room 2 melanjutkan keyset tanpa duplikat'
);

select is(
  (select count(*)::int from public.list_public_rooms('ACTIVE', null, null, null, 0)),
  1,
  'limit 0 di-clamp ke 1'
);

select is(
  (select count(*)::int from public.list_public_rooms('ACTIVE', null, null, null, 999)),
  7,
  'limit 999 di-clamp ke 50; semua room listable terambil'
);

select is_empty(
  $$select f.slug from public.list_public_rooms('ACTIVE', null, null, 't18a999999999999', null) f$$,
  'kursor tak dikenal mengembalikan halaman kosong'
);

select results_eq(
  $$select f.slug from public.list_public_rooms('ACTIVE', null, 'pub', null, null) f$$,
  $$values ('t18a000000000001'), ('t18a000000000002')$$,
  'p_q mencari nama case-insensitive'
);

select results_eq(
  $$select f.slug from public.list_public_rooms('ACTIVE', null, '  GAMMA  ', null, null) f$$,
  $$values ('t18a000000000003')$$,
  'p_q di-trim dan tidak case-sensitive'
);

select results_eq(
  $$select f.slug from public.list_public_rooms('ACTIVE', 'main', null, null, null) f$$,
  $$values ('t18a000000000003')$$,
  'p_category memfilter kategori'
);

select is_empty(
  $$select f.slug from public.list_public_rooms('ACTIVE', 'huh', null, null, null) f$$,
  'kategori tak dikenal mengembalikan halaman kosong'
);

select results_eq(
  $$select f.slug from public.list_public_rooms('NEW') f$$,
  $$values
      ('t18a000000000013'),
      ('t18a000000000012'),
      ('t18a000000000011'),
      ('t18a000000000009'),
      ('t18a000000000003'),
      ('t18a000000000002'),
      ('t18a000000000001')$$,
  'NEW: urut listed_at desc'
);

select results_eq(
  $$select f.slug from public.list_public_rooms('NEW', null, null, 't18a000000000003', null) f$$,
  $$values ('t18a000000000002'), ('t18a000000000001')$$,
  'NEW: kursor listed_at room 3 melanjutkan keyset'
);

select set_eq(
  $$select jsonb_object_keys(to_jsonb(f))
    from (select * from public.list_public_rooms() limit 1) f$$,
  $$values ('slug'), ('name'), ('description'), ('category'),
           ('approved_count'), ('max_guests'), ('last_activity_at'), ('is_full')$$,
  'list_public_rooms hanya mengembalikan 8 kolom whitelist'
);

select is(
  (select f.is_full from public.list_public_rooms() f where f.slug = 't18a000000000002'),
  true,
  'is_full true saat approved_count >= max_guests'
);

select is(
  (select f.approved_count from public.list_public_rooms() f where f.slug = 't18a000000000001'),
  4,
  'approved_count diambil dari room_stats'
);

update public.app_config set value = 'false'::jsonb where key = 'public_rooms_enabled';
select throws_ok(
  $$select * from public.list_public_rooms('ACTIVE', null, null, null, null)$$,
  'P0001',
  'FEATURE_DISABLED',
  'flag public_rooms_enabled mati menolak FYP'
);
update public.app_config set value = 'true'::jsonb where key = 'public_rooms_enabled';

select throws_ok(
  $$select * from public.list_public_rooms('WEIRD', null, null, null, null)$$,
  'P0001',
  'INVALID_INPUT',
  'sort tak dikenal ditolak'
);

-- ===== report_room: matriks error dan auto-HIDDEN =====

select throws_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000009'), 'FOO')$$,
  'P0001',
  'INVALID_INPUT',
  'alasan di luar daftar ditolak'
);

select throws_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000009'), null)$$,
  'P0001',
  'INVALID_INPUT',
  'alasan kosong ditolak'
);

select throws_ok(
  $$select public.report_room('e4ff0000-0000-4000-8000-000000000099'::uuid, 'SPAM')$$,
  'P0001',
  'NOT_FOUND',
  'room tak dikenal ditolak'
);

select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000001', false);
select throws_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000009'), 'SPAM')$$,
  'P0001',
  'REPORT_NOT_ALLOWED',
  'host tidak boleh melaporkan room miliknya'
);

select test_helpers_t18.act_as('e4100000-0000-4000-8000-000000000006', true);
select throws_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000009'), 'SPAM')$$,
  'P0001',
  'REPORT_NOT_ALLOWED',
  'anonim non-member tidak boleh melaporkan room publik'
);

select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000004', false);
select throws_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000009'), 'SPAM')$$,
  'P0001',
  'USER_SUSPENDED',
  'akun login yang disuspend ditolak'
);

select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000002', false);
select lives_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000009'), 'SPAM')$$,
  'login non-member boleh melaporkan room publik'
);

select throws_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000009'), 'ABUSE')$$,
  'P0001',
  'ALREADY_REPORTED',
  'pelapor yang sama hanya dihitung sekali'
);

select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000003', false);
select lives_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000009'), 'OTHER')$$,
  'pelapor kedua diterima'
);

select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000002', false);
select throws_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000010'), 'SPAM')$$,
  'P0001',
  'REPORT_NOT_ALLOWED',
  'login non-member tidak boleh melaporkan room privat'
);

select test_helpers_t18.act_as('e4100000-0000-4000-8000-000000000006', true);
select lives_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000010'), 'SPAM')$$,
  'member APPROVED boleh melaporkan room privatnya'
);

select throws_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000010'), 'SPAM')$$,
  'P0001',
  'ALREADY_REPORTED',
  'member anonim juga hanya sekali melapor'
);

-- Ambang laporan unik (default 3) mem-HIDDEN-kan room.
select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000002', false);
select lives_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000011'), 'SPAM')$$,
  'laporan 1 room Lima'
);
select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000003', false);
select lives_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000011'), 'ABUSE')$$,
  'laporan 2 room Lima'
);
select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000005', false);
select lives_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000011'), 'ILLEGAL')$$,
  'laporan 3 room Lima mencapai ambang'
);

select is(
  (
    select listing_status = 'HIDDEN' and listed_at is null
    from public.rooms where slug = 't18a000000000011'
  ),
  true,
  'ambang laporan unik mem-HIDDEN-kan room dan mengosongkan listed_at'
);

select is(
  (
    select listing_status = 'LISTED'
    from public.rooms where slug = 't18a000000000009'
  ),
  true,
  'room di bawah ambang tetap LISTED'
);

-- Room Mike dit-HIDDEN lewat laporan, lalu join ditolak ROOM_HIDDEN.
select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000002', false);
select lives_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000012'), 'SPAM')$$,
  'laporan 1 room Mike'
);
select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000003', false);
select lives_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000012'), 'SPAM')$$,
  'laporan 2 room Mike'
);
select test_helpers_t18.act_as('e4000000-0000-4000-8000-000000000005', false);
select lives_ok(
  $$select public.report_room(test_helpers_t18.room_id('t18a000000000012'), 'OTHER')$$,
  'laporan 3 room Mike memicu HIDDEN'
);

select is(
  (
    select listing_status = 'HIDDEN'
    from public.rooms where slug = 't18a000000000012'
  ),
  true,
  'room Mike menjadi HIDDEN'
);

select throws_ok(
  $$select public.join_room(
       'e4100000-0000-4000-8000-000000000008'::uuid,
       true,
       't18a000000000012',
       null,
       repeat('a', 64)
     )$$,
  'P0001',
  'ROOM_HIDDEN',
  'room publik HIDDEN menolak join baru'
);

-- ===== refresh_room_stats + jadwal cron =====

select lives_ok(
  $$select public.refresh_room_stats()$$,
  'refresh_room_stats berjalan tanpa error'
);

select is(
  (
    select approved_count
    from public.room_stats
    where room_id = test_helpers_t18.room_id('t18a000000000013')
  ),
  1,
  'refresh menghitung member APPROVED'
);

select is(
  (
    select messages_last_hour
    from public.room_stats
    where room_id = test_helpers_t18.room_id('t18a000000000013')
  ),
  1,
  'refresh hanya menghitung pesan dalam 1 jam terakhir'
);

select is(
  (
    select s.last_message_at = m.created_at
    from public.room_stats s
    cross join public.messages m
    where s.room_id = test_helpers_t18.room_id('t18a000000000013')
      and m.client_msg_id = 'aaaaaaaa-0000-4000-8000-000000000002'
      and m.room_id = test_helpers_t18.room_id('t18a000000000013')
  ),
  true,
  'last_message_at mengikuti pesan terbaru'
);

select is(
  (
    select count(*)::int from cron.job where jobname = 'refresh-room-stats'
  ),
  1,
  'job cron refresh-room-stats terdaftar tiap menit'
);

-- Kembalikan flag agar file lain tidak terpengaruh bila transaksi tidak
-- sempat rollback.
update public.app_config set value = 'false'::jsonb where key = 'public_rooms_enabled';

reset role;
