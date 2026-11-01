begin;

create extension if not exists pgtap with schema extensions;

create schema test_helpers_t13a;
grant usage on schema test_helpers_t13a to authenticated;

create function test_helpers_t13a.act_as(p_user uuid, p_anonymous boolean default false)
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
  perform set_config('request.jwt.claim.sub', p_user::text, true);
end;
$$;

grant execute on function test_helpers_t13a.act_as(uuid, boolean) to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'e0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 't13a-host@example.com',
    extensions.crypt('hostpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 't13a-login@example.com',
    extensions.crypt('loginpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'e0000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 't13a-suspended@example.com',
    extensions.crypt('loginpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  );

update public.profiles
set suspended = true
where user_id = 'e0000000-0000-4000-8000-000000000003';

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
select
  '00000000-0000-0000-0000-000000000000',
  format('e1000000-0000-4000-8000-%s', lpad(n::text, 12, '0'))::uuid,
  'authenticated', 'authenticated', null, null, null,
  '{"provider":"anonymous","providers":[]}'::jsonb, '{}'::jsonb,
  now(), now(), true
from generate_series(1, 13) as n;

create temporary table test_joins_t13a (
  key text primary key,
  status text not null,
  room_id uuid not null,
  member_id uuid not null,
  handle text not null
) on commit drop;

with pw as (
  select extensions.crypt('ABC234', extensions.gen_salt('bf', 10)) as hash
)
insert into public.rooms (
  slug, host_id, name, password_hash, approval_required, max_guests,
  idle_timeout_minutes, typing_enabled, visibility, listing_status,
  listed_at, expires_at, delete_at, closed_at
)
select
  v.slug, 'e0000000-0000-4000-8000-000000000001', v.name,
  case when v.visibility = 'PRIVATE' then pw.hash else null end,
  false, v.max_guests, 30, true, v.visibility, v.listing_status,
  case
    when v.visibility = 'PUBLIC' and v.listing_status = 'LISTED'
      then now()
    else null
  end,
  now() + interval '7 days', now() + interval '22 days',
  case when v.closed then now() else null end
from (values
  ('t13a000000000001', 'Anon A', 'PRIVATE', 'LISTED', 2, false),
  ('t13a000000000002', 'Anon B', 'PRIVATE', 'LISTED', 2, false),
  ('t13a000000000003', 'Rejoin C', 'PRIVATE', 'LISTED', 2, false),
  ('t13a000000000004', 'Rejoin D', 'PRIVATE', 'LISTED', 2, false),
  ('t13a000000000005', 'Hidden Private', 'PRIVATE', 'HIDDEN', 2, false),
  ('t13a000000000006', 'Public Listed', 'PUBLIC', 'LISTED', 2, false),
  ('t13a000000000007', 'Public Hidden', 'PUBLIC', 'HIDDEN', 2, false),
  ('t13a000000000008', 'Public Banned', 'PUBLIC', 'BANNED', 2, false),
  ('t13a000000000009', 'Public Rate', 'PUBLIC', 'LISTED', 2, false)
) as v(slug, name, visibility, listing_status, max_guests, closed)
cross join pw;

with pw as (
  select extensions.crypt('ABC234', extensions.gen_salt('bf', 10)) as hash
)
insert into public.rooms (
  slug, host_id, name, password_hash, approval_required, max_guests,
  idle_timeout_minutes, typing_enabled, visibility, listing_status,
  listed_at, expires_at, delete_at, closed_at
)
select
  v.slug, 'e0000000-0000-4000-8000-000000000001', v.name,
  case when v.visibility = 'PRIVATE' then pw.hash else null end,
  false, v.max_guests, 30, true, v.visibility, v.listing_status,
  case
    when v.visibility = 'PUBLIC' and v.listing_status = 'LISTED'
      then now()
    else null
  end,
  now() + interval '7 days', now() + interval '22 days',
  case when v.closed then now() else null end
from (values
  ('t13a000000000010', 'Closed Room', 'PRIVATE', 'LISTED', 2, true),
  ('t13a000000000011', 'Login One', 'PRIVATE', 'LISTED', 5, false),
  ('t13a000000000012', 'Login Two', 'PRIVATE', 'LISTED', 5, false),
  ('t13a000000000013', 'Login Three', 'PRIVATE', 'LISTED', 5, false),
  ('t13a000000000014', 'Login Four', 'PRIVATE', 'LISTED', 5, false),
  ('t13a000000000015', 'Login Five', 'PRIVATE', 'LISTED', 5, false),
  ('t13a000000000016', 'Login Six', 'PRIVATE', 'LISTED', 5, false),
  ('t13a000000000017', 'Suspended Join', 'PRIVATE', 'LISTED', 2, false),
  ('t13a000000000018', 'Badge Room', 'PRIVATE', 'LISTED', 5, false)
) as v(slug, name, visibility, listing_status, max_guests, closed)
cross join pw;

with pw as (
  select extensions.crypt('ABC234', extensions.gen_salt('bf', 10)) as hash
)
insert into public.rooms (
  slug, host_id, name, password_hash, approval_required, max_guests,
  idle_timeout_minutes, typing_enabled, visibility, listing_status,
  listed_at, expires_at, delete_at, closed_at
)
select
  v.slug, 'e0000000-0000-4000-8000-000000000001', v.name,
  case when v.visibility = 'PRIVATE' then pw.hash else null end,
  false, v.max_guests, 30, true, v.visibility, v.listing_status,
  case
    when v.visibility = 'PUBLIC' and v.listing_status = 'LISTED'
      then now()
    else null
  end,
  now() + interval '7 days', now() + interval '22 days',
  case when v.closed then now() else null end
from (values
  ('t13a000000000019', 'Rejoin Hidden', 'PUBLIC', 'LISTED', 2, false),
  ('t13a000000000020', 'Rejoin Full', 'PRIVATE', 'LISTED', 2, false),
  ('t13a000000000021', 'Flag Off', 'PUBLIC', 'LISTED', 2, false),
  ('t13a000000000022', 'Join Hidden', 'PUBLIC', 'HIDDEN', 2, false),
  ('t13a000000000023', 'Join Banned', 'PUBLIC', 'BANNED', 2, false),
  ('t13a000000000024', 'Join Public', 'PUBLIC', 'LISTED', 2, false),
  ('t13a000000000025', 'Rate Public', 'PUBLIC', 'LISTED', 2, false),
  ('t13a000000000026', 'Suspended Send', 'PRIVATE', 'LISTED', 2, false)
) as v(slug, name, visibility, listing_status, max_guests, closed)
cross join pw;

update public.app_config set value = '1'::jsonb where key = 'anon_max_active_rooms';
update public.app_config set value = '5'::jsonb where key = 'login_max_active_rooms';
update public.app_config set value = 'true'::jsonb where key = 'public_rooms_enabled';
update public.app_config set value = '20'::jsonb where key = 'public_join_per_ip_per_hour';
update public.app_config set value = 'true'::jsonb where key = 'typing_global_enabled';

select plan(70);

select set_eq(
  $$
    select a.name
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) as a(name, mode)
    where p.oid = 'public.join_room(uuid,boolean,text,text,text)'::regprocedure
      and a.mode = 't'
  $$,
  $$values ('status'), ('room_id'), ('member_id'), ('handle')$$,
  'join_room mengembalikan status, room_id, member_id, handle'
);

select is(
  (
    select p.pronargs::int
    from pg_proc p
    where p.oid = 'public.join_room(uuid,boolean,text,text,text)'::regprocedure
  ),
  5,
  'join_room memakai lima argumen final'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.join_room(uuid,boolean,text,text,text)'::regprocedure,
    'EXECUTE'
  ),
  'authenticated tidak punya grant join_room'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.join_room(uuid,boolean,text,text,text)'::regprocedure,
    'EXECUTE'
  ),
  'anon tidak punya grant join_room'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.join_room(uuid,boolean,text,text,text)'::regprocedure,
    'EXECUTE'
  ),
  'service_role bisa memanggil join_room'
);

