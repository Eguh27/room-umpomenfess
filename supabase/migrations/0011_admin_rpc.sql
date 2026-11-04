-- 0011: tabel admin_audit_log dan tujuh RPC Admin.
-- Sumber kontrak: TASK.md bagian 4-6. Semua RPC Admin wajib role admin + AAL2
-- (S-27), menulis admin_audit_log, dan hanya menyangkut akun login (p_user_id
-- tanpa baris profiles, mis. user anonim, ditolak NOT_FOUND).
-- admin_audit_log append-only: RLS aktif tanpa policy, tanpa grant client (S-32).

-- 1. Tabel audit. Tidak pernah dibaca client; dibaca service_role di masa depan.
create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  admin_id uuid not null references auth.users (id) on delete cascade,
  action text not null,
  target_type text not null,
  target_id text null,
  detail jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_admin_created_idx
  on public.admin_audit_log (admin_id, created_at desc);

create index if not exists admin_audit_log_target_idx
  on public.admin_audit_log (target_type, target_id);

alter table public.admin_audit_log enable row level security;

revoke all on public.admin_audit_log from public, anon, authenticated;
revoke all on sequence public.admin_audit_log_id_seq from public, anon, authenticated;

-- 2. Helper internal. Gate membedakan dua penolakan S-27:
--    bukan admin -> NOT_ADMIN; admin tapi AAL1 -> MFA_REQUIRED.
create or replace function app_private.admin_gate()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  select p.role into v_role
  from public.profiles p
  where p.user_id = auth.uid();

  if not found or v_role is distinct from 'admin' then
    perform app_private.raise_error('NOT_ADMIN');
  end if;

  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    perform app_private.raise_error('MFA_REQUIRED');
  end if;
end;
$$;

-- Tulis baris audit dengan admin_id dari JWT saat ini (auth.uid() tetap dari
-- token walau dipanggil dari fungsi SECURITY DEFINER).
create or replace function app_private.admin_log(
  p_action text,
  p_target_type text,
  p_target_id text default null,
  p_detail jsonb default '{}'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, detail)
  values (auth.uid(), p_action, p_target_type, p_target_id, coalesce(p_detail, '{}'));
end;
$$;

revoke all on function app_private.admin_gate() from public, anon, authenticated;
revoke all on function app_private.admin_log(text, text, text, jsonb)
  from public, anon, authenticated;

