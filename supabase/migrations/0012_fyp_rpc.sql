-- 0012: FYP — list_public_rooms (kolom whitelist), report_room
-- (auto-HIDDEN pada ambang laporan unik), dan job refresh_room_stats.
-- Sumber kontrak: TASK.md bagian 5-6 (Publik/FYP) dan D-18/D-20.
-- Kunci keamanan: FYP hanya metadata; membaca isi chat selalu lewat join.

-- 1. refresh_room_stats: rekalkulasi penuh; dijadwalkan tiap menit.
create or replace function public.refresh_room_stats()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.room_stats (
    room_id, approved_count, messages_last_hour, last_message_at, updated_at
  )
  select
    r.id,
    coalesce(c.approved_count, 0),
    coalesce(c.messages_last_hour, 0),
    c.last_message_at,
    now()
  from public.rooms r
  left join lateral (
    select
      count(*) filter (
        where m.status = 'APPROVED'::public.member_status
      ) as approved_count,
      (
        select count(*)
        from public.messages mm
        where mm.room_id = r.id
          and mm.created_at > now() - interval '1 hour'
      ) as messages_last_hour,
      (
        select max(mm.created_at)
        from public.messages mm
        where mm.room_id = r.id
      ) as last_message_at
    from public.room_members m
    where m.room_id = r.id
  ) c on true
  on conflict (room_id) do update set
    approved_count = excluded.approved_count,
    messages_last_hour = excluded.messages_last_hour,
    last_message_at = excluded.last_message_at,
    updated_at = now();
end;
$$;

revoke all on function public.refresh_room_stats()
  from public, anon, authenticated;

-- Publik per menit (nama job sama = update jadwal, idempoten).
select cron.schedule(
  'refresh-room-stats',
  '* * * * *',
  $$select public.refresh_room_stats();$$
);

