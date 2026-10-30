begin;

create extension if not exists pgtap with schema extensions;

create schema test_helpers_handle;
grant usage on schema test_helpers_handle to authenticated;

create function test_helpers_handle.act_as(p_user uuid, p_anonymous boolean default false)
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

grant execute on function test_helpers_handle.act_as(uuid, boolean) to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 'handle-host@example.com',
    extensions.crypt('hostpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 'handle-login@example.com',
    extensions.crypt('loginpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"anonymous","providers":[]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'a0000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"anonymous","providers":[]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  );

insert into public.rooms (
  slug, host_id, name, password_hash, approval_required, max_guests,
  idle_timeout_minutes, typing_enabled, expires_at, delete_at
)
values
  (
    'handleroom000001',
    'a0000000-0000-4000-8000-000000000001',
    'Handle Room 1',
    extensions.crypt('ABC234', extensions.gen_salt('bf', 10)),
    false, 10, 30, true, now() + interval '7 days', now() + interval '22 days'
  ),
  (
    'handleroom000002',
    'a0000000-0000-4000-8000-000000000001',
    'Handle Room 2',
    extensions.crypt('ABC234', extensions.gen_salt('bf', 10)),
    false, 10, 30, true, now() + interval '7 days', now() + interval '22 days'
  );

update public.app_config set value = '5'::jsonb where key = 'anon_max_active_rooms';

select plan(59);

-- Skema dasar.
select set_eq(
  $$
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
  $$,
  $$
    values
      ('user_id'), ('tier'), ('handle'), ('handle_verified'),
      ('role'), ('suspended'), ('created_at')
  $$,
  'profiles memuat kolom handle/role/suspended'
);

select set_eq(
  $$
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'room_members'
  $$,
  $$
    values
      ('id'), ('room_id'), ('handle'), ('handle_verified'), ('status'),
      ('password_version'), ('created_at'), ('status_changed_at')
  $$,
  'room_members hanya memakai handle, tanpa member_no/display_name'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name = 'handle'
  ),
  'NO',
  'profiles.handle not null'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'profiles_handle_key'
      and conrelid = 'public.profiles'::regclass
  ),
  'handle profil unik'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'profiles_handle_pattern_check'
      and conrelid = 'public.profiles'::regclass
  ),
  'constraint pola handle profil ada'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check'
      and conrelid = 'public.profiles'::regclass
  ),
  'role profil dibatasi user/admin'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'room_members_room_handle_key'
      and conrelid = 'public.room_members'::regclass
  ),
  'handle member unik per room'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'room_members_handle_pattern_check'
      and conrelid = 'public.room_members'::regclass
  ),
  'constraint pola handle member ada'
);

select is(
  (
    select data_type
    from information_schema.columns
    where table_schema = 'public' and table_name = 'messages'
      and column_name = 'sender_badge'
  ),
  'text',
  'messages.sender_badge bertipe text'
);

select ok(
  exists (
    select 1 from pg_constraint
    where conname = 'messages_sender_badge_check'
      and conrelid = 'public.messages'::regclass
  ),
  'sender_badge hanya HOST/VERIFIED/null'
);

select is(
  (
    select count(*)::int
    from information_schema.columns
    where table_schema = 'public'
      and (
        (table_name = 'room_members' and column_name in ('member_no', 'display_name'))
        or (table_name = 'rooms' and column_name = 'member_counter')
      )
  ),
  0,
  'kolom penomoran lama sudah hilang'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and p.proname in ('next_guest_number', 'guest_display_name')
  ),
  0,
  'helper penomoran lama sudah hilang'
);

-- Tabel reserved/history.
select is(
  (select count(*)::int from public.reserved_handles),
  12,
  'reserved_handles berisi 12 kata minimal'
);

select set_eq(
  $$select handle from public.reserved_handles$$,
  $$
    values
      ('admin'), ('host'), ('system'), ('support'), ('moderator'), ('mod'),
      ('staff'), ('official'), ('root'), ('null'), ('undefined'), ('anonymous')
  $$,
  'daftar reserved_handles sesuai kontrak'
);

