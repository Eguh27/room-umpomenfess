begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

-- Kolom baru pada rooms.
select set_eq(
  $$
    select column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rooms'
      and column_name in (
        'visibility', 'description', 'category', 'listing_status', 'listed_at'
      )
  $$,
  $$
    values
      ('visibility'), ('description'), ('category'),
      ('listing_status'), ('listed_at')
  $$,
  'kolom visibilitas/metadata FYP ada di rooms'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'rooms'
      and column_name = 'password_hash'
  ),
  'YES',
  'password_hash nullable untuk room PUBLIC'
);

select is(
  (
    select data_type
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tier_limits'
      and column_name = 'max_public_rooms'
  ),
  'integer',
  'tier_limits.max_public_rooms bertipe integer'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'tier_limits'
      and column_name = 'max_public_rooms'
  ),
  'NO',
  'tier_limits.max_public_rooms not null'
);

select is(
  (select max_public_rooms from public.tier_limits where tier = 'free'),
  1,
  'kuota publik tier free = 1'
);

select is(
  (select max_public_rooms from public.tier_limits where tier = 'premium'),
  3,
  'kuota publik tier premium = 3'
);

-- Tabel statistik dan laporan.
select set_eq(
  $$
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'room_stats'
  $$,
  $$
    values
      ('room_id'), ('approved_count'), ('messages_last_hour'),
      ('last_message_at'), ('updated_at')
  $$,
  'kolom room_stats sesuai kontrak'
);

select set_eq(
  $$
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = 'room_reports'
  $$,
  $$
    values
      ('id'), ('room_id'), ('reporter_user_id'), ('reason'), ('created_at')
  $$,
  'kolom room_reports sesuai kontrak'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.room_stats'::regclass
  ),
  'RLS room_stats aktif'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.room_reports'::regclass
  ),
  'RLS room_reports aktif'
);

select is(
  (
    select count(*)::int
    from pg_policies
    where schemaname = 'public'
      and tablename in ('room_stats', 'room_reports')
  ),
  0,
  'room_stats/room_reports tidak punya policy client'
);

select ok(
  not has_table_privilege('anon', 'public.room_stats', 'SELECT'),
  'anon tidak punya SELECT room_stats'
);

select ok(
  not has_table_privilege('authenticated', 'public.room_reports', 'SELECT'),
  'authenticated tidak punya SELECT room_reports'
);

select is(
  (
    select count(*)::int
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename in ('room_stats', 'room_reports')
  ),
  0,
  'room_stats/room_reports tidak masuk publication Realtime'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'rooms_visibility_password_check'
      and conrelid = 'public.rooms'::regclass
  ),
  'CHECK kesetaraan visibility/password_hash terpasang'
);

-- Uji perilaku CHECK: PUBLIC tanpa password boleh, PRIVATE tanpa password ditolak.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  '99999999-9999-4999-8999-999999999999',
  'authenticated', 'authenticated', 't10a-host@example.com',
  extensions.crypt('hostpass', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  now(), now(), false
);

select lives_ok(
  $$
    insert into public.rooms (
      slug, host_id, name, password_hash, visibility, approval_required,
      max_guests, typing_enabled, expires_at, delete_at
    )
    values (
      'testpublic000001',
      '99999999-9999-4999-8999-999999999999',
      'Public test', null, 'PUBLIC', false, 2, false,
      now() + interval '1 day', now() + interval '2 days'
    )
  $$,
  'room PUBLIC tanpa password diterima'
);

select throws_ok(
  $$
    insert into public.rooms (
      slug, host_id, name, password_hash, visibility, approval_required,
      max_guests, typing_enabled, expires_at, delete_at
    )
    values (
      'testpublic000002',
      '99999999-9999-4999-8999-999999999999',
      'Public with password', 'x', 'PUBLIC', false, 2, false,
      now() + interval '1 day', now() + interval '2 days'
    )
  $$,
  '23514', null,
  'room PUBLIC dengan password ditolak'
);

select throws_ok(
  $$
    insert into public.rooms (
      slug, host_id, name, password_hash, visibility, approval_required,
      max_guests, typing_enabled, expires_at, delete_at
    )
    values (
      'testprivate00002',
      '99999999-9999-4999-8999-999999999999',
      'Private without password', null, 'PRIVATE', false, 2, false,
      now() + interval '1 day', now() + interval '2 days'
    )
  $$,
  '23514', null,
  'room PRIVATE tanpa password ditolak'
);

select lives_ok(
  $$
    insert into public.rooms (
      slug, host_id, name, password_hash, visibility, approval_required,
      max_guests, typing_enabled, expires_at, delete_at
    )
    values (
      'testprivate00001',
      '99999999-9999-4999-8999-999999999999',
      'Private with password', 'x', 'PRIVATE', false, 2, false,
      now() + interval '1 day', now() + interval '2 days'
    )
  $$,
  'room PRIVATE dengan password diterima'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'room_reports_room_reporter_key'
      and conrelid = 'public.room_reports'::regclass
      and contype = 'u'
  ),
  'laporan unik per (room, reporter)'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conname = 'room_reports_reason_check'
      and conrelid = 'public.room_reports'::regclass
      and contype = 'c'
  ),
  'reason laporan dibatasi enum teks'
);

-- Konfigurasi baru.
select is(
  (
    select count(*)::int
    from public.app_config
    where key in (
      'anon_max_active_rooms', 'login_max_active_rooms',
      'public_rooms_enabled', 'public_join_per_ip_per_hour',
      'report_hide_threshold', 'public_idle_default_minutes',
      'feed_cache_seconds', 'public_description_max', 'categories'
    )
  ),
  9,
  'sembilan kunci app_config baru ter-seed'
);

select set_eq(
  $$
    select key || '=' || (value #>> '{}')
    from public.app_config
    where key in (
      'anon_max_active_rooms', 'login_max_active_rooms',
      'public_rooms_enabled', 'public_join_per_ip_per_hour',
      'report_hide_threshold', 'public_idle_default_minutes',
      'feed_cache_seconds', 'public_description_max'
    )
  $$,
  $$
    values
      ('anon_max_active_rooms=1'),
      ('login_max_active_rooms=5'),
      ('public_rooms_enabled=false'),
      ('public_join_per_ip_per_hour=20'),
      ('report_hide_threshold=3'),
      ('public_idle_default_minutes=15'),
      ('feed_cache_seconds=30'),
      ('public_description_max=200')
  $$,
  'nilai kunci app_config baru sesuai TASK'
);

select is(
  (select value from public.app_config where key = 'categories'),
  '["umum", "kampus", "hobi", "curhat", "game", "belajar", "lainnya"]'::jsonb,
  'kategori FYP ter-seed'
);

select is(
  (
    select count(*)::int
    from public.app_config
    where key = 'max_rooms_per_guest'
  ),
  0,
  'kunci lama max_rooms_per_guest sudah dihapus'
);

select ok(
  not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'app_private')
      and p.prosrc like '%max_rooms_per_guest%'
  ),
  'tidak ada fungsi aplikasi yang masih memakai max_rooms_per_guest'
);

select * from finish();
rollback;
