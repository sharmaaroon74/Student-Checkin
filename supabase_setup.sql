-- Sunny Days DB setup (Version 5)

-- Types
do $$ begin
  if not exists (select 1 from pg_type where typname = 'school_name') then
    create type school_name as enum ('Bain','QG','MHE','MC');
  end if;
end $$;

do $$ begin
  if not exists (select 1 from pg_type where typname = 'status') then
    create type status as enum ('not_picked','picked','arrived','checked','skipped');
  end if;
end $$;

-- Rooms
create table if not exists public.rooms (
  id serial primary key,
  label text not null unique
);

-- Students
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  first_name text not null,
  last_name  text not null,
  room_id int references public.rooms(id) on delete set null,
  school school_name not null,
  approved_pickups text[] not null default '{}',
  no_bus_days text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Constrain no_bus_days to M/T/W/R/F
alter table public.students drop constraint if exists no_bus_days_chk;
alter table public.students
  add constraint no_bus_days_chk
  check (no_bus_days is null or no_bus_days <@ array['M','T','W','R','F']::text[]);

-- Roster (per-day status)
create table if not exists public.roster_status (
  id bigserial primary key,
  roster_date date not null,
  student_id uuid not null references public.students(id) on delete cascade,
  current_status status not null default 'not_picked',
  last_update timestamptz not null default now(),
  unique (roster_date, student_id)
);

-- Logs
create table if not exists public.logs (
  id bigserial primary key,
  at timestamptz not null default now(),
  roster_date date not null,
  student_id uuid not null references public.students(id) on delete cascade,
  student_name text not null,
  room_id int,
  school school_name,
  action text not null,
  pickup_person text,
  meta jsonb
);

create index if not exists logs_by_date on public.logs (roster_date, at desc);
create index if not exists logs_by_student on public.logs (student_id, at desc);

-- Seed rooms
insert into public.rooms(label) values ('1'),('2'),('3'),('4'),('5')
on conflict do nothing;

-- RLS
alter table public.students enable row level security;
alter table public.roster_status enable row level security;
alter table public.logs enable row level security;

-- Read policies
drop policy if exists students_read on public.students;
create policy students_read on public.students
  for select using (auth.role() = 'authenticated');

drop policy if exists roster_read on public.roster_status;
create policy roster_read on public.roster_status
  for select using (auth.role() = 'authenticated');

drop policy if exists logs_read on public.logs;
create policy logs_read on public.logs
  for select using (auth.role() = 'authenticated');

-- RPCs (SECURITY DEFINER)
create or replace function public.api_set_status(
  p_student_id uuid,
  p_roster_date date,
  p_new_status status,
  p_pickup_person text default null,
  p_meta jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.roster_status (roster_date, student_id, current_status)
  values (p_roster_date, p_student_id, p_new_status)
  on conflict (roster_date, student_id)
  do update set current_status = excluded.current_status, last_update = now();

  insert into public.logs (roster_date, student_id, student_name, room_id, school, action, pickup_person, meta)
  select p_roster_date, s.id, s.first_name || ' ' || s.last_name, s.room_id, s.school,
         p_new_status::text, p_pickup_person, p_meta
  from public.students s where s.id = p_student_id;
end $$;

create or replace function public.api_daily_reset(p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare wd text := to_char(p_date, 'DY');
begin
  wd := case wd
          when 'MON' then 'M' when 'TUE' then 'T' when 'WED' then 'W'
          when 'THU' then 'R' when 'FRI' then 'F' else null end;

  delete from public.roster_status where roster_date = p_date;

  insert into public.roster_status (roster_date, student_id, current_status)
  select p_date, id,
         case when wd is not null and wd = any(no_bus_days) then 'skipped'::status else 'not_picked'::status end
  from public.students where active;

  insert into public.logs (roster_date, student_id, student_name, room_id, school, action, meta)
  select p_date, s.id, s.first_name || ' ' || s.last_name, s.room_id, s.school,
         'auto_skip_dow', jsonb_build_object('note','auto_dow')
  from public.students s
  where active and wd is not null and wd = any(no_bus_days);
end $$;

-- Grants
grant usage on schema public to authenticated;
grant execute on function public.api_set_status(uuid, date, status, text, jsonb) to authenticated;
grant execute on function public.api_daily_reset(date) to authenticated;