-- Aturan satu keanggotaan aktif untuk sesi anonim.
insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'anon1_a', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000001', true,
  't13a000000000001', 'ABC234', repeat('1', 64)
);

select is(
  (select status from test_joins_t13a where key = 'anon1_a'),
  'APPROVED',
  'anonim join room privat pertama'
);

select ok(
  (select handle from test_joins_t13a where key = 'anon1_a')
    ~ '^[a-z0-9]{9}$',
  'handle anonim berpola sistem'
);

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000001', true,
      't13a000000000002', 'ABC234', repeat('2', 64)
    )$$,
  'P0001', 'ONE_ROOM_LIMIT',
  'anonim tidak boleh punya dua keanggotaan aktif'
);

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.leave_room(
      (select room_id from public.get_room_public('t13a000000000001'))
    )$$,
  'anonim keluar dari room pertama'
);

reset role;

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'anon1_b', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000001', true,
  't13a000000000002', 'ABC234', repeat('3', 64)
);

select is(
  (select status from test_joins_t13a where key = 'anon1_b'),
  'APPROVED',
  'anonim bisa join room lain setelah keluar'
);

select isnt(
  (select handle from test_joins_t13a where key = 'anon1_a'),
  (select handle from test_joins_t13a where key = 'anon1_b'),
  'handle anonim berbeda per room'
);

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000001', true);

