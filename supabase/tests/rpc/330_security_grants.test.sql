begin;

create extension if not exists pgtap with schema extensions;

create schema test_helpers_t11a;
grant usage on schema test_helpers_t11a to authenticated;

create function test_helpers_t11a.act_as(
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

grant execute on function test_helpers_t11a.act_as(uuid, boolean, text)
  to authenticated;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-4000-8000-000000000001',
    'authenticated', 'authenticated', 't11a-admin@example.com',
    extensions.crypt('adminpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-4000-8000-000000000002',
    'authenticated', 'authenticated', 't11a-user@example.com',
    extensions.crypt('userpass', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-4000-8000-000000000003',
    'authenticated', 'authenticated', 't11a-unconfirmed@example.com',
    extensions.crypt('userpass', extensions.gen_salt('bf')), null,
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
    now(), now(), false
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    'b0000000-0000-4000-8000-000000000004',
    'authenticated', 'authenticated', null, null, null,
    '{"provider":"anonymous","providers":[]}'::jsonb, '{}'::jsonb,
    now(), now(), true
  );

update public.profiles
set role = 'admin'
where user_id = 'b0000000-0000-4000-8000-000000000001';

select plan(43);

-- Katalog S-15.
select is(
  (
    select count(*)::int
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and not c.relrowsecurity
  ),
  0,
  'semua tabel public mengaktifkan RLS'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}'::text[])) as cfg
        where cfg like 'search_path=%'
      )
  ),
  0,
  'semua fungsi SECURITY DEFINER memasang search_path'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and has_function_privilege('anon', p.oid, 'EXECUTE')
  ),
  0,
  'role anon tidak punya EXECUTE pada fungsi aplikasi'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(
      coalesce(p.proacl, acldefault('f', p.proowner))
    ) a
    where n.nspname in ('public', 'app_private')
      and a.grantee = 0
      and a.privilege_type = 'EXECUTE'
  ),
  0,
  'PUBLIC tidak punya EXECUTE pada fungsi aplikasi'
);

-- Profil: hanya SELECT baris sendiri.
select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'authenticated punya SELECT profiles'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'INSERT'),
  'authenticated tidak punya INSERT profiles'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated tidak punya UPDATE profiles'
);

select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'DELETE'),
  'authenticated tidak punya DELETE profiles'
);

select ok(
  not has_table_privilege('anon', 'public.profiles', 'SELECT'),
  'anon tidak punya SELECT profiles'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
  ),
  1,
  'profiles hanya punya policy SELECT'
);

-- Tabel baru: RLS aktif, tanpa policy, tanpa grant.
select ok(
  (select relrowsecurity from pg_class where oid = 'public.room_stats'::regclass),
  'RLS room_stats aktif'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.room_reports'::regclass),
  'RLS room_reports aktif'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.handle_history'::regclass),
  'RLS handle_history aktif'
);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.reserved_handles'::regclass),
  'RLS reserved_handles aktif'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'room_stats', 'room_reports', 'handle_history', 'reserved_handles'
      )
  ),
  0,
  'tabel baru tidak punya policy client'
);

select ok(
  not has_table_privilege('authenticated', 'public.room_stats', 'SELECT'),
  'authenticated tidak punya SELECT room_stats'
);

select ok(
  not has_table_privilege('authenticated', 'public.room_reports', 'SELECT'),
  'authenticated tidak punya SELECT room_reports'
);

select ok(
  not has_table_privilege('authenticated', 'public.handle_history', 'SELECT'),
  'authenticated tidak punya SELECT handle_history'
);

select ok(
  not has_table_privilege('authenticated', 'public.reserved_handles', 'SELECT'),
  'authenticated tidak punya SELECT reserved_handles'
);

select is(
  (
    select count(*)::int
    from (values
      ('room_stats'), ('room_reports'), ('handle_history'), ('reserved_handles')
    ) as t(tablename)
    where has_table_privilege('anon', format('public.%I', t.tablename), 'SELECT')
  ),
  0,
  'anon tidak punya SELECT tabel baru'
);

select is(
  (
    select count(*)::int
    from (values
      ('public.room_reports_id_seq'), ('public.handle_history_id_seq')
    ) as s(sequence_name)
    where has_sequence_privilege('authenticated', s.sequence_name, 'USAGE')
  ),
  0,
  'authenticated tidak punya USAGE sequence baru'
);

select is(
  (
    select count(*)::int
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_stats'
  ),
  0,
  'room_stats tidak masuk publication Realtime'
);

