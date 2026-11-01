-- 0010: kontrak final RPC Guest/member dan join_room service-only.
-- Sumber kontrak: TASK.md bagian 6 dan 8.
-- Semua identitas RPC client berasal dari auth.uid(); join_room menerima
-- identitas hanya dari service_role setelah token diverifikasi Agent B.

-- 1. get_room_public: metadata minimum untuk layar password/lobby.
-- Tambah visibility; return type berubah, jadi fungsi lama di-drop.
drop function if exists public.get_room_public(text);

create or replace function public.get_room_public(p_slug text)
returns table (
  room_id uuid,
  name text,
  status text,
  visibility text,
  typing_effective boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room public.rooms%rowtype;
  v_typing_global boolean;
begin
  select r.* into v_room
  from public.rooms r
  where r.slug = p_slug;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  v_typing_global := coalesce(
    app_private.config_bool('typing_global_enabled'),
    false
  );

  return query select
    v_room.id,
    v_room.name,
    case
      when v_room.closed_at is null and now() < v_room.expires_at
        then 'ACTIVE'
      else 'CLOSED'
    end,
    v_room.visibility,
    (
      v_room.typing_enabled
      and v_typing_global
      and v_room.closed_at is null
      and now() < v_room.expires_at
    );
end;
$$;

-- 2. rejoin_room: hanya IDLE dengan password_version yang sama.
-- Room HIDDEN hanya menolak join baru untuk room PUBLIC; room privat hasil
-- make_room_private juga berstatus HIDDEN tetapi harus tetap bisa dipakai.
create or replace function public.rejoin_room(p_room_id uuid)
returns public.member_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_is_anonymous boolean := app_private.is_anonymous();
  v_room public.rooms%rowtype;
  v_member public.room_members%rowtype;
  v_approved int;
  v_active_rooms int;
  v_max_rooms int;
begin
  if v_uid is null then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  -- Urutan lock: rooms lalu room_members (sama dengan join_room).
  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  if v_room.closed_at is not null or now() >= v_room.expires_at then
    perform app_private.raise_error('ROOM_CLOSED');
  end if;

  if v_room.listing_status = 'BANNED' then
    perform app_private.raise_error('ROOM_BANNED');
  end if;

  if v_room.visibility = 'PUBLIC'
     and v_room.listing_status = 'HIDDEN' then
    perform app_private.raise_error('ROOM_HIDDEN');
  end if;

  select m.* into v_member
  from public.member_identities mi
  join public.room_members m on m.id = mi.member_id
  where mi.room_id = v_room.id
    and mi.user_id = v_uid
    and m.room_id = mi.room_id
  for update of m;

  if not found then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  if v_member.status = 'KICKED'::public.member_status then
    perform app_private.raise_error('KICKED');
  end if;

  if v_member.status in (
    'REJECTED'::public.member_status,
    'LEFT'::public.member_status
  ) then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  if v_member.status in (
    'PENDING'::public.member_status,
    'APPROVED'::public.member_status
  ) then
    return v_member.status;
  end if;

  if v_member.status <> 'IDLE'::public.member_status then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  if v_member.password_version <> v_room.password_version then
    perform app_private.raise_error('PASSWORD_CHANGED');
  end if;

  v_max_rooms := coalesce(
    app_private.config_int(
      case
        when v_is_anonymous then 'anon_max_active_rooms'
        else 'login_max_active_rooms'
      end
    ),
    case when v_is_anonymous then 1 else 5 end
  );

  select count(*)::int into v_active_rooms
  from public.member_identities mi
  join public.room_members m on m.id = mi.member_id
  join public.rooms r on r.id = mi.room_id
  where mi.user_id = v_uid
    and mi.room_id <> v_room.id
    and m.room_id = mi.room_id
    and m.status in (
      'PENDING'::public.member_status,
      'APPROVED'::public.member_status
    )
    and r.closed_at is null
    and now() < r.expires_at;

  if v_active_rooms >= v_max_rooms then
    perform app_private.raise_error('ONE_ROOM_LIMIT');
  end if;

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

  return 'APPROVED'::public.member_status;
end;
$$;

-- 3. my_rooms: hanya user login; JWT anonim ditolak.
-- Return type berubah (handle/handle_verified), jadi fungsi lama di-drop.
drop function if exists public.my_rooms();

create or replace function public.my_rooms()
returns table (
  room_id uuid,
  slug text,
  name text,
  room_status text,
  my_status public.member_status,
  handle text,
  handle_verified boolean,
  expires_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null or app_private.is_anonymous() then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  return query
  select
    r.id,
    r.slug,
    r.name,
    case
      when r.closed_at is null and now() < r.expires_at
        then 'ACTIVE'
      else 'CLOSED'
    end,
    m.status,
    m.handle,
    m.handle_verified,
    r.expires_at
  from public.member_identities mi
  join public.room_members m on m.id = mi.member_id
  join public.rooms r on r.id = mi.room_id
  where mi.user_id = v_uid
    and m.room_id = mi.room_id
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

-- 4. list_messages: kontrak tetap; sender_name/sender_badge sudah snapshot.
create or replace function public.list_messages(
  p_room_id uuid,
  p_before_id bigint default null,
  p_after_id bigint default null,
  p_limit int default 50
)
returns setof public.messages
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_room public.rooms%rowtype;
  v_is_host boolean;
  v_limit int := least(greatest(coalesce(p_limit, 50), 1), 100);
begin
  if v_uid is null then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id;

  if not found then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  v_is_host := v_room.host_id = v_uid;

  if v_is_host then
    if now() >= v_room.delete_at then
      perform app_private.raise_error('ROOM_CLOSED');
    end if;
  else
    if not app_private.is_approved_member(v_room.id) then
      perform app_private.raise_error('NOT_MEMBER');
    end if;

    if v_room.closed_at is not null or now() >= v_room.expires_at then
      perform app_private.raise_error('ROOM_CLOSED');
    end if;
  end if;

  if p_before_id is not null then
    return query
    select m.*
    from (
      select msg.*
      from public.messages msg
      where msg.room_id = v_room.id
        and msg.id < p_before_id
      order by msg.id desc
      limit v_limit
    ) m
    order by m.id;
  elsif coalesce(p_after_id, 0) > 0 then
    return query
    select msg.*
    from public.messages msg
    where msg.room_id = v_room.id
      and msg.id > p_after_id
    order by msg.id
    limit v_limit;
  else
    return query
    select m.*
    from (
      select msg.*
      from public.messages msg
      where msg.room_id = v_room.id
      order by msg.id desc
      limit v_limit
    ) m
    order by m.id;
  end if;
end;
$$;

-- 5. send_message: snapshot handle/badge, tolak user suspend, dan kunci room
-- lebih dulu agar urutan lock konsisten dengan join/decide/rejoin.
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
  v_suspended boolean;
begin
  if v_uid is null then
    perform app_private.raise_error('NOT_MEMBER');
  end if;

  select coalesce(p.suspended, false) into v_suspended
  from public.profiles p
  where p.user_id = v_uid;

  if coalesce(v_suspended, false) then
    perform app_private.raise_error('USER_SUSPENDED');
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
  where r.id = p_room_id
  for update;

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
    where mi.room_id = v_room.id
      and mi.user_id = v_uid
      and m.room_id = mi.room_id
    for update of m;

    if not found or v_member.status <> 'APPROVED'::public.member_status then
      perform app_private.raise_error('NOT_MEMBER');
    end if;

    v_member_id := v_member.id;
    v_sender_type := 'GUEST';
    v_sender_name := v_member.handle;
    v_sender_badge := case
      when v_member.handle_verified then 'VERIFIED'
      else null
    end;
  end if;

  -- Idempotensi: retry dengan client_msg_id yang sama mengembalikan baris lama.
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
      room_id, sender_type, member_id, sender_name, sender_badge,
      content, client_msg_id
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

-- 6. join_room: signature final 5 argumen, service-only.
-- Room HIDDEN hanya menolak join baru untuk room PUBLIC; room privat hasil
-- make_room_private tetap bisa dijoin dengan password.
drop function if exists public.join_room(uuid, text, text, text);

create or replace function public.join_room(
  p_user_id uuid,
  p_is_anonymous boolean,
  p_slug text,
  p_password text,
  p_ip_hash text
)
returns table (
  status public.member_status,
  room_id uuid,
  member_id uuid,
  handle text
)
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
  v_first_attempt timestamptz;
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
  v_user_anonymous boolean;
  v_suspended boolean;
  v_public_limit int;
begin
  if p_user_id is null
     or p_is_anonymous is null
     or p_slug is null
     or char_length(p_slug) = 0
     or p_ip_hash is null
     or char_length(p_ip_hash) < 32 then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  -- p_is_anonymous berasal dari token yang sudah diverifikasi Agent B.
  -- Cocokkan dengan auth.users agar service_role tidak bisa salah kategori.
  select u.is_anonymous into v_user_anonymous
  from auth.users u
  where u.id = p_user_id;

  if not found or v_user_anonymous is distinct from p_is_anonymous then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  v_is_anonymous := p_is_anonymous;

  if not v_is_anonymous then
    select p.suspended into v_suspended
    from public.profiles p
    where p.user_id = p_user_id;

    if coalesce(v_suspended, false) then
      perform app_private.raise_error('USER_SUSPENDED');
    end if;
  end if;

  -- Kunci room sejak awal: serialisasi password, kursi, dan percobaan.
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

  if v_room.listing_status = 'BANNED' then
    perform app_private.raise_error('ROOM_BANNED');
  end if;

  if v_room.visibility = 'PUBLIC'
     and v_room.listing_status = 'HIDDEN' then
    perform app_private.raise_error('ROOM_HIDDEN');
  end if;

  if v_room.visibility = 'PUBLIC'
     and not coalesce(
       app_private.config_bool('public_rooms_enabled'),
       false
     ) then
    perform app_private.raise_error('FEATURE_DISABLED');
  end if;

  v_threshold := coalesce(app_private.config_int('lockout_fail_threshold'), 5);
  v_window := coalesce(app_private.config_int('lockout_window_minutes'), 15);
  v_duration := coalesce(app_private.config_int('lockout_duration_minutes'), 15);
  v_cooldown := coalesce(app_private.config_int('room_cooldown_minutes'), 10);
  v_failure_cap := coalesce(
    app_private.config_int('room_failure_cap_per_hour'),
    200
  );

  -- Cooldown seluruh room.
  select count(*)::int, max(a.created_at)
  into v_attempts, v_last_fail
  from public.join_attempts a
  where a.room_id = v_room.id
    and a.success = false
    and a.created_at > now() - interval '1 hour';

  if v_attempts >= v_failure_cap then
    v_retry := ceil(
      extract(
        epoch from v_last_fail + make_interval(mins => v_cooldown) - now()
      )
    )::int;

    if v_retry > 0 then
      perform app_private.raise_error(
        'ROOM_COOLDOWN',
        jsonb_build_object('retry_after', v_retry)::text
      );
    end if;
  end if;

  -- Lockout per (room, ip_hash).
  select count(*)::int, max(a.created_at)
  into v_attempts, v_last_fail
  from public.join_attempts a
  where a.room_id = v_room.id
    and a.ip_hash = p_ip_hash
    and a.success = false
    and a.created_at > now() - make_interval(mins => v_window);

  if v_attempts >= v_threshold then
    v_retry := ceil(
      extract(
        epoch from v_last_fail + make_interval(mins => v_duration) - now()
      )
    )::int;

    if v_retry > 0 then
      perform app_private.raise_error(
        'LOCKED',
        jsonb_build_object('retry_after', v_retry)::text
      );
    end if;
  end if;

  -- Sudah pernah menjadi member: status terminal / idempoten.
  select m.* into v_member
  from public.member_identities mi
  join public.room_members m on m.id = mi.member_id
  where mi.room_id = v_room.id
    and mi.user_id = p_user_id
    and m.room_id = mi.room_id
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
      return query
      select v_member.status, v_room.id, v_member.id, v_member.handle;
      return;
    end if;
  end if;

  if v_room.visibility = 'PUBLIC' then
    -- Rate limit join publik per (room, ip_hash), dihitung dari join_attempts.
    v_public_limit := coalesce(
      app_private.config_int('public_join_per_ip_per_hour'),
      20
    );

    select count(*)::int, min(a.created_at)
    into v_attempts, v_first_attempt
    from public.join_attempts a
    where a.room_id = v_room.id
      and a.ip_hash = p_ip_hash
      and a.created_at > now() - interval '1 hour';

    if v_attempts >= v_public_limit then
      v_retry := greatest(
        1,
        ceil(
          extract(
            epoch from v_first_attempt + interval '1 hour' - now()
          )
        )::int
      );

      perform app_private.raise_error(
        'RATE_LIMITED',
        jsonb_build_object('retry_after', v_retry)::text
      );
    end if;
  else
    -- Password room case-insensitive: selalu hash versi UPPERCASE.
    -- Percobaan gagal dicatat Agent B lewat record_join_failure().
    if extensions.crypt(upper(p_password), v_room.password_hash)
       is distinct from v_room.password_hash then
      perform app_private.raise_error('WRONG_PASSWORD');
    end if;
  end if;

  v_max_rooms := coalesce(
    app_private.config_int(
      case
        when v_is_anonymous then 'anon_max_active_rooms'
        else 'login_max_active_rooms'
      end
    ),
    case when v_is_anonymous then 1 else 5 end
  );

  select count(*)::int into v_active_rooms
  from public.member_identities mi
  join public.room_members m on m.id = mi.member_id
  join public.rooms r on r.id = mi.room_id
  where mi.user_id = p_user_id
    and mi.room_id <> v_room.id
    and m.room_id = mi.room_id
    and m.status in (
      'PENDING'::public.member_status,
      'APPROVED'::public.member_status
    )
    and r.closed_at is null
    and now() < r.expires_at;

  if v_active_rooms >= v_max_rooms then
    if v_is_anonymous then
      perform app_private.raise_error('ONE_ROOM_LIMIT');
    else
      perform app_private.raise_error('MAX_ROOMS_PER_GUEST');
    end if;
  end if;

  -- Lepas kursi idle secara lazy sebelum menghitung kapasitas.
  perform public.release_idle_members(v_room.id);

  if v_room.approval_required then
    select count(*)::int into v_pending
    from public.room_members m
    where m.room_id = v_room.id
      and m.status = 'PENDING'::public.member_status;

    v_pending_mult := coalesce(
      app_private.config_int('pending_cap_multiplier'),
      2
    );

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
      room_id, handle, handle_verified, status, password_version,
      status_changed_at
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
        handle = case
          when v_is_anonymous then coalesce(v_member.handle, v_handle)
          else v_handle
        end,
        handle_verified = case
          when v_is_anonymous and v_member.handle is not null
            then v_member.handle_verified
          else v_handle_verified
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

  -- Hanya tercatat bila seluruh proses join berhasil (transaksi commit).
  insert into public.join_attempts (room_id, ip_hash, success)
  values (v_room.id, p_ip_hash, true);

  return query
  select v_member.status, v_room.id, v_member.id, v_member.handle;
end;
$$;

-- 7. Grant eksplisit. join_room hanya untuk service_role.
revoke all on function public.get_room_public(text) from public, anon, authenticated;
revoke all on function public.rejoin_room(uuid) from public, anon, authenticated;
revoke all on function public.my_rooms() from public, anon, authenticated;
revoke all on function public.list_messages(uuid, bigint, bigint, int) from public, anon, authenticated;
revoke all on function public.send_message(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.join_room(uuid, boolean, text, text, text) from public, anon, authenticated;

grant execute on function public.get_room_public(text) to authenticated;
grant execute on function public.rejoin_room(uuid) to authenticated;
grant execute on function public.my_rooms() to authenticated;
grant execute on function public.list_messages(uuid, bigint, bigint, int) to authenticated;
grant execute on function public.send_message(uuid, text, uuid) to authenticated;
grant execute on function public.join_room(uuid, boolean, text, text, text) to service_role;