select lives_ok(
  $$select public.leave_room(
      (select room_id from public.get_room_public('t13a000000000002'))
    )$$,
  'anonim keluar dari room kedua'
);

reset role;

-- Handle anonim dipertahankan saat rejoin room yang sama.
insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'anon2_d', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000002', true,
  't13a000000000004', 'ABC234', repeat('4', 64)
);

select is(
  (select status from test_joins_t13a where key = 'anon2_d'),
  'APPROVED',
  'anonim join room rejoin'
);

update public.room_members m
set status = 'IDLE'::public.member_status
where m.id = (select member_id from test_joins_t13a where key = 'anon2_d');

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000002', true);

select is(
  (select public.rejoin_room(
      (select room_id from public.get_room_public('t13a000000000004'))
    )::text),
  'APPROVED',
  'rejoin_room mengembalikan APPROVED untuk IDLE'
);

reset role;

select is(
  (
    select m.handle
    from public.room_members m
    where m.id = (select member_id from test_joins_t13a where key = 'anon2_d')
  ),
  (select handle from test_joins_t13a where key = 'anon2_d'),
  'handle anonim dipertahankan saat rejoin'
);

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$select public.leave_room(
      (select room_id from public.get_room_public('t13a000000000004'))
    )$$,
  'anonim keluar sebelum pindah ke room badge'
);

reset role;

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'anon2_n', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000002', true,
  't13a000000000018', 'ABC234', repeat('5', 64)
);

select is(
  (select status from test_joins_t13a where key = 'anon2_n'),
  'APPROVED',
  'anonim join room badge'
);

update public.room_members m
set handle = 'anon.verified',
    handle_verified = true
where m.id = (select member_id from test_joins_t13a where key = 'anon2_n');

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000002', true);

select is(
  (
    select sender_name
    from public.send_message(
      (select room_id from public.get_room_public('t13a000000000018')),
      'Halo dari anon', 'e2000000-0000-4000-8000-000000000001'
    )
  ),
  'anon.verified',
  'send_message memakai snapshot handle member'
);

select is(
  (
    select sender_badge
    from public.messages
    where client_msg_id = 'e2000000-0000-4000-8000-000000000001'
  ),
  'VERIFIED',
  'send_message menyimpan badge VERIFIED dari handle_verified'
);

