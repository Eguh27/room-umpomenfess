-- 0013: pindah perangkat Guest anonim lewat kode lanjut sekali pakai.
-- Device baru membuat sesi anonim sendiri; kode hanya memindahkan baris
-- member_identities dari user_id lama ke user_id baru (adoption).
-- Tidak ada refresh token yang disimpan atau disalin.
-- Sumber kontrak: docs/progress.md REQUEST 2026-11-05 (Opsi 2).

-- 1. Tabel kode. RLS aktif tanpa policy: hanya SECURITY DEFINER/service_role.
create table if not exists public.guest_transfer_codes (
  code_hash text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null,
  revoked_at timestamptz,
  constraint guest_transfer_codes_hash_format
    check (code_hash ~ '^[0-9a-f]{64}$'),
  constraint guest_transfer_codes_expiry_after_created
    check (expires_at > created_at)
);

-- Satu kode aktif per identitas. Kode lama harus dicabut dulu.
create unique index if not exists guest_transfer_codes_one_active_idx
  on public.guest_transfer_codes (user_id)
  where used_at is null and revoked_at is null;

alter table public.guest_transfer_codes enable row level security;
revoke all on public.guest_transfer_codes from public, anon, authenticated;

-- 2. Terbitkan kode. Hanya untuk user anonim dengan keanggotaan APPROVED
-- di room yang masih aktif. Kode lama otomatis dicabut.
create or replace function public.issue_guest_transfer_code(
  p_user_id uuid,
  p_code_hash text,
  p_ttl_seconds int default 86400
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_anonymous boolean;
  v_expires_at timestamptz;
begin
  if p_user_id is null
     or p_code_hash is null
     or p_code_hash !~ '^[0-9a-f]{64}$'
     or p_ttl_seconds is null
     or p_ttl_seconds < 300
     or p_ttl_seconds > 604800 then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  select u.is_anonymous into v_is_anonymous
  from auth.users u
  where u.id = p_user_id;

  if not found then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  if not v_is_anonymous then
    perform app_private.raise_error('NOT_ANONYMOUS');
  end if;

  if not exists (
    select 1
    from public.member_identities mi
    join public.room_members m
      on m.id = mi.member_id and m.room_id = mi.room_id
    join public.rooms r on r.id = mi.room_id
    where mi.user_id = p_user_id
      and m.status = 'APPROVED'::public.member_status
      and r.closed_at is null
      and now() < r.expires_at
  ) then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  update public.guest_transfer_codes
  set revoked_at = now()
  where user_id = p_user_id
    and used_at is null
    and revoked_at is null;

  v_expires_at := now() + make_interval(secs => p_ttl_seconds);

  begin
    insert into public.guest_transfer_codes (code_hash, user_id, expires_at)
    values (p_code_hash, p_user_id, v_expires_at);
  exception
    when unique_violation then
      -- Dua permintaan bersamaan: yang kalah diperlakukan sebagai rate limit.
      perform app_private.raise_error('RATE_LIMITED');
  end;

  return v_expires_at;
end;
$$;

-- 3. Tukar kode: pindahkan seluruh keanggotaan user lama ke user baru.
-- Kode dikunci FOR UPDATE sehingga dua redeem bersamaan tidak bisa menang.
create or replace function public.adopt_guest_identity(
  p_code_hash text,
  p_new_user_id uuid
)
returns table (
  room_id uuid,
  slug text,
  handle text,
  status public.member_status,
  old_user_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.guest_transfer_codes%rowtype;
  v_new_is_anonymous boolean;
  v_old_is_anonymous boolean;
  v_moved int;
begin
  if p_code_hash is null
     or p_code_hash !~ '^[0-9a-f]{64}$'
     or p_new_user_id is null then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  select c.* into v_code
  from public.guest_transfer_codes c
  where c.code_hash = p_code_hash
  for update;

  if not found then
    perform app_private.raise_error('CODE_INVALID');
  end if;

  if v_code.used_at is not null
     or v_code.revoked_at is not null
     or v_code.expires_at <= now() then
    perform app_private.raise_error('CODE_INVALID');
  end if;

  if v_code.user_id = p_new_user_id then
    perform app_private.raise_error('SAME_IDENTITY');
  end if;

  -- Kunci user baru: serialisasi dua redeem yang menuju identitas yang sama.
  select u.is_anonymous into v_new_is_anonymous
  from auth.users u
  where u.id = p_new_user_id
  for update;

  if not found then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  if not v_new_is_anonymous then
    perform app_private.raise_error('NOT_ANONYMOUS');
  end if;

  select u.is_anonymous into v_old_is_anonymous
  from auth.users u
  where u.id = v_code.user_id;

  if not found or not v_old_is_anonymous then
    perform app_private.raise_error('CODE_INVALID');
  end if;

  if exists (
    select 1
    from public.member_identities mi
    where mi.user_id = p_new_user_id
  ) then
    perform app_private.raise_error('IDENTITY_IN_USE');
  end if;

  update public.member_identities
  set user_id = p_new_user_id
  where user_id = v_code.user_id;

  get diagnostics v_moved = row_count;

  if v_moved = 0 then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  update public.guest_transfer_codes
  set used_at = now(),
      used_by = p_new_user_id
  where code_hash = p_code_hash;

  -- Kode lain milik identitas lama tidak boleh bisa dipakai lagi.
  update public.guest_transfer_codes
  set revoked_at = now()
  where user_id = v_code.user_id
    and code_hash <> p_code_hash
    and used_at is null
    and revoked_at is null;

  return query
  select mi.room_id, r.slug, m.handle, m.status, v_code.user_id
  from public.member_identities mi
  join public.room_members m
    on m.id = mi.member_id and m.room_id = mi.room_id
  join public.rooms r on r.id = mi.room_id
  where mi.user_id = p_new_user_id
  order by m.created_at;
end;
$$;

-- 4. Grant eksplisit: hanya service_role.
revoke all on function public.issue_guest_transfer_code(uuid, text, int)
  from public, anon, authenticated;
revoke all on function public.adopt_guest_identity(text, uuid)
  from public, anon, authenticated;

grant execute on function public.issue_guest_transfer_code(uuid, text, int)
  to service_role;
grant execute on function public.adopt_guest_identity(text, uuid)
  to service_role;