select set_eq(
  $$
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'handle_history'
  $$,
  $$
    values
      ('id'), ('user_id'), ('old_handle'), ('new_handle'),
      ('changed_by'), ('changed_at')
  $$,
  'handle_history memuat kolom kontrak'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.reserved_handles'::regclass),
  'RLS reserved_handles aktif'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.handle_history'::regclass),
  'RLS handle_history aktif'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename in ('reserved_handles', 'handle_history')
  ),
  0,
  'reserved_handles/handle_history tanpa policy client'
);

select ok(
  not has_table_privilege('authenticated', 'public.reserved_handles', 'SELECT'),
  'authenticated tidak bisa membaca reserved_handles'
);

select ok(
  not has_table_privilege('anon', 'public.handle_history', 'SELECT'),
  'anon tidak bisa membaca handle_history'
);

-- Generator dan trigger profil.
select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.generate_handle()'::regprocedure,
    'EXECUTE'
  ),
  'generate_handle hanya internal'
);

select ok(
  (
    select bool_and(h ~ '^[a-z0-9]{9}$')
    from (
      select app_private.generate_handle() as h
      from generate_series(1, 30)
    ) s
  ),
  'generate_handle selalu pola sistem 9 karakter'
);

select is(
  (
    select count(*)::int
    from (
      select app_private.generate_handle() as h
      from generate_series(1, 30)
    ) s
    join public.reserved_handles r on r.handle = s.h
  ),
  0,
  'generate_handle tidak pernah menghasilkan reserved word'
);

select is(
  (
    select count(*)::int
    from public.profiles
    where user_id in (
      'a0000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000002'
    )
  ),
  2,
  'trigger membuat profil untuk user non-anonim'
);

select is(
  (
    select count(*)::int
    from public.profiles
    where user_id in (
      'a0000000-0000-4000-8000-000000000003',
      'a0000000-0000-4000-8000-000000000004'
    )
  ),
  0,
  'user anonim tidak mendapat profil'
);

select is(
  (
    select count(*)::int
    from public.profiles
    where handle !~ '^[a-z0-9]{9}$'
      and handle !~ '^[a-z0-9._-]{3,24}$'
  ),
  0,
  'semua handle profil valid'
);

select is(
  (select count(*)::int from public.profiles),
  (select count(distinct handle)::int from public.profiles),
  'handle profil unik'
);

-- Aturan handle Admin/reserved dan perlindungan client.
select throws_ok(
  $$
    update public.profiles
    set handle = 'admin', handle_verified = true
    where user_id = 'a0000000-0000-4000-8000-000000000001'
  $$,
  'P0001', 'HANDLE_RESERVED',
  'reserved word ditolak trigger'
);

select throws_ok(
  $$
    update public.profiles
    set handle = 'abcdefghi', handle_verified = true
    where user_id = 'a0000000-0000-4000-8000-000000000001'
  $$,
  '23514', null,
  'pola 9-acak tidak boleh diverifikasi Admin'
);

select throws_ok(
  $$
    update public.profiles
    set handle = 'bem.kampus', handle_verified = false
    where user_id = 'a0000000-0000-4000-8000-000000000001'
  $$,
  '23514', null,
  'handle Admin wajib verified'
);

select lives_ok(
  $$
    update public.profiles
    set handle = 'bem.kampus', handle_verified = true
    where user_id = 'a0000000-0000-4000-8000-000000000001'
  $$,
  'handle Admin non-9-acak + verified diterima'
);

select throws_ok(
  $$
    update public.profiles
    set handle = 'bem.kampus', handle_verified = true
    where user_id = 'a0000000-0000-4000-8000-000000000002'
  $$,
  '23505', null,
  'handle profil duplikat ditolak'
);

set local role authenticated;
select test_helpers_handle.act_as('a0000000-0000-4000-8000-000000000002', false);