select test_helpers_t13a.act_as('e0000000-0000-4000-8000-000000000001', false);

select is(
  (
    select sender_badge
    from public.send_message(
      (select room_id from public.get_room_public('t13a000000000018')),
      'Halo dari Host', 'e2000000-0000-4000-8000-000000000002'
    )
  ),
  'HOST',
  'send_message Host memakai badge HOST'
);

select is(
  (
    select sender_name
    from public.messages
    where client_msg_id = 'e2000000-0000-4000-8000-000000000002'
  ),
  (
    select p.handle
    from public.profiles p
    where p.user_id = 'e0000000-0000-4000-8000-000000000001'
  ),
  'sender_name Host dari handle profil'
);

select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000002', true);

select is(
  (
    select count(*)::int
    from public.list_messages(
      (select room_id from public.get_room_public('t13a000000000018'))
    )
  ),
  2,
  'list_messages memuat pesan Host dan Guest'
);

select set_eq(
  $$
    select sender_badge
    from public.list_messages(
      (select room_id from public.get_room_public('t13a000000000018'))
    )
  $$,
  $$values ('HOST'), ('VERIFIED')$$,
  'list_messages membawa sender_badge snapshot'
);

reset role;

-- Rejoin juga menghormati aturan satu room aktif.
insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'anon3_c', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000003', true,
  't13a000000000003', 'ABC234', repeat('6', 64)
);

select is(
  (select status from test_joins_t13a where key = 'anon3_c'),
  'APPROVED',
  'anonim join room C'
);

update public.room_members m
set status = 'IDLE'::public.member_status
where m.id = (select member_id from test_joins_t13a where key = 'anon3_c');

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'anon3_d', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000003', true,
  't13a000000000004', 'ABC234', repeat('7', 64)
);

select is(
  (select status from test_joins_t13a where key = 'anon3_d'),
  'APPROVED',
  'anonim join room D saat room C IDLE'
);

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000003', true);

select throws_ok(
  $$select public.rejoin_room(
      (select room_id from public.get_room_public('t13a000000000003'))
    )$$,
  'P0001', 'ONE_ROOM_LIMIT',
  'rejoin_room menolak bila sudah ada room aktif lain'
);

select lives_ok(
  $$select public.leave_room(
      (select room_id from public.get_room_public('t13a000000000004'))
    )$$,
  'anonim keluar dari room D'
);

select is(
  (select public.rejoin_room(
      (select room_id from public.get_room_public('t13a000000000003'))
    )::text),
  'APPROVED',
  'rejoin_room berhasil setelah room aktif lain dilepas'
);

reset role;

-- Rejoin juga menolak room PUBLIC HIDDEN/BANNED.
insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'anon4_p', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000004', true,
  't13a000000000019', null, repeat('8', 64)
);

select is(
  (select status from test_joins_t13a where key = 'anon4_p'),
  'APPROVED',
  'anonim join room publik untuk uji rejoin'
);

update public.room_members m
set status = 'IDLE'::public.member_status
where m.id = (select member_id from test_joins_t13a where key = 'anon4_p');

update public.rooms
set listing_status = 'HIDDEN'
where slug = 't13a000000000019';

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000004', true);

select throws_ok(
  $$select public.rejoin_room(
      (select room_id from public.get_room_public('t13a000000000019'))
    )$$,
  'P0001', 'ROOM_HIDDEN',
  'rejoin_room menolak room PUBLIC HIDDEN'
);

reset role;

update public.rooms
set listing_status = 'BANNED'
where slug = 't13a000000000019';

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000004', true);

select throws_ok(
  $$select public.rejoin_room(
      (select room_id from public.get_room_public('t13a000000000019'))
    )$$,
  'P0001', 'ROOM_BANNED',
  'rejoin_room menolak room BANNED'
);

reset role;

-- Join baru: hidden privat tetap bisa dijoin dengan password.
insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'anon5_hidden_private', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000005', true,
  't13a000000000005', 'ABC234', repeat('9', 64)
);

