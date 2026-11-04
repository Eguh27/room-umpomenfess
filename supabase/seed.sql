-- Seed development. Jangan dipakai di produksi.
-- Host dev: dev@example.com / devpassword
-- Room dev: slug `devroom000000001`, password `ABC234`.

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'dev@example.com',
  extensions.crypt('devpassword', extensions.gen_salt('bf')),
  now(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false
)
on conflict (id) do nothing;

insert into public.rooms (
  slug, host_id, name, password_hash, approval_required, max_guests,
  idle_timeout_minutes, typing_enabled, created_at, expires_at, delete_at
)
select
  'devroom000000001',
  '00000000-0000-4000-8000-000000000001',
  'Room Development',
  extensions.crypt('ABC234', extensions.gen_salt('bf', 10)),
  false,
  10,
  30,
  true,
  now(),
  now() + interval '7 days',
  now() + interval '22 days'
where not exists (
  select 1 from public.rooms where slug = 'devroom000000001'
);

-- Host kedua untuk menguji isolasi antarahost.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000002',
  'authenticated',
  'authenticated',
  'dev2@example.com',
  extensions.crypt('devpassword', extensions.gen_salt('bf')),
  now(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false
)
on conflict (id) do nothing;

-- Host ketiga (terkonfirmasi): jadi member room publik dan pelapor.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-8000-000000000003',
  'authenticated',
  'authenticated',
  'dev3@example.com',
  extensions.crypt('devpassword', extensions.gen_salt('bf')),
  now(),
  '', '', '', '',
  '{"provider":"email","providers":["email"]}'::jsonb,
  '{}'::jsonb,
  now(),
  now(),
  false
)
on conflict (id) do nothing;

-- Room publik LISTED untuk halaman Jelajahi (FYP) di dev.
insert into public.rooms (
  slug, host_id, name, description, category, approval_required,
  max_guests, idle_timeout_minutes, typing_enabled, visibility,
  listing_status, listed_at, expires_at, delete_at
)
select
  'devpub0000000001',
  '00000000-0000-4000-8000-000000000002',
  'Room Publik Dev',
  'Room publik contoh untuk halaman Jelajahi',
  'umum',
  false,
  10,
  30,
  true,
  'PUBLIC',
  'LISTED',
  now(),
  now() + interval '7 days',
  now() + interval '22 days'
where not exists (
  select 1 from public.rooms where slug = 'devpub0000000001'
);

-- Member dev dengan handle terverifikasi (pola Admin) di room publik.
insert into public.room_members (room_id, handle, handle_verified, status, password_version)
select r.id, 'dev-member', true, 'APPROVED', 1
from public.rooms r
where r.slug = 'devpub0000000001'
  and not exists (
    select 1 from public.room_members m
    where m.room_id = r.id and m.handle = 'dev-member'
  );

insert into public.member_identities (member_id, room_id, user_id)
select m.id, m.room_id, '00000000-0000-4000-8000-000000000003'::uuid
from public.room_members m
join public.rooms r on r.id = m.room_id
where r.slug = 'devpub0000000001'
  and m.handle = 'dev-member'
  and not exists (
    select 1 from public.member_identities mi
    where mi.member_id = m.id
  );

-- Statistik awal room publik (cron refresh-room-stats akan merawatnya).
insert into public.room_stats (room_id, approved_count, messages_last_hour)
select r.id, 1, 0
from public.rooms r
where r.slug = 'devpub0000000001'
on conflict (room_id) do nothing;

-- Dua laporan unik (di bawah ambang 3) agar room tetap tampil di FYP.
insert into public.room_reports (room_id, reporter_user_id, reason)
select r.id, v.uid, v.reason
from (
  values
    ('00000000-0000-4000-8000-000000000001'::uuid, 'SPAM'),
    ('00000000-0000-4000-8000-000000000003'::uuid, 'OTHER')
) as v(uid, reason)
cross join public.rooms r
join auth.users u on u.id = v.uid
where r.slug = 'devpub0000000001'
  and not exists (
    select 1 from public.room_reports rr
    where rr.room_id = r.id and rr.reporter_user_id = v.uid
  );