select is(
  (select count(*)::int from public.profiles),
  1,
  'client hanya membaca profil sendiri'
);

select throws_ok(
  $$
    update public.profiles
    set handle = 'client.handle', handle_verified = true
    where user_id = 'a0000000-0000-4000-8000-000000000002'
  $$,
  '42501', null,
  'client tidak bisa UPDATE profiles'
);

select throws_ok(
  $$
    update public.profiles
    set role = 'admin'
    where user_id = 'a0000000-0000-4000-8000-000000000002'
  $$,
  '42501', null,
  'client tidak bisa mengubah role'
);

select throws_ok(
  $$select * from public.reserved_handles$$,
  '42501', null,
  'client tidak bisa membaca reserved_handles'
);

select throws_ok(
  $$select * from public.handle_history$$,
  '42501', null,
  'client tidak bisa membaca handle_history'
);

reset role;

-- Handle room: duplikat, pola, login, dan anonim per room.
select throws_ok(
  $$
    insert into public.room_members (room_id, handle, status, password_version)
    select id, 't00000001', 'APPROVED'::public.member_status, password_version
    from public.rooms where slug = 'handleroom000001';

    insert into public.room_members (room_id, handle, status, password_version)
    select id, 't00000001', 'APPROVED'::public.member_status, password_version
    from public.rooms where slug = 'handleroom000001'
  $$,
  '23505', null,
  'handle member unik per room'
);

select throws_ok(
  $$
    insert into public.room_members (room_id, handle, status, password_version)
    select id, 'Guest-01', 'APPROVED'::public.member_status, password_version
    from public.rooms where slug = 'handleroom000001'
  $$,
  '23514', null,
  'handle member lama berpola nomor ditolak'
);

create temporary table test_handles (
  key text primary key,
  handle text not null
) on commit drop;

insert into test_handles (key, handle)
select 'anon1_room1', display_name
from public.join_room(
  'a0000000-0000-4000-8000-000000000003',
  'handleroom000001', 'ABC234', repeat('1', 64)
);

select is(
  (
    select m.handle
    from public.member_identities mi
    join public.room_members m on m.id = mi.member_id
    join public.rooms r on r.id = mi.room_id
    where mi.user_id = 'a0000000-0000-4000-8000-000000000003'
      and r.slug = 'handleroom000001'
  ),
  (select handle from test_handles where key = 'anon1_room1'),
  'join pertama menyimpan handle anonim'
);

select is(
  (
    select display_name
    from public.join_room(
      'a0000000-0000-4000-8000-000000000003',
      'handleroom000001', 'ABC234', repeat('2', 64)
    )
  ),
  (select handle from test_handles where key = 'anon1_room1'),
  'handle anonim dipertahankan saat kembali ke room yang sama'
);

insert into test_handles (key, handle)
select 'anon1_room2', display_name
from public.join_room(
  'a0000000-0000-4000-8000-000000000003',
  'handleroom000002', 'ABC234', repeat('3', 64)
);

select isnt(
  (select handle from test_handles where key = 'anon1_room1'),
  (select handle from test_handles where key = 'anon1_room2'),
  'handle anonim berbeda untuk room berbeda'
);

select ok(
  (select handle from test_handles where key = 'anon1_room1') ~ '^[a-z0-9]{9}$',
  'handle anonim room 1 berpola sistem'
);

select ok(
  (select handle from test_handles where key = 'anon1_room2') ~ '^[a-z0-9]{9}$',
  'handle anonim room 2 berpola sistem'
);

select isnt(
  (select handle from test_handles where key = 'anon1_room1'),
  (
    select p.handle from public.profiles p
    where p.user_id = 'a0000000-0000-4000-8000-000000000001'
  ),
  'handle anonim tidak bentrok dengan handle Host'
);

select is(
  (
    select display_name
    from public.join_room(
      'a0000000-0000-4000-8000-000000000002',
      'handleroom000001', 'ABC234', repeat('4', 64)
    )
  ),
  (
    select p.handle from public.profiles p
    where p.user_id = 'a0000000-0000-4000-8000-000000000002'
  ),
  'handle login disalin dari profiles'
);

