begin;

-- Approval is the publication event. Keep review tokens and private recording
-- data behind the server; the public /feed route exposes only approved episode
-- fields and short-lived signed audio URLs.
update public.episodes
set publish_at = least(coalesce(publish_at, now()), now())
where status in ('approved', 'published');

create or replace function public.set_episode_publish_time_on_approval()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status in ('approved', 'published')
    and old.status not in ('approved', 'published') then
    new.publish_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists set_episode_publish_time_on_approval on public.episodes;
create trigger set_episode_publish_time_on_approval
before update of status on public.episodes
for each row
execute function public.set_episode_publish_time_on_approval();

commit;
