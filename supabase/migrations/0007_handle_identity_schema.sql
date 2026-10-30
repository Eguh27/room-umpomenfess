-- 0007: delta skema handle/role/identitas.
-- Handle sistem `[a-z0-9]{9}` hanya dibuat generator; handle Admin
-- `[a-z0-9._-]{3,24}` wajib verified dan tidak boleh reserved.
-- Sumber kontrak: TASK.md bagian 4-6.

-- 1. Tabel reserved + riwayat rename. Keduanya tanpa policy/grant client.
create table if not exists public.reserved_handles (
  handle text primary key,
  check (handle = lower(handle)),
  check (char_length(handle) between 3 and 24),
  check (handle ~ '^[a-z0-9._-]+$')
);

insert into public.reserved_handles (handle)
values
  ('admin'), ('host'), ('system'), ('support'), ('moderator'), ('mod'),
  ('staff'), ('official'), ('root'), ('null'), ('undefined'), ('anonymous')
on conflict (handle) do nothing;

create table if not exists public.handle_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  old_handle text not null,
  new_handle text not null,
  changed_by uuid not null references auth.users (id),
  changed_at timestamptz not null default now()
);

create index if not exists handle_history_user_changed_idx
  on public.handle_history (user_id, changed_at desc);

alter table public.reserved_handles enable row level security;
alter table public.handle_history enable row level security;

revoke all on public.reserved_handles from public, anon, authenticated;
revoke all on public.handle_history from public, anon, authenticated;
revoke all on sequence public.handle_history_id_seq from public, anon, authenticated;

-- 2. Kolom identitas pada profiles. handle diisi generator untuk data lama
-- dan oleh trigger untuk user baru non-anonim.
alter table public.profiles
  add column if not exists handle text,
  add column if not exists handle_verified boolean not null default false,
  add column if not exists role text not null default 'user',
  add column if not exists suspended boolean not null default false;

-- 3. Generator handle sistem. Reserved dan handle profil yang sudah ada
-- dilewati. Fungsi ini hanya untuk pemanggil internal (SECURITY DEFINER).
create or replace function app_private.generate_handle()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_alphabet constant text := 'abcdefghijklmnopqrstuvwxyz0123456789';
  v_bytes bytea;
  v_handle text;
  i int;
begin
  loop
    v_bytes := extensions.gen_random_bytes(9);
    v_handle := '';

    for i in 0 .. 8 loop
      v_handle := v_handle || substr(
        v_alphabet,
        (get_byte(v_bytes, i) % 36) + 1,
        1
      );
    end loop;

    exit when not exists (
      select 1 from public.reserved_handles r where r.handle = v_handle
    ) and not exists (
      select 1 from public.profiles p where p.handle = v_handle
    );
  end loop;

  return v_handle;
end;
$$;