-- Snapshot handle + badge pesan.
set local role authenticated;
select test_helpers_handle.act_as('a0000000-0000-4000-8000-000000000003', true);

select lives_ok(
  $$select * from public.send_message(
      (select room_id from public.get_room_public('handleroom000001')),
      'pesan anonim', 'a0000000-0000-4000-8000-000000000101'
    )$$,
  'Guest anonim bisa mengirim pesan'
);

reset role;

select is(
  (
    select sender_name
    from public.messages
    where client_msg_id = 'a0000000-0000-4000-8000-000000000101'
  ),
  (select handle from test_handles where key = 'anon1_room1'),
  'sender_name Guest memakai snapshot handle'
);

select is(
  (
    select sender_badge
    from public.messages
    where client_msg_id = 'a0000000-0000-4000-8000-000000000101'
  ),
  null,
  'Guest belum verified tidak berbadge'
);

update public.room_members m
set handle = 'org.kampus', handle_verified = true
where m.id = (
  select mi.member_id
  from public.member_identities mi
  where mi.user_id = 'a0000000-0000-4000-8000-000000000003'
    and mi.room_id = (select room_id from public.get_room_public('handleroom000001'))
);

set local role authenticated;
select test_helpers_handle.act_as('a0000000-0000-4000-8000-000000000003', true);

select lives_ok(
  $$select * from public.send_message(
      (select room_id from public.get_room_public('handleroom000001')),
      'pesan verified', 'a0000000-0000-4000-8000-000000000102'
    )$$,
  'Guest verified bisa mengirim pesan'
);

reset role;

select is(
  (
    select sender_badge
    from public.messages
    where client_msg_id = 'a0000000-0000-4000-8000-000000000102'
  ),
  'VERIFIED',
  'Guest verified mendapat badge VERIFIED'
);

set local role authenticated;
select test_helpers_handle.act_as('a0000000-0000-4000-8000-000000000001', false);

select lives_ok(
  $$select * from public.send_message(
      (select room_id from public.get_room_public('handleroom000001')),
      'pesan host', 'a0000000-0000-4000-8000-000000000103'
    )$$,
  'Host bisa mengirim pesan'
);

reset role;

select is(
  (
    select sender_name
    from public.messages
    where client_msg_id = 'a0000000-0000-4000-8000-000000000103'
  ),
  (
    select p.handle from public.profiles p
    where p.user_id = 'a0000000-0000-4000-8000-000000000001'
  ),
  'sender_name Host memakai handle Host'
);

select is(
  (
    select sender_badge
    from public.messages
    where client_msg_id = 'a0000000-0000-4000-8000-000000000103'
  ),
  'HOST',
  'Host mendapat badge HOST'
);

select throws_ok(
  $$
    update public.messages
    set sender_badge = 'ADMIN'
    where client_msg_id = 'a0000000-0000-4000-8000-000000000103'
  $$,
  '23514', null,
  'sender_badge di luar HOST/VERIFIED ditolak'
);

select is(
  (
    select count(*)::int
    from public.room_members
    where handle ~ '^Guest-[0-9]+$'
  ),
  0,
  'tidak ada handle member bernomor'
);

select is(
  (
    select count(*)::int
    from public.messages
    where sender_name ~ '^Guest-[0-9]+$'
  ),
  0,
  'tidak ada snapshot pesan bernomor'
);

select lives_ok(
  $$
    insert into public.handle_history (
      user_id, old_handle, new_handle, changed_by
    )
    values (
      'a0000000-0000-4000-8000-000000000001',
      'old.handle', 'bem.kampus',
      'a0000000-0000-4000-8000-000000000001'
    )
  $$,
  'handle_history bisa menerima catatan rename'
);

select is(
  (select count(*)::int from public.handle_history),
  1,
  'handle_history menyimpan riwayat'
);

select * from finish();
rollback;
