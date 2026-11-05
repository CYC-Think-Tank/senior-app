-- Allow curtis.poon@thecyc.org to receive the admin role.
--
-- Signup and handle_new_user() read admin_emails only when the account is
-- created, so an address added later would stay a family account. Promote a
-- profile that already exists for this address.

insert into public.admin_emails (email)
values ('curtis.poon@thecyc.org')
on conflict (email) do nothing;

update public.profiles
set role = 'admin'
where lower(email) = 'curtis.poon@thecyc.org'
  and role <> 'admin';
