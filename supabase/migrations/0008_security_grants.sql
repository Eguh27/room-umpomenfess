-- 0008: boundary keamanan untuk tabel baru dan helper Admin/email.
-- Sumber kontrak: TASK.md bagian 5 dan 10 (S-15, S-26).
-- Tabel statistik/laporan/riwayat/handle reserved tidak pernah diakses client.

-- Default privilege tetap tertutup untuk objek yang dibuat setelah ini.
alter default privileges in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app_private
  revoke execute on functions from public, anon, authenticated;

revoke all on schema app_private from public, anon;
grant usage on schema app_private to authenticated;

-- 1. Profil: client hanya boleh membaca barisnya sendiri.
-- Handle, role, tier, dan suspended tidak boleh diubah client.
revoke all on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;

drop policy if exists profiles_select_self on public.profiles;
create policy profiles_select_self
  on public.profiles for select to authenticated
  using (user_id = auth.uid());

-- 2. Tabel baru: RLS aktif, tanpa policy, tanpa grant client.
alter table public.room_stats enable row level security;
alter table public.room_reports enable row level security;
alter table public.handle_history enable row level security;
alter table public.reserved_handles enable row level security;

revoke all on table public.room_stats from public, anon, authenticated;
revoke all on table public.room_reports from public, anon, authenticated;
revoke all on table public.handle_history from public, anon, authenticated;
revoke all on table public.reserved_handles from public, anon, authenticated;

revoke all on sequence public.room_reports_id_seq from public, anon, authenticated;
revoke all on sequence public.handle_history_id_seq from public, anon, authenticated;

-- 3. Helper Admin dan konfirmasi email. Keduanya hanya dipakai RPC
-- SECURITY DEFINER; tidak ada grant EXECUTE ke client.
create or replace function app_private.is_admin_aal2()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.user_id = auth.uid()
      and p.role = 'admin'
      and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
  );
$$;

create or replace function app_private.is_email_confirmed()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and u.email_confirmed_at is not null
  );
$$;

revoke all on function app_private.is_admin_aal2() from public, anon, authenticated;
revoke all on function app_private.is_email_confirmed() from public, anon, authenticated;

-- Catatan: list_public_rooms sengaja belum dibuat/di-grant di sini.
-- Fungsi dan grant-nya dibuat pada T-18.