-- Helper Admin/email.
select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'app_private.is_admin_aal2()'::regprocedure
  ),
  'is_admin_aal2 SECURITY DEFINER'
);

select is(
  (
    select provolatile::text
    from pg_proc
    where oid = 'app_private.is_admin_aal2()'::regprocedure
  ),
  's',
  'is_admin_aal2 STABLE'
);

select ok(
  (
    select exists (
      select 1
      from unnest(coalesce(proconfig, '{}'::text[])) as cfg
      where cfg like 'search_path=%'
    )
    from pg_proc
    where oid = 'app_private.is_admin_aal2()'::regprocedure
  ),
  'is_admin_aal2 memasang search_path'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'app_private.is_email_confirmed()'::regprocedure
  ),
  'is_email_confirmed SECURITY DEFINER'
);

select is(
  (
    select provolatile::text
    from pg_proc
    where oid = 'app_private.is_email_confirmed()'::regprocedure
  ),
  's',
  'is_email_confirmed STABLE'
);

select ok(
  (
    select exists (
      select 1
      from unnest(coalesce(proconfig, '{}'::text[])) as cfg
      where cfg like 'search_path=%'
    )
    from pg_proc
    where oid = 'app_private.is_email_confirmed()'::regprocedure
  ),
  'is_email_confirmed memasang search_path'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app_private'
      and p.proname in ('is_admin_aal2', 'is_email_confirmed')
      and (
        has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
  ),
  0,
  'helper Admin/email tidak bisa dipanggil client'
);

-- Perilaku helper.
select test_helpers_t11a.act_as(
  'b0000000-0000-4000-8000-000000000001', false, 'aal1'
);
select is(
  app_private.is_admin_aal2(),
  false,
  'admin tanpa AAL2 ditolak helper'
);

select test_helpers_t11a.act_as(
  'b0000000-0000-4000-8000-000000000001', false, 'aal2'
);
select is(
  app_private.is_admin_aal2(),
  true,
  'admin dengan AAL2 diterima helper'
);

select test_helpers_t11a.act_as(
  'b0000000-0000-4000-8000-000000000002', false, 'aal2'
);
select is(
  app_private.is_admin_aal2(),
  false,
  'user biasa dengan AAL2 bukan admin'
);

select set_config('request.jwt.claims', '{}', true);
select set_config('request.jwt.claim.sub', '', true);
select is(
  app_private.is_admin_aal2(),
  false,
  'tanpa auth.uid helper admin false'
);

select test_helpers_t11a.act_as(
  'b0000000-0000-4000-8000-000000000001', false, 'aal1'
);
select is(
  app_private.is_email_confirmed(),
  true,
  'email terkonfirmasi diterima helper'
);

select test_helpers_t11a.act_as(
  'b0000000-0000-4000-8000-000000000003', false, 'aal1'
);
select is(
  app_private.is_email_confirmed(),
  false,
  'email belum terkonfirmasi ditolak helper'
);

select test_helpers_t11a.act_as(
  'b0000000-0000-4000-8000-000000000004', true, 'aal1'
);
select is(
  app_private.is_email_confirmed(),
  false,
  'user anonim tidak dianggap email terkonfirmasi'
);

-- Client: SELECT sendiri, semua tulis/akses tabel baru ditolak.
set local role authenticated;
select test_helpers_t11a.act_as(
  'b0000000-0000-4000-8000-000000000002', false, 'aal1'
);

select is(
  (select count(*)::int from public.profiles),
  1,
  'client hanya membaca profil sendiri'
);

select is(
  (
    select count(*)::int
    from public.profiles
    where user_id = 'b0000000-0000-4000-8000-000000000001'
  ),
  0,
  'client tidak membaca profil user lain'
);

select throws_ok(
  $$
    update public.profiles
    set handle = 'client.handle', handle_verified = true
    where user_id = 'b0000000-0000-4000-8000-000000000002'
  $$,
  '42501', null,
  'client tidak bisa UPDATE profiles'
);

select throws_ok(
  $$select * from public.room_stats$$,
  '42501', null,
  'client tidak bisa SELECT room_stats'
);

select throws_ok(
  $$select * from public.room_reports$$,
  '42501', null,
  'client tidak bisa SELECT room_reports'
);

select throws_ok(
  $$select * from public.handle_history$$,
  '42501', null,
  'client tidak bisa SELECT handle_history'
);

select throws_ok(
  $$select * from public.reserved_handles$$,
  '42501', null,
  'client tidak bisa SELECT reserved_handles'
);

reset role;

select * from finish();
rollback;