-- 2. list_public_rooms: satu-satunya titik FYP. Hanya kolom whitelist
--    D-18: slug/name/description/category/approved_count/max_guests/
--    last_activity_at/is_full. Privatisasi/banned/closed tak pernah tampil.
create or replace function public.list_public_rooms(
  p_sort text default 'ACTIVE',
  p_category text default null,
  p_q text default null,
  p_cursor text default null,
  p_limit int default 20
)
returns table (
  slug text,
  name text,
  description text,
  category text,
  approved_count int,
  max_guests int,
  last_activity_at timestamptz,
  is_full boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cursor_room public.rooms%rowtype;
  v_cursor_stats public.room_stats%rowtype;
  v_cursor_found boolean := false;
  v_limit int;
begin
  if coalesce(app_private.config_bool('public_rooms_enabled'), false) is not true then
    perform app_private.raise_error('FEATURE_DISABLED');
  end if;

  if p_sort is null or p_sort not in ('ACTIVE', 'NEW') then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  v_limit := least(greatest(coalesce(p_limit, 20), 1), 50);

  if p_cursor is not null then
    select r.* into v_cursor_room
    from public.rooms r
    where r.slug = p_cursor;

    -- Kursor tak dikenal: halaman selanjutnya kosong (client reset filter).
    v_cursor_found := found;

    if v_cursor_found then
      select s.* into v_cursor_stats
      from public.room_stats s
      where s.room_id = v_cursor_room.id;
    end if;
  end if;

  if p_sort = 'ACTIVE' then
    return query
    select
      r.slug,
      r.name,
      r.description,
      r.category,
      coalesce(s.approved_count, 0),
      r.max_guests,
      s.last_message_at,
      coalesce(s.approved_count, 0) >= r.max_guests
    from public.rooms r
    left join public.room_stats s on s.room_id = r.id
    where r.visibility = 'PUBLIC'
      and r.listing_status = 'LISTED'
      and r.closed_at is null
      and now() < r.expires_at
      and (p_category is null or r.category = p_category)
      and (
        p_q is null
        or btrim(p_q) = ''
        or strpos(lower(r.name), lower(btrim(p_q))) > 0
      )
      and (p_cursor is null or v_cursor_found)
      and (
        p_cursor is null
        or (coalesce(s.messages_last_hour, 0),
            coalesce(s.approved_count, 0),
            r.slug)
           < (coalesce(v_cursor_stats.messages_last_hour, 0),
              coalesce(v_cursor_stats.approved_count, 0),
              v_cursor_room.slug)
      )
    order by
      coalesce(s.messages_last_hour, 0) desc,
      coalesce(s.approved_count, 0) desc,
      r.slug desc
    limit v_limit;
  else
    return query
    select
      r.slug,
      r.name,
      r.description,
      r.category,
      coalesce(s.approved_count, 0),
      r.max_guests,
      s.last_message_at,
      coalesce(s.approved_count, 0) >= r.max_guests
    from public.rooms r
    left join public.room_stats s on s.room_id = r.id
    where r.visibility = 'PUBLIC'
      and r.listing_status = 'LISTED'
      and r.closed_at is null
      and now() < r.expires_at
      and (p_category is null or r.category = p_category)
      and (
        p_q is null
        or btrim(p_q) = ''
        or strpos(lower(r.name), lower(btrim(p_q))) > 0
      )
      and (p_cursor is null or v_cursor_found)
      and (
        p_cursor is null
        or (r.listed_at, r.slug)
           < (v_cursor_room.listed_at, v_cursor_room.slug)
      )
    order by r.listed_at desc, r.slug desc
    limit v_limit;
  end if;
end;
$$;

revoke all on function public.list_public_rooms(text, text, text, text, int)
  from public, anon, authenticated;

grant execute on function public.list_public_rooms(text, text, text, text, int)
  to anon, authenticated;

-- 3. report_room: laporan untuk login user atau member room.
--    PRIVAT hanya boleh oleh member (APPROVED/IDLE); host tak boleh
--    melaporkan room miliknya; satu pelapor cukup sekali (unique).
--    Pelapor unik mencapai report_hide_threshold => HIDDEN otomatis.
create or replace function public.report_room(
  p_room_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_anon boolean := app_private.is_anonymous();
  v_room public.rooms%rowtype;
  v_is_member boolean;
  v_threshold int;
begin
  if p_room_id is null
     or coalesce(p_reason, '') not in ('SPAM', 'ABUSE', 'ILLEGAL', 'OTHER') then
    perform app_private.raise_error('INVALID_INPUT');
  end if;

  select r.* into v_room
  from public.rooms r
  where r.id = p_room_id
  for update;

  if not found then
    perform app_private.raise_error('NOT_FOUND');
  end if;

  if v_room.host_id = v_uid then
    perform app_private.raise_error('REPORT_NOT_ALLOWED');
  end if;

  -- Pelapor suspended (login) ditolak; anonim tanpa profil lewat di sini.
  if not v_anon then
    if coalesce(
      (select p.suspended
       from public.profiles p
       where p.user_id = v_uid),
      false
    ) then
      perform app_private.raise_error('USER_SUSPENDED');
    end if;
  end if;

  v_is_member := exists (
    select 1
    from public.member_identities mi
    join public.room_members m on m.id = mi.member_id
    where mi.room_id = v_room.id
      and mi.user_id = v_uid
      and m.room_id = mi.room_id
      and m.status in (
        'APPROVED'::public.member_status,
        'IDLE'::public.member_status
      )
  );

  if v_room.visibility = 'PRIVATE' and not v_is_member then
    perform app_private.raise_error('REPORT_NOT_ALLOWED');
  end if;

  if v_room.visibility = 'PUBLIC'
     and not (not v_anon or v_is_member) then
    perform app_private.raise_error('REPORT_NOT_ALLOWED');
  end if;

  if exists (
    select 1
    from public.room_reports rr
    where rr.room_id = v_room.id
      and rr.reporter_user_id = v_uid
  ) then
    perform app_private.raise_error('ALREADY_REPORTED');
  end if;

  insert into public.room_reports (room_id, reporter_user_id, reason)
  values (v_room.id, v_uid, p_reason);

  -- Satu pelapor dihitung sekali (unique(room_id, reporter_user_id)).
  select coalesce(
    app_private.config_int('report_hide_threshold'),
    3
  ) into v_threshold;

  if (
    select count(*)::int
    from public.room_reports rr
    where rr.room_id = v_room.id
  ) >= v_threshold then
    update public.rooms r
    set listing_status = 'HIDDEN',
        listed_at = null
    where r.id = v_room.id;
  end if;
end;
$$;

revoke all on function public.report_room(uuid, text)
  from public, anon, authenticated;

grant execute on function public.report_room(uuid, text)
  to anon, authenticated;