select is(
  (select status from test_joins_t13a where key = 'anon5_hidden_private'),
  'APPROVED',
  'room PRIVATE dengan listing HIDDEN tetap bisa dijoin'
);

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000005', true);

select lives_ok(
  $$select public.leave_room(
      (select room_id from public.get_room_public('t13a000000000005'))
    )$$,
  'anonim keluar dari room hidden privat'
);

reset role;

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000005', true,
      't13a000000000010', 'ABC234', repeat('a', 64)
    )$$,
  'P0001', 'ROOM_CLOSED',
  'join_room menolak room CLOSED'
);

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000005', true,
      't13a000000000007', null, repeat('b', 64)
    )$$,
  'P0001', 'ROOM_HIDDEN',
  'join_room menolak room PUBLIC HIDDEN'
);

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000005', true,
      't13a000000000008', null, repeat('c', 64)
    )$$,
  'P0001', 'ROOM_BANNED',
  'join_room menolak room BANNED'
);

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'anon5_public', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000005', true,
  't13a000000000024', null, repeat('d', 64)
);

select is(
  (select status from test_joins_t13a where key = 'anon5_public'),
  'APPROVED',
  'join room PUBLIC tanpa password'
);

select is(
  (select visibility from public.get_room_public('t13a000000000024')),
  'PUBLIC',
  'get_room_public membawa visibility room publik'
);

select is(
  (select visibility from public.get_room_public('t13a000000000001')),
  'PRIVATE',
  'get_room_public membawa visibility room privat'
);

select is(
  (select count(*)::int from public.join_attempts a
    join public.rooms r on r.id = a.room_id
    where r.slug = 't13a000000000024' and a.success),
  1,
  'join sukses tercatat di join_attempts untuk rate limit publik'
);

update public.app_config
set value = 'false'::jsonb
where key = 'public_rooms_enabled';

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000006', true,
      't13a000000000021', null, repeat('e', 64)
    )$$,
  'P0001', 'FEATURE_DISABLED',
  'room PUBLIC ditolak saat flag FYP mati'
);

update public.app_config
set value = 'true'::jsonb
where key = 'public_rooms_enabled';

update public.app_config
set value = '2'::jsonb
where key = 'public_join_per_ip_per_hour';

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'public_rate_1', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000007', true,
  't13a000000000025', null, repeat('f', 64)
);

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'public_rate_2', status::text, room_id, member_id, handle
from public.join_room(
  'e1000000-0000-4000-8000-000000000008', true,
  't13a000000000025', null, repeat('f', 64)
);

select is(
  (select count(*)::int from test_joins_t13a
    where key in ('public_rate_1', 'public_rate_2') and status = 'APPROVED'),
  2,
  'dua join publik pertama dari ip_hash sama diterima'
);

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000009', true,
      't13a000000000025', null, repeat('f', 64)
    )$$,
  'P0001', 'RATE_LIMITED',
  'join publik ketiga dari ip_hash sama dikunci'
);

update public.app_config
set value = '20'::jsonb
where key = 'public_join_per_ip_per_hour';

-- Rejoin ditolak ROOM_FULL setelah kursi tersisi.
with approved as (
  insert into public.room_members (room_id, handle, handle_verified, status, password_version)
  select r.id, 'full.one', true, 'APPROVED'::public.member_status, r.password_version
  from public.rooms r
  where r.slug = 't13a000000000020'
  returning id
)
select count(*) from approved;

with approved as (
  insert into public.room_members (room_id, handle, handle_verified, status, password_version)
  select r.id, 'full.two', true, 'APPROVED'::public.member_status, r.password_version
  from public.rooms r
  where r.slug = 't13a000000000020'
  returning id
)
select count(*) from approved;