-- Handle anonim per room: tidak bentrok dengan host atau member lain.
create or replace function app_private.generate_room_handle(p_room_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_handle text;
  v_host_id uuid;
begin
  select r.host_id into v_host_id
  from public.rooms r
  where r.id = p_room_id;

  loop
    v_handle := app_private.generate_handle();

    exit when not exists (
      select 1
      from public.room_members m
      where m.room_id = p_room_id
        and m.handle = v_handle
    ) and not exists (
      select 1
      from public.profiles p
      where p.user_id = v_host_id
        and p.handle = v_handle
    );
  end loop;

  return v_handle;
end;
$$;

-- Resolusi handle saat join: login memakai handle profil, anonim memakai
-- handle yang sudah tersimpan di room itu, atau membuat handle baru.
create or replace function app_private.resolve_room_handle(
  p_room_id uuid,
  p_user_id uuid
)
returns table (handle text, handle_verified boolean)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_handle text;
  v_verified boolean;
begin
  select p.handle, p.handle_verified
  into v_handle, v_verified
  from public.profiles p
  where p.user_id = p_user_id;

  if found then
    return query select v_handle, v_verified;
    return;
  end if;

  select m.handle, m.handle_verified
  into v_handle, v_verified
  from public.member_identities mi
  join public.room_members m on m.id = mi.member_id
  where mi.room_id = p_room_id
    and mi.user_id = p_user_id;

  if found then
    return query select v_handle, v_verified;
    return;
  end if;

  return query select app_private.generate_room_handle(p_room_id), false;
end;
$$;

revoke all on function app_private.generate_handle() from public, anon, authenticated;
revoke all on function app_private.generate_room_handle(uuid) from public, anon, authenticated;
revoke all on function app_private.resolve_room_handle(uuid, uuid) from public, anon, authenticated;

-- 4. Backfill profil lama, lalu pasang constraint.
do $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select p.user_id from public.profiles p where p.handle is null
  loop
    update public.profiles p
    set handle = app_private.generate_handle()
    where p.user_id = v_user_id;
  end loop;
end
$$;

alter table public.profiles
  add constraint profiles_handle_key unique (handle),
  add constraint profiles_role_check check (role in ('user', 'admin')),
  add constraint profiles_handle_pattern_check check (
    (handle ~ '^[a-z0-9]{9}$' and handle_verified = false)
    or (
      handle ~ '^[a-z0-9._-]{3,24}$'
      and handle !~ '^[a-z0-9]{9}$'
      and handle_verified = true
    )
  );

alter table public.profiles alter column handle set not null;
alter table public.profiles alter column handle set default app_private.generate_handle();

-- Trigger reserved berlaku untuk profiles dan room_members.
create or replace function app_private.check_handle_not_reserved()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.reserved_handles r where r.handle = new.handle
  ) then
    raise exception using errcode = 'P0001', message = 'HANDLE_RESERVED';
  end if;
  return new;
end;
$$;

revoke all on function app_private.check_handle_not_reserved() from public, anon, authenticated;

drop trigger if exists profiles_handle_reserved_check on public.profiles;
create trigger profiles_handle_reserved_check
  before insert or update of handle on public.profiles
  for each row execute function app_private.check_handle_not_reserved();

-- Trigger profil non-anonim: handle dibuat sistem saat user mendaftar.
create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.is_anonymous, false) is false then
    insert into public.profiles (user_id, handle)
    values (new.id, app_private.generate_handle())
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function app_private.handle_new_user() from public, anon, authenticated;

-- 5. Kolom handle pada room_members + backfill.
alter table public.room_members
  add column if not exists handle text,
  add column if not exists handle_verified boolean not null default false;

-- Login: salin handle profil. Anonim: buat handle per room.
update public.room_members m
set handle = p.handle,
    handle_verified = p.handle_verified
from public.member_identities mi
join public.profiles p on p.user_id = mi.user_id
where mi.member_id = m.id
  and m.handle is null;

do $$
declare
  v_member record;
begin
  for v_member in
    select m.id, m.room_id
    from public.room_members m
    where m.handle is null
  loop
    update public.room_members m
    set handle = app_private.generate_room_handle(v_member.room_id),
        handle_verified = false
    where m.id = v_member.id;
  end loop;
end
$$;

alter table public.room_members
  add constraint room_members_room_handle_key unique (room_id, handle),
  add constraint room_members_handle_pattern_check check (
    (handle ~ '^[a-z0-9]{9}$' and handle_verified = false)
    or (
      handle ~ '^[a-z0-9._-]{3,24}$'
      and handle !~ '^[a-z0-9]{9}$'
      and handle_verified = true
    )
  );

alter table public.room_members alter column handle set not null;

drop trigger if exists room_members_handle_reserved_check on public.room_members;
create trigger room_members_handle_reserved_check
  before insert or update of handle on public.room_members
  for each row execute function app_private.check_handle_not_reserved();

