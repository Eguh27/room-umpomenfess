-- 0009: kontrak final RPC Host untuk room publik/FYP dan handle.
-- Sumber kontrak: TASK.md bagian 5 dan 6.
-- Semua identitas tetap dari auth.uid(); JWT anonim ditolak NOT_HOST.

-- Kolom metadata baru hanya boleh dibaca Host lewat policy rooms_select_host.
-- password_hash tetap tidak pernah di-grant.
grant select (visibility, description, category, listing_status, listed_at)
  on public.rooms to authenticated;

-- create_room: tambah visibilitas, deskripsi, kategori, kuota publik,
-- email terkonfirmasi, flag FYP, dan suspend.
drop function if exists public.create_room(text, int, boolean, int, boolean);

create or replace function public.create_room(
  p_name text,
  p_max_guests int,
  p_approval_required boolean,
  p_idle_timeout_minutes int,
  p_typing_enabled boolean,
  p_visibility text default 'PRIVATE',
  p_description text default null,
  p_category text default null
)
returns table (room_id uuid, slug text, password text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text;
  v_visibility text;
  v_description text;
  v_category text;
  v_categories jsonb;
  v_description_max int;
  v_idle int;
  v_tier text;
  v_suspended boolean;
  v_max_rooms int;
  v_max_public_rooms int;
  v_guests_cap int;
  v_active int;
  v_public_used int;
  v_slug text;
  v_password text;
  v_expires timestamptz;
  v_delete timestamptz;
  v_listing_status text;
  v_listed_at timestamptz;
  v_id uuid;
begin
  if v_uid is null or app_private.is_anonymous() then
    perform app_private.raise_error('NOT_HOST');
  end if;

  v_name := btrim(coalesce(p_name, ''));
  v_visibility := upper(coalesce(p_visibility, 'PRIVATE'));
  v_description := nullif(btrim(coalesce(p_description, '')), '');
  v_category := nullif(btrim(coalesce(p_category, '')), '');

  if char_length(v_name) not between 1 and 80
     or p_max_guests is null
     or p_max_guests < 2
     or p_max_guests > 75
     or p_approval_required is null
     or p_typing_enabled is null
     or v_visibility not in ('PRIVATE', 'PUBLIC') then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  -- Kunci profil: dua tab Host tidak boleh lolos kuota bersamaan.
  select p.tier, p.suspended
  into v_tier, v_suspended
  from public.profiles p
  where p.user_id = v_uid
  for update;

  if not found then
    insert into public.profiles (user_id, handle)
    values (v_uid, app_private.generate_handle());

    select p.tier, p.suspended
    into v_tier, v_suspended
    from public.profiles p
    where p.user_id = v_uid
    for update;
  end if;

  if v_suspended then
    perform app_private.raise_error('USER_SUSPENDED');
  end if;

  v_description_max := coalesce(
    app_private.config_int('public_description_max'),
    200
  );

  if v_description is not null
     and char_length(v_description) > v_description_max then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  select c.value into v_categories
  from public.app_config c
  where c.key = 'categories';

  if v_category is not null and not exists (
    select 1
    from jsonb_array_elements_text(coalesce(v_categories, '[]'::jsonb)) as c(value)
    where c.value = v_category
  ) then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  if p_idle_timeout_minutes is null then
    v_idle := case
      when v_visibility = 'PUBLIC'
        then coalesce(app_private.config_int('public_idle_default_minutes'), 15)
      else 30
    end;
  else
    v_idle := p_idle_timeout_minutes;
  end if;

  if v_idle < 10 or v_idle > 240 then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  select t.max_active_rooms, t.max_guests_cap, t.max_public_rooms
  into v_max_rooms, v_guests_cap, v_max_public_rooms
  from public.tier_limits t
  where t.tier = coalesce(v_tier, 'free');

  if v_guests_cap is null or v_max_rooms is null then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  if p_max_guests > v_guests_cap then
    perform app_private.raise_error('CAPACITY_EXCEEDS_TIER');
  end if;

  select count(*)::int into v_active
  from public.rooms r
  where r.host_id = v_uid
    and r.closed_at is null
    and now() < r.expires_at;

  if v_active >= v_max_rooms then
    perform app_private.raise_error('QUOTA_REACHED');
  end if;

  if v_visibility = 'PUBLIC' then
    if not coalesce(app_private.config_bool('public_rooms_enabled'), false) then
      perform app_private.raise_error('FEATURE_DISABLED');
    end if;

    if not app_private.is_email_confirmed() then
      perform app_private.raise_error('EMAIL_NOT_CONFIRMED');
    end if;

    select count(*)::int into v_public_used
    from public.rooms r
    where r.host_id = v_uid
      and r.visibility = 'PUBLIC'
      and r.closed_at is null
      and now() < r.expires_at;

    if v_public_used >= coalesce(v_max_public_rooms, 0) then
      perform app_private.raise_error('PUBLIC_QUOTA_REACHED');
    end if;

    v_password := null;
    v_listing_status := 'LISTED';
    v_listed_at := now();
  else
    v_password := app_private.generate_room_password();
    v_listing_status := 'LISTED';
    v_listed_at := null;
  end if;

  v_slug := app_private.generate_slug();
  v_expires := now() + make_interval(days => app_private.config_int('room_active_days'));
  v_delete := v_expires + make_interval(days => app_private.config_int('room_grace_days'));

  insert into public.rooms (
    slug, host_id, name, password_hash, approval_required, max_guests,
    idle_timeout_minutes, typing_enabled, visibility, description, category,
    listing_status, listed_at, expires_at, delete_at
  )
  values (
    v_slug, v_uid, v_name,
    case
      when v_password is null then null
      else extensions.crypt(v_password, extensions.gen_salt('bf', 10))
    end,
    p_approval_required, p_max_guests, v_idle, p_typing_enabled,
    v_visibility, v_description, v_category, v_listing_status, v_listed_at,
    v_expires, v_delete
  )
  returning id into v_id;

  return query select v_id, v_slug, v_password, v_expires;
end;
$$;

-- regenerate_password: room PUBLIC tidak memakai password.
create or replace function public.regenerate_password(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_password text;
begin
  if v_uid is null or app_private.is_anonymous() then
    perform app_private.raise_error('NOT_HOST');
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id and r.host_id = v_uid
  for update;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  if v_room.closed_at is not null or now() >= v_room.expires_at then
    perform app_private.raise_error('ROOM_CLOSED');
  end if;

  if v_room.visibility = 'PUBLIC' then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  v_password := app_private.generate_room_password();

  update public.rooms r
  set password_hash = extensions.crypt(v_password, extensions.gen_salt('bf', 10)),
      password_version = r.password_version + 1
  where r.id = v_room.id;

  return v_password;
end;
$$;

-- make_room_private: satu-satunya transisi visibilitas yang diizinkan.
create or replace function public.make_room_private(p_room_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_password text;
begin
  if v_uid is null or app_private.is_anonymous() then
    perform app_private.raise_error('NOT_HOST');
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id and r.host_id = v_uid
  for update;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  if v_room.closed_at is not null or now() >= v_room.expires_at then
    perform app_private.raise_error('ROOM_CLOSED');
  end if;

  if v_room.visibility <> 'PUBLIC' then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  v_password := app_private.generate_room_password();

  update public.rooms r
  set visibility = 'PRIVATE',
      password_hash = extensions.crypt(v_password, extensions.gen_salt('bf', 10)),
      password_version = r.password_version + 1,
      listing_status = 'HIDDEN',
      listed_at = null
  where r.id = v_room.id;

  return v_password;
end;
$$;

-- update_room_settings: visibilitas tidak boleh berubah.
drop function if exists public.update_room_settings(uuid, boolean, int, int, boolean);

create or replace function public.update_room_settings(
  p_room_id uuid,
  p_approval_required boolean default null,
  p_max_guests int default null,
  p_idle_timeout_minutes int default null,
  p_typing_enabled boolean default null,
  p_visibility text default null
)
returns table (
  id uuid, slug text, name text, approval_required boolean, max_guests int,
  idle_timeout_minutes int, typing_enabled boolean, visibility text,
  description text, category text, listing_status text, listed_at timestamptz,
  created_at timestamptz, expires_at timestamptz, closed_at timestamptz,
  delete_at timestamptz, password_version int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_requested_visibility text;
  v_tier text;
  v_cap int;
  v_approved int;
begin
  if v_uid is null or app_private.is_anonymous() then
    perform app_private.raise_error('NOT_HOST');
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id and r.host_id = v_uid
  for update;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  if v_room.closed_at is not null or now() >= v_room.expires_at then
    perform app_private.raise_error('ROOM_CLOSED');
  end if;

  if p_visibility is not null then
    v_requested_visibility := upper(p_visibility);

    if v_requested_visibility not in ('PRIVATE', 'PUBLIC') then
      perform app_private.raise_error('INVALID_INPUT');
    end if;

    if v_requested_visibility <> v_room.visibility then
      perform app_private.raise_error('VISIBILITY_LOCKED');
    end if;
  end if;

  if p_idle_timeout_minutes is not null
     and (p_idle_timeout_minutes < 10 or p_idle_timeout_minutes > 240) then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  if p_max_guests is not null then
    select p.tier into v_tier
    from public.profiles p
    where p.user_id = v_uid;

    select t.max_guests_cap into v_cap
    from public.tier_limits t
    where t.tier = coalesce(v_tier, 'free');

    if p_max_guests < 2 or p_max_guests > 75 or p_max_guests > v_cap then
      perform app_private.raise_error('CAPACITY_EXCEEDS_TIER');
    end if;

    select count(*)::int into v_approved
    from public.room_members m
    where m.room_id = v_room.id
      and m.status = 'APPROVED'::public.member_status;

    if p_max_guests < v_approved then
      perform app_private.raise_error('CAPACITY_BELOW_MEMBERS');
    end if;
  end if;

  update public.rooms r
  set approval_required = coalesce(p_approval_required, r.approval_required),
      max_guests = coalesce(p_max_guests, r.max_guests),
      idle_timeout_minutes = coalesce(p_idle_timeout_minutes, r.idle_timeout_minutes),
      typing_enabled = coalesce(p_typing_enabled, r.typing_enabled)
  where r.id = v_room.id
  returning * into v_room;

  return query select
    v_room.id, v_room.slug, v_room.name, v_room.approval_required, v_room.max_guests,
    v_room.idle_timeout_minutes, v_room.typing_enabled, v_room.visibility,
    v_room.description, v_room.category, v_room.listing_status, v_room.listed_at,
    v_room.created_at, v_room.expires_at, v_room.closed_at, v_room.delete_at,
    v_room.password_version;
end;
$$;

-- list_hosted_rooms: metadata publik + dua kuota.
drop function if exists public.list_hosted_rooms();

create or replace function public.list_hosted_rooms()
returns table (
  id uuid, slug text, name text, status text, visibility text,
  listing_status text, description text, category text, listed_at timestamptz,
  approval_required boolean, max_guests int, idle_timeout_minutes int,
  typing_enabled boolean, typing_effective boolean,
  created_at timestamptz, expires_at timestamptz, closed_at timestamptz,
  delete_at timestamptz, approved_count int, pending_count int,
  quota jsonb, public_quota jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_tier text;
  v_max_rooms int;
  v_max_public_rooms int;
  v_used int;
  v_public_used int;
  v_typing_global boolean;
begin
  if v_uid is null or app_private.is_anonymous() then
    perform app_private.raise_error('NOT_HOST');
  end if;

  select p.tier into v_tier
  from public.profiles p
  where p.user_id = v_uid;

  select t.max_active_rooms, t.max_public_rooms
  into v_max_rooms, v_max_public_rooms
  from public.tier_limits t
  where t.tier = coalesce(v_tier, 'free');

  select count(*)::int into v_used
  from public.rooms r
  where r.host_id = v_uid
    and r.closed_at is null
    and now() < r.expires_at;

  select count(*)::int into v_public_used
  from public.rooms r
  where r.host_id = v_uid
    and r.visibility = 'PUBLIC'
    and r.closed_at is null
    and now() < r.expires_at;

  v_typing_global := coalesce(app_private.config_bool('typing_global_enabled'), false);

  return query
  select
    r.id,
    r.slug,
    r.name,
    case when r.closed_at is null and now() < r.expires_at then 'ACTIVE' else 'CLOSED' end,
    r.visibility,
    r.listing_status,
    r.description,
    r.category,
    r.listed_at,
    r.approval_required,
    r.max_guests,
    r.idle_timeout_minutes,
    r.typing_enabled,
    (r.typing_enabled and v_typing_global
      and r.closed_at is null and now() < r.expires_at),
    r.created_at,
    r.expires_at,
    r.closed_at,
    r.delete_at,
    (select count(*)::int from public.room_members m
      where m.room_id = r.id and m.status = 'APPROVED'::public.member_status),
    (select count(*)::int from public.room_members m
      where m.room_id = r.id and m.status = 'PENDING'::public.member_status),
    jsonb_build_object('used', v_used, 'max', coalesce(v_max_rooms, 0)),
    jsonb_build_object('used', v_public_used, 'max', coalesce(v_max_public_rooms, 0))
  from public.rooms r
  where r.host_id = v_uid
    and now() < r.delete_at
  order by r.created_at desc;
end;
$$;

-- list_members / decide_member: handle final, tanpa user_id/display_name.
drop function if exists public.list_members(uuid);

create or replace function public.list_members(p_room_id uuid)
returns table (
  id uuid, handle text, handle_verified boolean,
  status public.member_status, created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or app_private.is_anonymous() then
    perform app_private.raise_error('NOT_HOST');
  end if;

  if not exists (
    select 1 from public.rooms r where r.id = p_room_id and r.host_id = v_uid
  ) then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  return query
  select m.id, m.handle, m.handle_verified, m.status, m.created_at
  from public.room_members m
  where m.room_id = p_room_id
  order by m.created_at;
end;
$$;

drop function if exists public.decide_member(uuid, text);

create or replace function public.decide_member(
  p_member_id uuid,
  p_decision text
)
returns table (
  id uuid, handle text, handle_verified boolean,
  status public.member_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.room_members%rowtype;
  v_room public.rooms%rowtype;
  v_room_id uuid;
  v_approved int;
begin
  if v_uid is null or app_private.is_anonymous() then
    perform app_private.raise_error('NOT_HOST');
  end if;

  select m.room_id into v_room_id
  from public.room_members m
  where m.id = p_member_id;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = v_room_id and r.host_id = v_uid
  for update;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  select m.* into v_member
  from public.room_members m
  where m.id = p_member_id
  for update;

  if v_room.closed_at is not null or now() >= v_room.expires_at then
    perform app_private.raise_error('ROOM_CLOSED');
  end if;

  if p_decision is null or p_decision not in ('APPROVE', 'REJECT') then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  if v_member.status <> 'PENDING'::public.member_status then
    perform app_private.raise_error('NOT_PENDING');
  end if;

  if p_decision = 'APPROVE' then
    perform public.release_idle_members(v_room.id);

    select count(*)::int into v_approved
    from public.room_members m
    where m.room_id = v_room.id
      and m.status = 'APPROVED'::public.member_status;

    if v_approved >= v_room.max_guests then
      perform app_private.raise_error('ROOM_FULL');
    end if;

    update public.room_members m
    set status = 'APPROVED'::public.member_status,
        status_changed_at = now()
    where m.id = v_member.id;

    insert into public.member_activity (member_id, last_active_at)
    values (v_member.id, now())
    on conflict (member_id) do update set last_active_at = excluded.last_active_at;
  else
    update public.room_members m
    set status = 'REJECTED'::public.member_status,
        status_changed_at = now()
    where m.id = v_member.id;
  end if;

  return query select
    v_member.id,
    v_member.handle,
    v_member.handle_verified,
    case when p_decision = 'APPROVE'
      then 'APPROVED'::public.member_status
      else 'REJECTED'::public.member_status
    end;
end;
$$;

-- export_messages sudah mengembalikan public.messages (termasuk sender_badge);
-- tidak ada perubahan signature di T-12a.

revoke all on function public.create_room(text, int, boolean, int, boolean, text, text, text)
  from public, anon, authenticated;
revoke all on function public.regenerate_password(uuid)
  from public, anon, authenticated;
revoke all on function public.make_room_private(uuid)
  from public, anon, authenticated;
revoke all on function public.update_room_settings(uuid, boolean, int, int, boolean, text)
  from public, anon, authenticated;
revoke all on function public.list_hosted_rooms()
  from public, anon, authenticated;
revoke all on function public.list_members(uuid)
  from public, anon, authenticated;
revoke all on function public.decide_member(uuid, text)
  from public, anon, authenticated;

grant execute on function public.create_room(text, int, boolean, int, boolean, text, text, text)
  to authenticated;
grant execute on function public.regenerate_password(uuid) to authenticated;
grant execute on function public.make_room_private(uuid) to authenticated;
grant execute on function public.update_room_settings(uuid, boolean, int, int, boolean, text)
  to authenticated;
grant execute on function public.list_hosted_rooms() to authenticated;
grant execute on function public.list_members(uuid) to authenticated;
grant execute on function public.decide_member(uuid, text) to authenticated;