with idle_member as (
  insert into public.room_members (room_id, handle, handle_verified, status, password_version)
  select r.id, 'idle.member10', true,
         'IDLE'::public.member_status, r.password_version
  from public.rooms r
  where r.slug = 't13a000000000020'
  returning id, room_id
)
insert into public.member_identities (member_id, room_id, user_id)
select m.id, m.room_id, 'e1000000-0000-4000-8000-000000000010'
from idle_member m;

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000010', true);

select throws_ok(
  $$select public.rejoin_room(
      (select room_id from public.get_room_public('t13a000000000020'))
    )$$,
  'P0001', 'ROOM_FULL',
  'rejoin_room menolak bila kursi penuh'
);

reset role;

-- Batas lima keanggotaan aktif untuk akun login.
insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'login_1', status::text, room_id, member_id, handle
from public.join_room(
  'e0000000-0000-4000-8000-000000000002', false,
  't13a000000000011', 'ABC234', repeat('1', 64)
);

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'login_2', status::text, room_id, member_id, handle
from public.join_room(
  'e0000000-0000-4000-8000-000000000002', false,
  't13a000000000012', 'ABC234', repeat('2', 64)
);

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'login_3', status::text, room_id, member_id, handle
from public.join_room(
  'e0000000-0000-4000-8000-000000000002', false,
  't13a000000000013', 'ABC234', repeat('3', 64)
);

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'login_4', status::text, room_id, member_id, handle
from public.join_room(
  'e0000000-0000-4000-8000-000000000002', false,
  't13a000000000014', 'ABC234', repeat('4', 64)
);

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'login_5', status::text, room_id, member_id, handle
from public.join_room(
  'e0000000-0000-4000-8000-000000000002', false,
  't13a000000000015', 'ABC234', repeat('5', 64)
);

select is(
  (select count(*)::int from test_joins_t13a
    where key like 'login_%' and status = 'APPROVED'),
  5,
  'akun login bisa menyimpan lima keanggotaan'
);

select throws_ok(
  $$select * from public.join_room(
      'e0000000-0000-4000-8000-000000000002', false,
      't13a000000000016', 'ABC234', repeat('6', 64)
    )$$,
  'P0001', 'MAX_ROOMS_PER_GUEST',
  'keanggotaan aktif login keenam ditolak'
);

set local role authenticated;
select test_helpers_t13a.act_as('e0000000-0000-4000-8000-000000000002', false);

select is(
  (select count(*)::int from public.my_rooms()),
  5,
  'my_rooms menampilkan lima keanggotaan login'
);

select is(
  (select handle from public.my_rooms() limit 1),
  (
    select p.handle
    from public.profiles p
    where p.user_id = 'e0000000-0000-4000-8000-000000000002'
  ),
  'my_rooms memakai handle profil login'
);

select is(
  (select bool_and(not handle_verified) from public.my_rooms()),
  true,
  'handle_verified my_rooms mengikuti profil default'
);

select lives_ok(
  $$select public.leave_room(
      (select room_id from public.get_room_public('t13a000000000011'))
    )$$,
  'akun login keluar dari satu slot'
);

select is(
  (select count(*)::int from public.my_rooms()),
  4,
  'slot login lepas setelah leave_room'
);

reset role;

insert into test_joins_t13a (key, status, room_id, member_id, handle)
select 'login_6', status::text, room_id, member_id, handle
from public.join_room(
  'e0000000-0000-4000-8000-000000000002', false,
  't13a000000000016', 'ABC234', repeat('6', 64)
);

select is(
  (select status from test_joins_t13a where key = 'login_6'),
  'APPROVED',
  'slot keenam bisa dipakai setelah slot lama dilepas'
);

set local role authenticated;
select test_helpers_t13a.act_as('e0000000-0000-4000-8000-000000000002', false);

select is(
  (select count(*)::int from public.my_rooms()),
  5,
  'my_rooms kembali menampilkan lima keanggotaan'
);

reset role;

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select * from public.my_rooms()$$,
  'P0001', 'NOT_MEMBER',
  'my_rooms menolak JWT anonim'
);

reset role;

