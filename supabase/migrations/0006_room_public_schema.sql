-- 0006: delta skema non-identitas untuk room publik/FYP.
-- Sumber kontrak: TASK.md bagian 3 dan 4.
-- Migration aditif: 0001-0005 tidak diubah.

-- 1. Kolom visibilitas dan metadata FYP pada rooms.
alter table public.rooms
  add column visibility text not null default 'PRIVATE',
  add column description text,
  add column category text,
  add column listing_status text not null default 'LISTED',
  add column listed_at timestamptz;

alter table public.rooms
  add constraint rooms_visibility_check
    check (visibility in ('PRIVATE', 'PUBLIC')),
  add constraint rooms_description_check
    check (description is null or char_length(description) <= 200),
  add constraint rooms_listing_status_check
    check (listing_status in ('LISTED', 'HIDDEN', 'BANNED'));

-- Room PUBLIC tidak memakai password; room PRIVATE wajib memilikinya.
alter table public.rooms
  alter column password_hash drop not null;

alter table public.rooms
  add constraint rooms_visibility_password_check
    check ((visibility = 'PRIVATE') = (password_hash is not null));

-- 2. Kuota room publik per tier. Nilai awal mengikuti TASK.md bagian 3.
alter table public.tier_limits
  add column max_public_rooms int not null default 0;

alter table public.tier_limits
  add constraint tier_limits_max_public_rooms_check
    check (max_public_rooms >= 0);

update public.tier_limits set max_public_rooms = 1 where tier = 'free';
update public.tier_limits set max_public_rooms = 3 where tier = 'premium';

-- 3. Statistik dan laporan room. Keduanya hanya diakses lewat RPC internal.
create table public.room_stats (
  room_id uuid primary key references public.rooms (id) on delete cascade,
  approved_count int not null default 0,
  messages_last_hour int not null default 0,
  last_message_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.room_reports (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms (id) on delete cascade,
  reporter_user_id uuid not null references auth.users (id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint room_reports_reason_check
    check (reason in ('SPAM', 'ABUSE', 'ILLEGAL', 'OTHER')),
  constraint room_reports_room_reporter_key
    unique (room_id, reporter_user_id)
);

alter table public.room_stats enable row level security;
alter table public.room_reports enable row level security;

revoke all on table public.room_stats from public, anon, authenticated;
revoke all on table public.room_reports from public, anon, authenticated;
revoke all on sequence public.room_reports_id_seq from public, anon, authenticated;

-- 4. Konfigurasi baru. `categories` disimpan sebagai array JSON.
insert into public.app_config (key, value)
values
  ('anon_max_active_rooms', '1'::jsonb),
  ('login_max_active_rooms', '5'::jsonb),
  ('public_rooms_enabled', 'false'::jsonb),
  ('public_join_per_ip_per_hour', '20'::jsonb),
  ('report_hide_threshold', '3'::jsonb),
  ('public_idle_default_minutes', '15'::jsonb),
  ('feed_cache_seconds', '30'::jsonb),
  ('public_description_max', '200'::jsonb),
  (
    'categories',
    '["umum", "kampus", "hobi", "curhat", "game", "belajar", "lainnya"]'::jsonb
  )
on conflict (key) do update set
  value = excluded.value,
  updated_at = now();

delete from public.app_config where key = 'max_rooms_per_guest';

-- 5. Kompatibilitas sementara: join_room versi lama tetap memakai
-- anon_max_active_rooms/login_max_active_rooms sampai T-13a menggantinya.
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
  v_member_no int;
  v_display text;
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

  -- Kunci room sejak awal: serialisasi percobaan password, kursi, dan penomoran.
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

  -- Cooldown seluruh room.
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
      extract(epoch from (v_last_fail + make_interval(mins => v_duration) - now()))
    )::int;

    if v_retry > 0 then
      perform app_private.raise_error(
        'LOCKED',
        jsonb_build_object('retry_after', v_retry)::text
      );
    end if;
  end if;

  -- Sudah pernah menjadi member: status tertentu tidak boleh mencoba password lagi.
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
      return query select v_member.status, v_room.id, v_member.id, v_member.display_name;
      return;
    end if;
  end if;

  -- Password room case-insensitive: selalu hash versi UPPERCASE.
  -- Catatan: percobaan GAGAL tidak bisa dicatat di sini karena exception akan
  -- me-rollback seluruh statement. Agent B mencatatnya lewat record_join_failure().
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

  -- Lepas kursi idle secara lazy sebelum menghitung kapasitas.
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
    v_member_no := v_member.member_no;
    v_display := v_member.display_name;
  else
    select count(*)::int into v_approved
    from public.room_members m
    where m.room_id = v_room.id
      and m.status = 'APPROVED'::public.member_status;

    if v_approved >= v_room.max_guests then
      perform app_private.raise_error('ROOM_FULL');
    end if;

    v_status := 'APPROVED'::public.member_status;

    if v_member.id is null or v_member.member_no is null then
      v_member_no := app_private.next_guest_number(v_room.id);
      v_display := app_private.guest_display_name(v_member_no);
    else
      v_member_no := v_member.member_no;
      v_display := v_member.display_name;
    end if;
  end if;

  if v_member.id is null then
    insert into public.room_members (
      room_id, member_no, display_name, status, password_version, status_changed_at
    )
    values (
      v_room.id, v_member_no, v_display, v_status, v_room.password_version, now()
    )
    returning * into v_member;

    insert into public.member_identities (member_id, room_id, user_id)
    values (v_member.id, v_room.id, p_user_id);
  else
    update public.room_members m
    set status = v_status,
        member_no = v_member_no,
        display_name = v_display,
        password_version = v_room.password_version,
        status_changed_at = now()
    where m.id = v_member.id
    returning * into v_member;
  end if;

  -- `member_id` adalah nama kolom OUT pada fungsi ini, jadi pakai nama constraint.
  insert into public.member_activity (member_id, last_active_at)
  values (v_member.id, now())
  on conflict on constraint member_activity_pkey
  do update set last_active_at = excluded.last_active_at;

  -- Hanya tercatat bila seluruh proses join berhasil (transaksi commit).
  insert into public.join_attempts (room_id, ip_hash, success)
  values (v_room.id, p_ip_hash, true);

  return query select v_member.status, v_room.id, v_member.id, v_member.display_name;
end;
$$;
