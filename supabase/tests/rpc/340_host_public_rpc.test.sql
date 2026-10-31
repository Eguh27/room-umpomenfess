begin;

create extension if not exists pgtap with schema extensions;

create schema test_helpers_t12a;
grant usage on schema test_helpers_t12a to authenticated;

create function test_helpers_t12a.act_as(p_user uuid, p_anonymous boolean default false)
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

grant execute on function test_helpers_t12a.act_as(uuid, boolean) to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 't12a-host@example.com',
    extensions.crypt('hostpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 't12a-unconfirmed@example.com',
    extensions.crypt('hostpass', extensions.gen_salt('bf')), null,
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'c0000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 't12a-suspended@example.com',
    extensions.crypt('hostpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  );

update public.profiles
set suspended = true
where user_id = 'c0000000-0000-4000-8000-000000000003';

create temporary table test_rooms_t12a (
  key text primary key,
  room_id uuid not null,
  password text,
  slug text
) on commit drop;

grant select, insert on test_rooms_t12a to authenticated;

select plan(45);

set local role authenticated;
select test_helpers_t12a.act_as('c0000000-0000-4000-8000-000000000001', false);

insert into test_rooms_t12a (key, room_id, password, slug)
select 'private_one', room_id, password, slug
from public.create_room('Private One', 5, false, null, true);

select is(
  (select length(password) from test_rooms_t12a where key = 'private_one'),
  6,
  'create_room PRIVATE mengembalikan password 6 karakter'
);

select is(
  (
    select r.visibility
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'private_one'
  ),
  'PRIVATE',
  'create_room default PRIVATE'
);

select is(
  (
    select r.idle_timeout_minutes
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'private_one'
  ),
  30,
  'idle default PRIVATE = 30'
);

reset role;
select ok(
  (
    select r.password_hash is not null
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'private_one'
  ),
  'room PRIVATE punya password_hash'
);

set local role authenticated;
select test_helpers_t12a.act_as('c0000000-0000-4000-8000-000000000001', false);

select throws_ok(
  $$select * from public.create_room(
      'Bad Visibility', 5, false, null, true, 'SECRET'
    )$$,
  'P0001', 'INVALID_INPUT',
  'visibilitas di luar PRIVATE/PUBLIC ditolak'
);

select throws_ok(
  $$select * from public.create_room(
      'Bad Category', 5, false, null, true, 'PRIVATE', null, 'nope'
    )$$,
  'P0001', 'INVALID_INPUT',
  'kategori di luar daftar ditolak'
);

select throws_ok(
  $$select * from public.create_room(
      'Long Description', 5, false, null, true, 'PRIVATE', repeat('x', 201)
    )$$,
  'P0001', 'INVALID_INPUT',
  'deskripsi melebihi batas ditolak'
);

select throws_ok(
  $$select * from public.create_room(
      'Public Off', 5, false, null, true, 'PUBLIC'
    )$$,
  'P0001', 'FEATURE_DISABLED',
  'room PUBLIC ditolak saat flag FYP mati'
);

reset role;
update public.app_config
set value = 'true'::jsonb
where key = 'public_rooms_enabled';

set local role authenticated;
select test_helpers_t12a.act_as('c0000000-0000-4000-8000-000000000001', false);

insert into test_rooms_t12a (key, room_id, password, slug)
select 'public_one', room_id, password, slug
from public.create_room(
  'Public One', 5, false, null, true, 'PUBLIC',
  'Deskripsi publik', 'umum'
);

select is(
  (select password from test_rooms_t12a where key = 'public_one'),
  null,
  'create_room PUBLIC mengembalikan password null'
);

select is(
  (
    select r.visibility
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'public_one'
  ),
  'PUBLIC',
  'room PUBLIC tersimpan'
);

select is(
  (
    select r.idle_timeout_minutes
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'public_one'
  ),
  15,
  'idle default PUBLIC = 15'
);

select is(
  (
    select r.listing_status
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'public_one'
  ),
  'LISTED',
  'room PUBLIC langsung LISTED'
);

select ok(
  (
    select r.listed_at is not null
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'public_one'
  ),
  'room PUBLIC punya listed_at'
);

select is(
  (
    select r.description || '|' || r.category
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'public_one'
  ),
  'Deskripsi publik|umum',
  'deskripsi dan kategori tersimpan'
);

select throws_ok(
  $$select * from public.create_room(
      'Public Two', 5, false, null, true, 'PUBLIC'
    )$$,
  'P0001', 'PUBLIC_QUOTA_REACHED',
  'kuota publik free = 1'
);

select test_helpers_t12a.act_as('c0000000-0000-4000-8000-000000000002', false);
select throws_ok(
  $$select * from public.create_room(
      'Unconfirmed Public', 5, false, null, true, 'PUBLIC'
    )$$,
  'P0001', 'EMAIL_NOT_CONFIRMED',
  'email belum terkonfirmasi tidak boleh membuat room PUBLIC'
);

select test_helpers_t12a.act_as('c0000000-0000-4000-8000-000000000003', false);
select throws_ok(
  $$select * from public.create_room('Suspended Private', 5, false, null, true)$$,
  'P0001', 'USER_SUSPENDED',
  'Host suspended tidak boleh membuat room'
);

select test_helpers_t12a.act_as('c0000000-0000-4000-8000-000000000001', false);

select is(
  (select length(public.make_room_private(
    (select room_id from test_rooms_t12a where key = 'public_one')
  ))),
  6,
  'make_room_private mengembalikan password 6 karakter'
);

select is(
  (
    select r.visibility
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'public_one'
  ),
  'PRIVATE',
  'make_room_private mengubah visibilitas'
);

select is(
  (
    select r.listing_status
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'public_one'
  ),
  'HIDDEN',
  'make_room_private menyembunyikan dari FYP'
);

select ok(
  (
    select r.listed_at is null
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'public_one'
  ),
  'make_room_private menghapus listed_at'
);

select is(
  (
    select r.password_version
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'public_one'
  ),
  2,
  'make_room_private menaikkan password_version'
);

select is(
  (select length(public.regenerate_password(
    (select room_id from test_rooms_t12a where key = 'public_one')
  ))),
  6,
  'regenerate_password tetap bekerja untuk room PRIVATE'
);

select is(
  (
    select r.password_version
    from public.rooms r
    join test_rooms_t12a t on t.room_id = r.id
    where t.key = 'public_one'
  ),
  3,
  'regenerate_password menaikkan password_version'
);

insert into test_rooms_t12a (key, room_id, password, slug)
select 'public_two', room_id, password, slug
from public.create_room('Public Two', 5, false, null, true, 'PUBLIC');

select throws_ok(
  $$select public.regenerate_password(
    (select room_id from test_rooms_t12a where key = 'public_two')
  )$$,
  'P0001', 'INVALID_INPUT',
  'regenerate_password menolak room PUBLIC'
);

select throws_ok(
  $$select public.make_room_private(
    (select room_id from test_rooms_t12a where key = 'private_one')
  )$$,
  'P0001', 'INVALID_INPUT',
  'make_room_private menolak room yang sudah PRIVATE'
);

select is(
  (
    select visibility
    from public.update_room_settings(
      (select room_id from test_rooms_t12a where key = 'private_one'),
      null, null, null, null, 'PRIVATE'
    )
  ),
  'PRIVATE',
  'update_room_settings menerima visibilitas yang sama'
);

select throws_ok(
  $$select * from public.update_room_settings(
      (select room_id from test_rooms_t12a where key = 'private_one'),
      null, null, null, null, 'PUBLIC'
    )$$,
  'P0001', 'VISIBILITY_LOCKED',
  'update_room_settings menolak privat menjadi publik'
);

select throws_ok(
  $$select * from public.update_room_settings(
      (select room_id from test_rooms_t12a where key = 'private_one'),
      null, null, null, null, 'SECRET'
    )$$,
  'P0001', 'INVALID_INPUT',
  'update_room_settings menolak visibilitas tidak valid'
);

select is(
  (select count(*)::int from public.list_hosted_rooms()),
  3,
  'list_hosted_rooms menampilkan tiga room'
);

select is(
  (select distinct quota ->> 'used' from public.list_hosted_rooms()),
  '3',
  'quota room used = 3'
);

select is(
  (select distinct quota ->> 'max' from public.list_hosted_rooms()),
  '3',
  'quota room max = 3'
);

select is(
  (select distinct public_quota ->> 'used' from public.list_hosted_rooms()),
  '1',
  'public_quota used = 1'
);

select is(
  (select distinct public_quota ->> 'max' from public.list_hosted_rooms()),
  '1',
  'public_quota max = 1'
);

select is(
  (
    select visibility || '|' || listing_status
    from public.list_hosted_rooms()
    where name = 'Public Two'
  ),
  'PUBLIC|LISTED',
  'list_hosted_rooms memuat visibility/listing_status publik'
);

select is(
  (
    select listing_status
    from public.list_hosted_rooms()
    where name = 'Public One'
  ),
  'HIDDEN',
  'list_hosted_rooms memuat status HIDDEN setelah make_room_private'
);

reset role;

insert into public.room_members (
  room_id, handle, handle_verified, status, password_version
)
select r.id, 'member.one', true, 'PENDING'::public.member_status, r.password_version
from public.rooms r
join test_rooms_t12a t on t.room_id = r.id
where t.key = 'private_one';

set local role authenticated;
select test_helpers_t12a.act_as('c0000000-0000-4000-8000-000000000001', false);

select is(
  (select count(*)::int from public.list_members(
    (select room_id from test_rooms_t12a where key = 'private_one')
  )),
  1,
  'list_members menampilkan member'
);

select is(
  (select handle from public.list_members(
    (select room_id from test_rooms_t12a where key = 'private_one')
  )),
  'member.one',
  'list_members memakai handle'
);

select is(
  (select handle_verified from public.list_members(
    (select room_id from test_rooms_t12a where key = 'private_one')
  )),
  true,
  'list_members memuat handle_verified'
);

select set_eq(
  $$
    select a.name
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) as a(name, mode)
    where p.oid = 'public.list_members(uuid)'::regprocedure
      and a.mode = 't'
  $$,
  $$
    values ('id'), ('handle'), ('handle_verified'), ('status'), ('created_at')
  $$,
  'list_members tidak mengembalikan user_id/display_name'
);

create temporary table test_decision_t12a on commit drop as
select *
from public.decide_member(
  (
    select m.id from public.room_members m
    join test_rooms_t12a t on t.room_id = m.room_id
    where t.key = 'private_one'
  ),
  'APPROVE'
);

select is(
  (select status::text from test_decision_t12a),
  'APPROVED',
  'decide_member APPROVE memberi status APPROVED'
);

select is(
  (select handle from test_decision_t12a),
  'member.one',
  'decide_member mengembalikan handle'
);

select is(
  (select handle_verified from test_decision_t12a),
  true,
  'decide_member mengembalikan handle_verified'
);

select set_eq(
  $$
    select a.name
    from pg_proc p
    cross join lateral unnest(p.proargnames, p.proargmodes) as a(name, mode)
    where p.oid = 'public.decide_member(uuid,text)'::regprocedure
      and a.mode = 't'
  $$,
  $$
    values ('id'), ('handle'), ('handle_verified'), ('status')
  $$,
  'decide_member tidak mengembalikan display_name'
);

reset role;

insert into public.messages (
  room_id, sender_type, member_id, sender_name, sender_badge, content, client_msg_id
)
select r.id, 'HOST', null, 'host.handle', 'HOST', 'halo', 'd0000000-0000-4000-8000-000000000001'
from public.rooms r
join test_rooms_t12a t on t.room_id = r.id
where t.key = 'private_one';

set local role authenticated;
select test_helpers_t12a.act_as('c0000000-0000-4000-8000-000000000001', false);

select is(
  (
    select sender_badge
    from public.export_messages(
      (select room_id from test_rooms_t12a where key = 'private_one')
    )
    where client_msg_id = 'd0000000-0000-4000-8000-000000000001'
  ),
  'HOST',
  'export_messages membawa sender_badge'
);

reset role;

select * from finish();
rollback;