-- User suspended login tidak bisa join/send.
select throws_ok(
  $$select * from public.join_room(
      'e0000000-0000-4000-8000-000000000003', false,
      't13a000000000017', 'ABC234', repeat('7', 64)
    )$$,
  'P0001', 'USER_SUSPENDED',
  'join_room menolak akun login suspended'
);

set local role authenticated;
select test_helpers_t13a.act_as('e0000000-0000-4000-8000-000000000003', false);

select throws_ok(
  $$select * from public.send_message(
      (select room_id from public.get_room_public('t13a000000000026')),
      'masih bisa?', 'e2000000-0000-4000-8000-000000000003'
    )$$,
  'P0001', 'USER_SUSPENDED',
  'send_message menolak akun login suspended'
);

select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000001', true);

select is(
  (select status from public.get_room_public('t13a000000000010')),
  'CLOSED',
  'get_room_public mengembalikan CLOSED'
);

select is(
  (select typing_effective from public.get_room_public('t13a000000000010')),
  false,
  'typing_effective false untuk room CLOSED'
);

reset role;

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000001', false,
      't13a000000000001', 'ABC234', repeat('1', 64)
    )$$,
  'P0001', 'INVALID_INPUT',
  'p_is_anonymous harus cocok dengan auth.users'
);

select throws_ok(
  $$select * from public.join_room(
      'e0000000-0000-4000-8000-000000000002', true,
      't13a000000000011', 'ABC234', repeat('1', 64)
    )$$,
  'P0001', 'INVALID_INPUT',
  'p_is_anonymous harus cocok dengan akun login'
);

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000001', true,
      't13a000000000001', null, repeat('1', 64)
    )$$,
  'P0001', 'WRONG_PASSWORD',
  'room PRIVATE menolak password null'
);

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000001', true,
      't13a000000000001', 'ABC234', 'terlalu-pendek'
  )$$,
  'P0001', 'INVALID_INPUT',
  'ip_hash pendek ditolak'
);

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000001', true,
      'tidakadasmowy', 'ABC234', repeat('1', 64)
  )$$,
  'P0001', 'ROOM_NOT_FOUND',
  'slug tidak ditemukan mengembalikan ROOM_NOT_FOUND'
);

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000001', true);

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000001', true,
      't13a000000000001', 'ABC234', repeat('1', 64)
    )$$,
  '42501', null,
  'authenticated tidak bisa memanggil join_room'
);

reset role;
set local role anon;

select throws_ok(
  $$select * from public.join_room(
      'e1000000-0000-4000-8000-000000000001', true,
      't13a000000000001', 'ABC234', repeat('1', 64)
    )$$,
  '42501', null,
  'anon tidak bisa memanggil join_room'
);

reset role;

select is(
  (select typing_effective from public.get_room_public('t13a000000000024')),
  true,
  'typing_effective true untuk room publik aktif'
);

select is(
  (select visibility from public.get_room_public('t13a000000000005')),
  'PRIVATE',
  'get_room_public tetap membaca room PRIVATE HIDDEN'
);

set local role authenticated;
select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000005', true);

select throws_ok(
  $$select public.rejoin_room(
      (select room_id from public.get_room_public('t13a000000000005'))
    )$$,
  'P0001', 'NOT_MEMBER',
  'rejoin_room menolak status LEFT'
);

select test_helpers_t13a.act_as('e1000000-0000-4000-8000-000000000006', true);

select throws_ok(
  $$select public.rejoin_room(
      (select room_id from public.get_room_public('t13a000000000021'))
    )$$,
  'P0001', 'NOT_MEMBER',
  'rejoin_room menolak user yang bukan member'
);

reset role;

set local role authenticated;
select test_helpers_t13a.act_as('e0000000-0000-4000-8000-000000000002', false);

select is(
  (select bool_and(room_status = 'ACTIVE') from public.my_rooms()),
  true,
  'my_rooms hanya memuat room ACTIVE'
);

reset role;