-- Hapus skema penomoran lama.
alter table public.room_members drop constraint if exists room_members_room_id_member_no_key;
alter table public.room_members drop constraint if exists room_members_check;
alter table public.room_members drop constraint if exists room_members_member_no_check;
alter table public.room_members drop constraint if exists room_members_display_name_check;
alter table public.room_members drop column if exists member_no;
alter table public.room_members drop column if exists display_name;

alter table public.rooms drop constraint if exists rooms_member_counter_check;
alter table public.rooms drop column if exists member_counter;

drop function if exists app_private.next_guest_number(uuid);
drop function if exists app_private.guest_display_name(int);

-- 6. Snapshot handle + badge pada pesan. Data lama ikut ditulis ulang.
alter table public.messages add column if not exists sender_badge text;
alter table public.messages
  add constraint messages_sender_badge_check
  check (sender_badge in ('HOST', 'VERIFIED'));

update public.messages m
set sender_name = p.handle,
    sender_badge = 'HOST'
from public.rooms r
join public.profiles p on p.user_id = r.host_id
where m.room_id = r.id
  and m.sender_type = 'HOST';

update public.messages m
set sender_name = rm.handle,
    sender_badge = case when rm.handle_verified then 'VERIFIED' else null end
from public.room_members rm
where m.member_id = rm.id
  and m.sender_type = 'GUEST';

-- Pesan Guest lama yang member-nya sudah terhapus tidak boleh menyisakan
-- nomor urut. Tidak ada handle yang bisa dipulihkan.
update public.messages m
set sender_name = 'unknown',
    sender_badge = null
where m.sender_type = 'GUEST'
  and m.member_id is null;

-- 7. RPC lama yang menyentuh kolom yang dihapus diganti minimal agar tetap
-- konsisten dengan skema baru. Kontrak final (handle/handle_verified dan
-- argumen baru) tetap milik T-12a/T-13a.
drop function if exists public.update_room_settings(uuid, boolean, int, int, boolean);

