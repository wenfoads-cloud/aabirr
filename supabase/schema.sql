-- Run once in Supabase: SQL Editor -> New query -> paste -> Run.

create table if not exists public.teachers (
  id            text primary key,
  name          text not null,
  grades        text[] not null,
  password_hash text not null default ''
);

create table if not exists public.works (
  id         text primary key,
  teacher_id text not null references public.teachers(id),
  grade      text not null check (grade in ('3','4','5')),
  kind       text not null check (kind in ('photo','audio')),
  student    text not null,
  path       text not null,
  created_at timestamptz not null default now()
);
create index if not exists works_created_idx on public.works (created_at desc);

-- No policies on purpose: only the Netlify functions (service role key) touch these tables.
alter table public.teachers enable row level security;
alter table public.works    enable row level security;

insert into public.teachers (id, name, grades) values
  ('t1', 'أسماء الفلاج', '{5}'),
  ('t2', 'لطيفة الشمري', '{3,4}'),
  ('t3', 'وئام الوشيل', '{3}')
on conflict (id) do update set name = excluded.name, grades = excluded.grades;

-- Public bucket: anyone can view files; uploads only through signed URLs issued by the functions.
insert into storage.buckets (id, name, public) values ('works', 'works', true)
on conflict (id) do update set public = true;
