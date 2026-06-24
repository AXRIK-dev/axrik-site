-- ============================================================
-- AXRIK — Website Enquiries
-- Run this once in the Supabase SQL editor (same project as the portal).
-- Stores every enquiry from the public site contact form.
-- Security model: anyone can SUBMIT, only admins can READ.
-- ============================================================

create table if not exists public.enquiries (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  business    text,
  email       text not null,
  message     text not null,
  source      text default 'website',
  status      text default 'new' check (status in ('new','read','replied','archived')),
  user_agent  text,
  created_at  timestamptz default now() not null
);

-- RLS is non-negotiable — enable immediately.
alter table public.enquiries enable row level security;

-- 1) Anyone (including anonymous website visitors) can submit an enquiry.
--    INSERT only — they cannot read anything back.
drop policy if exists "Anyone can submit an enquiry" on public.enquiries;
create policy "Anyone can submit an enquiry"
  on public.enquiries
  for insert
  to anon, authenticated
  with check (
    length(name) between 1 and 200
    and length(email) between 3 and 320
    and length(message) between 1 and 5000
  );

-- 2) Only admins can read enquiries (role stored in user_metadata).
drop policy if exists "Admins read enquiries" on public.enquiries;
create policy "Admins read enquiries"
  on public.enquiries
  for select
  to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- 3) Only admins can update an enquiry (e.g. mark read / replied / archived).
drop policy if exists "Admins update enquiries" on public.enquiries;
create policy "Admins update enquiries"
  on public.enquiries
  for update
  to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin')
  with check ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- No DELETE policy on purpose: nobody can delete via the public API.
-- Archive instead (status = 'archived'). You can still manage rows from the
-- Supabase dashboard, which bypasses RLS.

-- Helpful index for the admin inbox view (newest first).
create index if not exists enquiries_created_at_idx
  on public.enquiries (created_at desc);
