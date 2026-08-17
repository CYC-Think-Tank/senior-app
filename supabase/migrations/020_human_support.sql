-- WiseShare AI-assisted human support. Seniors submit a need; the assessment
-- routes it to a safe provider tier and staff can supervise the full queue.

create table public.support_providers (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  provider_type text not null check (provider_type in ('high_school', 'college', 'staff')),
  languages text[] not null default '{}',
  skills text[] not null default '{}',
  interests text[] not null default '{}',
  service_modes text[] not null default '{virtual}'
    check (service_modes <@ array['virtual', 'nearby', 'either']::text[]),
  locations text[] not null default '{}',
  availability text not null default '',
  successful_matches integer not null default 0 check (successful_matches >= 0),
  verified boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles (id) on delete cascade,
  request_text text not null check (char_length(request_text) between 3 and 2000),
  assistance_type text not null check (assistance_type in ('technology', 'companionship', 'appointments', 'daily_tasks', 'other')),
  urgency text not null check (urgency in ('routine', 'soon', 'urgent', 'emergency')),
  preferred_language text not null,
  location text not null default '',
  service_mode text not null check (service_mode in ('virtual', 'nearby', 'either')),
  availability text not null default '',
  required_skills text[] not null default '{}',
  provider_preference text not null check (provider_preference in ('high_school', 'college', 'staff', 'no_preference')),
  safety_level text not null check (safety_level in ('volunteer_eligible', 'staff_required', 'emergency')),
  recommended_tier text not null check (recommended_tier in ('high_school', 'college', 'staff', 'emergency')),
  assessment_summary text not null,
  safety_reason text not null,
  share_summary text not null,
  match_score integer check (match_score between 0 and 100),
  matched_provider_id uuid references public.support_providers (id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'matched', 'accepted', 'in_progress', 'resolved', 'escalated', 'cancelled')),
  feedback text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_requests_requester_idx on public.support_requests (requester_id, created_at desc);
create index support_requests_queue_idx on public.support_requests (status, urgency, created_at);
create index support_providers_active_idx on public.support_providers (active, provider_type);

alter table public.support_requests enable row level security;
alter table public.support_providers enable row level security;

create policy "people read their own support requests" on public.support_requests
  for select using (requester_id = auth.uid());

create policy "admins manage support requests" on public.support_requests
  for all using (public.is_admin()) with check (public.is_admin());

-- Provider rosters are deliberately staff-only. A senior receives just the
-- matched provider fields returned by the authenticated server action.
create policy "admins manage support providers" on public.support_providers
  for all using (public.is_admin()) with check (public.is_admin());