-- 3. Rename handle: hanya pola Admin terverifikasi; tulis riwayat dan
--    perbarui seat milik user itu di room ACTIVE (Snapshot pesan lama tidak berubah).
create or replace function public.admin_rename_handle(
  p_user_id uuid,
  p_new_handle text,
  p_verified boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new text;
  v_old text;
begin
  perform app_private.admin_gate();

  if coalesce(p_verified, false) is not true then
    perform app_private.raise_error('HANDLE_INVALID');
  end if;

  v_new := lower(btrim(coalesce(p_new_handle, '')));

  if v_new !~ '^[a-z0-9._-]{3,24}$' or v_new ~ '^[a-z0-9]{9}$' then
    perform app_private.raise_error('HANDLE_INVALID');
  end if;

  select p.handle into v_old
  from public.profiles p
  where p.user_id = p_user_id;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  if exists (
    select 1 from public.reserved_handles r where r.handle = v_new
  ) then
    perform app_private.raise_error('HANDLE_RESERVED');
  end if;

  if exists (
    select 1 from public.profiles p
    where p.handle = v_new and p.user_id <> p_user_id
  ) then
    perform app_private.raise_error('HANDLE_TAKEN');
  end if;

  -- Bentrok kursi member lain di room ACTIVE milik user itu (guard konsisten
  -- dengan unique(room_id, handle)); handle anonim 9-acak tidak mungkin sama
  -- dengan pola Admin, tapi cek ini tetap dipasang untuk data tak terduga.
  if exists (
    select 1
    from public.member_identities mine
    join public.room_members other on other.room_id = mine.room_id
    join public.rooms r on r.id = mine.room_id
    where mine.user_id = p_user_id
      and r.closed_at is null
      and now() < r.expires_at
      and other.handle = v_new
      and not exists (
        select 1 from public.member_identities oi
        where oi.member_id = other.id and oi.user_id = p_user_id
      )
  ) then
    perform app_private.raise_error('HANDLE_TAKEN');
  end if;

  update public.profiles p
  set handle = v_new,
      handle_verified = true
  where p.user_id = p_user_id;

  update public.room_members m
  set handle = v_new,
      handle_verified = true
  from public.member_identities mi
  join public.rooms r on r.id = mi.room_id
  where m.id = mi.member_id
    and mi.user_id = p_user_id
    and m.room_id = mi.room_id
    and r.closed_at is null
    and now() < r.expires_at;

  if v_old is distinct from v_new then
    insert into public.handle_history (user_id, old_handle, new_handle, changed_by)
    values (p_user_id, v_old, v_new, auth.uid());
  end if;

  perform app_private.admin_log(
    'rename_handle',
    'user',
    p_user_id::text,
    jsonb_build_object('new_handle', v_new)
  );
end;
$$;

-- 4. Set tier. Tier hanya boleh free/premium; target wajib akun login.
create or replace function public.admin_set_tier(
  p_user_id uuid,
  p_tier text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_gate();

  if coalesce(p_tier, '') not in ('free', 'premium') then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  update public.profiles p
  set tier = p_tier
  where p.user_id = p_user_id;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  perform app_private.admin_log(
    'set_tier',
    'user',
    p_user_id::text,
    jsonb_build_object('tier', p_tier)
  );
end;
$$;

-- 5. Suspend/aktifkan user. User suspended tetap boleh membaca.
create or replace function public.admin_suspend_user(
  p_user_id uuid,
  p_suspended boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_gate();

  if p_suspended is null then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  update public.profiles p
  set suspended = p_suspended
  where p.user_id = p_user_id;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  perform app_private.admin_log(
    'suspend_user',
    'user',
    p_user_id::text,
    jsonb_build_object('suspended', p_suspended)
  );
end;
$$;

-- 6. Tutup room. Idempoten: room yang sudah tutup tidak diubah dua kali.
--    delete_at dihitung ulang = closed_at + grace.
create or replace function public.admin_close_room(
  p_room_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_grace int;
  v_was_closed boolean;
begin
  perform app_private.admin_gate();

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  v_was_closed := v_room.closed_at is not null;

  if not v_was_closed then
    v_grace := coalesce(app_private.config_int('room_grace_days'), 15);

    update public.rooms r
    set closed_at = now(),
        delete_at = now() + make_interval(days => v_grace)
    where r.id = v_room.id;
  end if;

  perform app_private.admin_log(
    'close_room',
    'room',
    p_room_id::text,
    jsonb_build_object('was_closed', v_was_closed)
  );
end;
$$;

-- 7. Ubah status katalog. Room PRIVATE tidak pernah boleh kembali ke LISTED
--    (D-19: hanya publik -> privat yang diizinkan).
create or replace function public.admin_set_listing(
  p_room_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform app_private.admin_gate();

  if coalesce(p_status, '') not in ('LISTED', 'HIDDEN', 'BANNED') then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  if v_room.visibility = 'PRIVATE' and p_status = 'LISTED' then
    perform app_private.raise_error('VISIBILITY_LOCKED');
  end if;

  update public.rooms r
  set listing_status = p_status,
      listed_at = case when p_status = 'LISTED' then now() else null end
  where r.id = v_room.id;

  perform app_private.admin_log(
    'set_listing',
    'room',
    p_room_id::text,
    jsonb_build_object('listing_status', p_status)
  );
end;
$$;

-- 8. Daftar user (hanya akun login) untuk UI Admin.
--    Cari substring handle (tanpa wildcard), keyset cursor.
create or replace function public.admin_list_users(
  p_q text default null,
  p_cursor uuid default null
)
returns table (
  user_id uuid,
  handle text,
  handle_verified boolean,
  role text,
  tier text,
  suspended boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app_private.admin_gate();

  return query
  select
    p.user_id,
    p.handle,
    p.handle_verified,
    p.role,
    p.tier,
    p.suspended,
    p.created_at
  from public.profiles p
  where (
    p_q is null
    or btrim(p_q) = ''
    or strpos(p.handle, lower(btrim(p_q))) > 0
  )
    and (
      p_cursor is null
      or (p.created_at, p.user_id) < (
        select c.created_at, c.user_id
        from public.profiles c
        where c.user_id = p_cursor
      )
    )
  order by p.created_at desc, p.user_id desc
  limit 50;

  perform app_private.admin_log(
    'list_users',
    'list',
    null,
    jsonb_build_object('q', coalesce(btrim(p_q), ''), 'cursor', p_cursor)
  );
end;
$$;

-- 9. Daftar laporan per-room untuk UI Admin.
--    Agregat satu baris per room: jumlah laporan, pelapor unik, alasan, waktu
--    terakhir. p_cursor = first_report_id dari baris terakhir halaman
--    sebelumnya (keyset menurun). p_status memfilter listing_status room;
--    room_reports tidak punya kolom status terpisah.
create or replace function public.admin_list_reports(
  p_status text default null,
  p_cursor bigint default null
)
returns table (
  room_id uuid,
  slug text,
  name text,
  visibility text,
  listing_status text,
  room_status text,
  report_count int,
  unique_reporters int,
  reasons text[],
  last_report_at timestamptz,
  first_report_id bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
begin
  perform app_private.admin_gate();

  if p_status is not null
     and p_status not in ('LISTED', 'HIDDEN', 'BANNED') then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  return query
  select
    agg.room_id,
    r.slug,
    r.name,
    r.visibility,
    r.listing_status,
    case when r.closed_at is null and now() < r.expires_at
         then 'ACTIVE' else 'CLOSED' end,
    agg.report_count,
    agg.unique_reporters,
    agg.reasons,
    agg.last_report_at,
    agg.first_contact
  from (
    select
      rr3.room_id,
      min(rr3.id) as first_contact,
      count(*)::int as report_count,
      count(distinct rr3.reporter_user_id)::int as unique_reporters,
      array_agg(distinct rr3.reason) as reasons,
      max(rr3.created_at) as last_report_at
    from public.room_reports rr3
    group by rr3.room_id
    having p_cursor is null or min(rr3.id) < p_cursor
  ) agg
  join public.rooms r on r.id = agg.room_id
  where coalesce(p_status, '') = '' or r.listing_status = p_status
  order by agg.first_contact desc
  limit 50;

  perform app_private.admin_log(
    'list_reports',
    'list',
    null,
    jsonb_build_object('status', coalesce(p_status, ''), 'cursor', p_cursor)
  );
end;
$$;

-- 10. Grant eksplisit. RPC Admin hanya untuk authenticated; gate di dalam
--     fungsi memutuskan NOT_ADMIN/MFA_REQUIRED. service_role ikut dicabut
--     (pg_default_acl memberi EXECUTE otomatis padanya; API Admin wajib
--     berjalan dengan JWT admin AAL2, bukan kunci service_role).
revoke all on function public.admin_rename_handle(uuid, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_set_tier(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_suspend_user(uuid, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_close_room(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_set_listing(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_list_users(text, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.admin_list_reports(text, bigint)
  from public, anon, authenticated, service_role;

grant execute on function public.admin_rename_handle(uuid, text, boolean) to authenticated;
grant execute on function public.admin_set_tier(uuid, text) to authenticated;
grant execute on function public.admin_suspend_user(uuid, boolean) to authenticated;
grant execute on function public.admin_close_room(uuid) to authenticated;
grant execute on function public.admin_set_listing(uuid, text) to authenticated;
grant execute on function public.admin_list_users(text, uuid) to authenticated;
grant execute on function public.admin_list_reports(text, bigint) to authenticated;
