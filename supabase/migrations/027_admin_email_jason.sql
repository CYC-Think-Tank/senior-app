-- Allow jason@thecyc.org to receive the admin role.
--
-- Signup and handle_new_user() read admin_emails only when the account is
-- created, so an address added later would stay a family account. Promote a
-- profile that already exists for this address.

insert into public.admin_emails (email)
values ('jason@thecyc.org')
on conflict (email) do nothing;

update public.profiles
set role = 'admin'
where lower(email) = 'jason@thecyc.org'
  and role <> 'admin';
