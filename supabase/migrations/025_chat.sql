-- Direct messages and named group chats between accepted friends.
--
-- The app connects as the database owner, which bypasses row-level security,
-- so membership checks live in src/lib/chat.ts. A stranger who is not a
-- member of the thread never receives its rows from those queries.

create table public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  title text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  direct_low uuid references public.profiles (id) on delete cascade,
  direct_high uuid references public.profiles (id) on delete cascade,
  constraint chat_threads_shape check (
    (
      kind = 'direct'
      and title is null
      and direct_low is not null
      and direct_high is not null
      and direct_low < direct_high
    )
    or (
      kind = 'group'
      and title is not null
      and char_length(title) between 1 and 80
      and direct_low is null
      and direct_high is null
    )
  )
);

create unique index chat_threads_direct_pair_key
  on public.chat_threads (direct_low, direct_high);

create table public.chat_members (
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  primary key (thread_id, user_id)
);

create index chat_members_user_idx on public.chat_members (user_id);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  author_name text not null,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index chat_messages_thread_created_idx
  on public.chat_messages (thread_id, created_at);