create or replace function public.update_room_settings(
  p_room_id uuid,
  p_approval_required boolean default null,
  p_max_guests int default null,
  p_idle_timeout_minutes int default null,
  p_typing_enabled boolean default null
)
returns table (
  id uuid, slug text, name text, approval_required boolean, max_guests int,
  idle_timeout_minutes int, typing_enabled boolean, created_at timestamptz,
  expires_at timestamptz, closed_at timestamptz, delete_at timestamptz,
  password_version int
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
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
    v_room.idle_timeout_minutes, v_room.typing_enabled, v_room.created_at,
    v_room.expires_at, v_room.closed_at, v_room.delete_at,
    v_room.password_version;
end;
$$;

create or replace function public.decide_member(
  p_member_id uuid,
  p_decision text
)
returns table (id uuid, display_name text, status public.member_status)
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
    case when p_decision = 'APPROVE'
      then 'APPROVED'::public.member_status
      else 'REJECTED'::public.member_status
    end;
end;
$$;

create or replace function public.list_members(p_room_id uuid)
returns table (id uuid, display_name text, status public.member_status, created_at timestamptz)
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
  select m.id, m.handle, m.status, m.created_at
  from public.room_members m
  where m.room_id = p_room_id
  order by m.created_at;
end;
$$;

create or replace function public.my_rooms()
returns table (
  room_id uuid, slug text, name text, room_status text,
  my_status public.member_status, display_name text, expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  return query
  select
    r.id,
    r.slug,
    r.name,
    case when r.closed_at is null and now() < r.expires_at then 'ACTIVE' else 'CLOSED' end,
    m.status,
    m.handle,
    r.expires_at
  from public.member_identities mi
  join public.room_members m on m.id = mi.member_id
  join public.rooms r on r.id = mi.room_id
  where mi.user_id = v_uid
    and m.status in (
      'PENDING'::public.member_status,
      'APPROVED'::public.member_status,
      'IDLE'::public.member_status
    )
    and r.closed_at is null
    and now() < r.expires_at
  order by r.created_at desc;
end;
$$;

create or replace function public.send_message(
  p_room_id uuid,
  p_content text,
  p_client_msg_id uuid
)
returns public.messages
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_member public.room_members%rowtype;
  v_existing public.messages%rowtype;
  v_msg public.messages%rowtype;
  v_is_host boolean;
  v_content text;
  v_max_len int;
  v_recent int;
  v_total bigint;
  v_room_limit int;
  v_sender_type text;
  v_sender_name text;
  v_sender_badge text;
  v_member_id uuid;
begin
  if v_uid is null then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  if p_client_msg_id is null then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  v_max_len := coalesce(app_private.config_int('message_max_length'), 2000);
  v_content := btrim(coalesce(p_content, ''));

  if char_length(v_content) = 0 then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  if char_length(v_content) > v_max_len then
    perform app_private.raise_error('MESSAGE_TOO_LONG');
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id;

  if not found then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  v_is_host := v_room.host_id = v_uid;

  if v_is_host then
    select p.handle into v_sender_name
    from public.profiles p
    where p.user_id = v_uid;

    if v_sender_name is null then
      perform app_private.raise_error('NOT_MEMBER');
    end if;

    v_member_id := null;
    v_sender_type := 'HOST';
    v_sender_badge := 'HOST';
  else
    select m.* into v_member
    from public.member_identities mi
    join public.room_members m on m.id = mi.member_id
    where mi.room_id = v_room.id and mi.user_id = v_uid
    for update of m;

    if not found or v_member.status <> 'APPROVED'::public.member_status then
      perform app_private.raise_error('NOT_MEMBER');
    end if;

    v_member_id := v_member.id;
    v_sender_type := 'GUEST';
    v_sender_name := v_member.handle;
    v_sender_badge := case when v_member.handle_verified then 'VERIFIED' else null end;
  end if;

  select m.* into v_existing
  from public.messages m
  where m.room_id = v_room.id
    and m.client_msg_id = p_client_msg_id;

  if found then
    if (v_is_host and v_existing.sender_type = 'HOST')
       or (not v_is_host and v_existing.member_id = v_member_id) then
      return v_existing;
    end if;
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  if v_room.closed_at is not null or now() >= v_room.expires_at then
    perform app_private.raise_error('ROOM_CLOSED');
  end if;

  select count(*)::int into v_recent
  from public.messages m
  where m.room_id = v_room.id
    and m.created_at > now() - interval '1 minute'
    and (
      (v_is_host and m.sender_type = 'HOST')
      or (not v_is_host and m.member_id = v_member_id)
    );

  if v_recent >= coalesce(app_private.config_int('messages_per_minute'), 20) then
    perform app_private.raise_error('RATE_LIMITED');
  end if;

  select t.max_messages_per_room into v_room_limit
  from public.profiles p
  join public.tier_limits t on t.tier = p.tier
  where p.user_id = v_room.host_id;

  if v_room_limit is null then
    select t.max_messages_per_room into v_room_limit
    from public.tier_limits t
    where t.tier = 'free';
  end if;

  select count(*)::bigint into v_total
  from public.messages m
  where m.room_id = v_room.id;

  if v_total >= v_room_limit then
    perform app_private.raise_error('ROOM_MESSAGE_LIMIT');
  end if;

  begin
    insert into public.messages (
      room_id, sender_type, member_id, sender_name, sender_badge, content, client_msg_id
    )
    values (
      v_room.id, v_sender_type, v_member_id, v_sender_name, v_sender_badge,
      v_content, p_client_msg_id
    )
    returning * into v_msg;
  exception
    when unique_violation then
      select m.* into v_msg
      from public.messages m
      where m.room_id = v_room.id
        and m.client_msg_id = p_client_msg_id;

      if not found
         or not (
           (v_is_host and v_msg.sender_type = 'HOST')
           or (not v_is_host and v_msg.member_id = v_member_id)
         ) then
        perform app_private.raise_error('NOT_MEMBER');
      end if;
  end;

  if not v_is_host then
    insert into public.member_activity (member_id, last_active_at)
    values (v_member_id, now())
    on conflict (member_id) do update set last_active_at = excluded.last_active_at;
  end if;

  return v_msg;
end;
$$;

-- join_room tetap memakai signature 4-arg dan nama OUT `display_name`
-- sampai T-13a menggantinya. Nilainya sekarang adalah handle, bukan nomor.
create or replace function public.join_room(
  p_user_id uuid,
  p_slug text,
  p_password text,
  p_ip_hash text
)
returns table (status public.member_status, room_id uuid, member_id uuid, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_member public.room_members%rowtype;
  v_status public.member_status;
  v_handle text;
  v_handle_verified boolean;
  v_approved int;
  v_pending int;
  v_attempts int;
  v_last_fail timestamptz;
  v_retry int;
  v_active_rooms int;
  v_max_rooms int;
  v_threshold int;
  v_window int;
  v_duration int;
  v_cooldown int;
  v_failure_cap int;
  v_pending_mult int;
  v_is_anonymous boolean;
begin
  if p_user_id is null
     or p_ip_hash is null
     or char_length(p_ip_hash) < 32 then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  select u.is_anonymous into v_is_anonymous
  from auth.users u
  where u.id = p_user_id;

  select r.* into v_room
  from public.rooms r
  where r.slug = p_slug
  for update;

  if not found then
    perform app_private.raise_error('ROOM_NOT_FOUND');
  end if;

  if v_room.closed_at is not null or now() >= v_room.expires_at then
    perform app_private.raise_error('ROOM_CLOSED');
  end if;

  v_threshold := coalesce(app_private.config_int('lockout_fail_threshold'), 5);
  v_window := coalesce(app_private.config_int('lockout_window_minutes'), 15);
  v_duration := coalesce(app_private.config_int('lockout_duration_minutes'), 15);
  v_cooldown := coalesce(app_private.config_int('room_cooldown_minutes'), 10);
  v_failure_cap := coalesce(app_private.config_int('room_failure_cap_per_hour'), 200);

  select count(*)::int, max(a.created_at)
  into v_attempts, v_last_fail
  from public.join_attempts a
  where a.room_id = v_room.id
    and a.success = false
    and a.created_at > now() - interval '1 hour';

  if v_attempts >= v_failure_cap then
    v_retry := ceil(
      extract(epoch from (v_last_fail + make_interval(mins => v_cooldown) - now()))
    )::int;

    if v_retry > 0 then
      perform app_private.raise_error(
        'ROOM_COOLDOWN',
        jsonb_build_object('retry_after', v_retry)::text
      );
    end if;
  end if;

  select count(*)::int, max(a.created_at)
  into v_attempts, v_last_fail
  from public.join_attempts a
  where a.room_id = v_room.id
    and a.ip_hash = p_ip_hash
    and a.success = false
    and a.created_at > now() - make_interval(mins => v_window);

  if v_attempts >= v_threshold then
    v_retry := ceil(
      extract(epoch from (v_last_fail + make_interval(mins => v_duration) - now()))
    )::int;

    if v_retry > 0 then
      perform app_private.raise_error(
        'LOCKED',
        jsonb_build_object('retry_after', v_retry)::text
      );
    end if;
  end if;

  select m.* into v_member
  from public.member_identities mi
  join public.room_members m on m.id = mi.member_id
  where mi.room_id = v_room.id
    and mi.user_id = p_user_id
  for update of m;

  if found then
    if v_member.status = 'KICKED'::public.member_status then
      perform app_private.raise_error('KICKED');
    end if;

    if v_member.status = 'REJECTED'::public.member_status then
      perform app_private.raise_error('REJECTED');
    end if;

    if v_member.status in (
      'PENDING'::public.member_status,
      'APPROVED'::public.member_status
    ) then
      return query select v_member.status, v_room.id, v_member.id, v_member.handle;
      return;
    end if;
  end if;

  if extensions.crypt(upper(p_password), v_room.password_hash)
     is distinct from v_room.password_hash then
    perform app_private.raise_error('WRONG_PASSWORD');
  end if;

  v_max_rooms := coalesce(
    app_private.config_int(
      case
        when coalesce(v_is_anonymous, false) then 'anon_max_active_rooms'
        else 'login_max_active_rooms'
      end
    ),
    5
  );

  select count(*)::int into v_active_rooms
  from public.member_identities mi
  join public.room_members m on m.id = mi.member_id
  join public.rooms r on r.id = mi.room_id
  where mi.user_id = p_user_id
    and mi.room_id <> v_room.id
    and m.status in (
      'PENDING'::public.member_status,
      'APPROVED'::public.member_status
    )
    and r.closed_at is null
    and now() < r.expires_at;

  if v_active_rooms >= v_max_rooms then
    perform app_private.raise_error('MAX_ROOMS_PER_GUEST');
  end if;

  perform public.release_idle_members(v_room.id);

  if v_room.approval_required then
    select count(*)::int into v_pending
    from public.room_members m
    where m.room_id = v_room.id
      and m.status = 'PENDING'::public.member_status;

    v_pending_mult := coalesce(app_private.config_int('pending_cap_multiplier'), 2);

    if v_pending >= v_room.max_guests * v_pending_mult then
      perform app_private.raise_error('ROOM_FULL');
    end if;

    v_status := 'PENDING'::public.member_status;
  else
    select count(*)::int into v_approved
    from public.room_members m
    where m.room_id = v_room.id
      and m.status = 'APPROVED'::public.member_status;

    if v_approved >= v_room.max_guests then
      perform app_private.raise_error('ROOM_FULL');
    end if;

    v_status := 'APPROVED'::public.member_status;
  end if;

  select h.handle, h.handle_verified
  into v_handle, v_handle_verified
  from app_private.resolve_room_handle(v_room.id, p_user_id) h;

  if v_member.id is null then
    insert into public.room_members (
      room_id, handle, handle_verified, status, password_version, status_changed_at
    )
    values (
      v_room.id, v_handle, v_handle_verified, v_status,
      v_room.password_version, now()
    )
    returning * into v_member;

    insert into public.member_identities (member_id, room_id, user_id)
    values (v_member.id, v_room.id, p_user_id);
  else
    update public.room_members m
    set status = v_status,
        handle = coalesce(v_member.handle, v_handle),
        handle_verified = case
          when v_member.handle is null then v_handle_verified
          else v_member.handle_verified
        end,
        password_version = v_room.password_version,
        status_changed_at = now()
    where m.id = v_member.id
    returning * into v_member;
  end if;

  insert into public.member_activity (member_id, last_active_at)
  values (v_member.id, now())
  on conflict on constraint member_activity_pkey
  do update set last_active_at = excluded.last_active_at;

  insert into public.join_attempts (room_id, ip_hash, success)
  values (v_room.id, p_ip_hash, true);

  return query select v_member.status, v_room.id, v_member.id, v_member.handle;
end;
$$;

revoke all on function public.update_room_settings(uuid, boolean, int, int, boolean) from public, anon, authenticated;
revoke all on function public.decide_member(uuid, text) from public, anon, authenticated;
revoke all on function public.list_members(uuid) from public, anon, authenticated;
revoke all on function public.my_rooms() from public, anon, authenticated;
revoke all on function public.send_message(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.join_room(uuid, text, text, text) from public, anon, authenticated;

grant execute on function public.update_room_settings(uuid, boolean, int, int, boolean) to authenticated;
grant execute on function public.decide_member(uuid, text) to authenticated;
grant execute on function public.list_members(uuid) to authenticated;
grant execute on function public.my_rooms() to authenticated;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
grant execute on function public.join_room(uuid, text, text, text) to service_role;
