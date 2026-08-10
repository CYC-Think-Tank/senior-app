-- Optional AI-created animated memoir films for finished conversations.

create table public.conversation_videos (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.sessions (id) on delete cascade,
  status text not null default 'planning'
    check (status in ('planning', 'preparing', 'generating', 'rendering', 'ready', 'failed')),
  title text,
  story_ciphertext text,
  narration_ciphertext text,
  visual_bible_ciphertext text,
  narration_path text,
  video_path text,
  duration_ms integer,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.conversation_video_scenes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.conversation_videos (id) on delete cascade,
  idx integer not null,
  prompt_ciphertext text not null,
  duration_seconds integer not null check (duration_seconds between 4 and 10),
  provider_task_id text,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  result_url text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, idx)
);

create index conversation_video_scenes_video_idx
  on public.conversation_video_scenes (video_id, idx);
create index conversation_videos_status_idx
  on public.conversation_videos (status, updated_at);

alter table public.conversation_videos enable row level security;
alter table public.conversation_video_scenes enable row level security;

create policy "admin manages conversation videos"
  on public.conversation_videos for all
  using (public.is_admin()) with check (public.is_admin());

create policy "storytellers read their conversation videos"
  on public.conversation_videos for select
  using (
    exists (
      select 1
      from public.sessions s
      join public.guests g on g.id = s.guest_id
      where s.id = conversation_videos.session_id
        and s.status = 'ready'
        and g.user_id = auth.uid()
    )
  );

create policy "admin manages conversation video scenes"
  on public.conversation_video_scenes for all
  using (public.is_admin()) with check (public.is_admin());

insert into storage.buckets (id, name, public)
values ('story-videos', 'story-videos', false)
on conflict (id) do nothing;
