-- ============================================================================
-- R9 — RLS policy tests (pgTAP)
--
-- Proves the row-level-security policies the whole client-direct model (R1)
-- relies on. Run with:  supabase test db
--
-- Covered:
--   • owner-only CRUD (own reads/writes; cross-tenant denied)
--   • caregiver family-read (viewer + dose_logger can read owner data)
--   • dose_logger may INSERT a dose for the owner; viewer may not; stranger may not
--   • ICE: anon has NO base-table SELECT; only get_public_ice_profile() works
--   • cross-tenant profile read denied
--
-- Auth context is simulated the Supabase way: RESET ROLE (back to the superuser
-- test role), set a `request.jwt.claims` JSON whose `sub` is the acting user id
-- (auth.uid() reads it), then SET LOCAL ROLE to authenticated/anon so RLS applies.
-- Seeding runs first as the superuser role, so RLS is bypassed for setup.
-- ============================================================================

begin;
select plan(16);

-- A = owner, B = dose_logger caregiver of A, C = viewer caregiver of A, D = stranger
\set A '00000000-0000-0000-0000-0000000000aa'
\set B '00000000-0000-0000-0000-0000000000bb'
\set C '00000000-0000-0000-0000-0000000000cc'
\set D '00000000-0000-0000-0000-0000000000dd'
\set MED '00000000-0000-0000-0000-0000000ed001'

-- ── Seed auth users (trigger on_auth_user_created creates their profiles) ───
insert into auth.users (id, email, raw_user_meta_data) values
  (:'A', 'a@test.dev', '{"full_name":"Owner A"}'),
  (:'B', 'b@test.dev', '{"full_name":"Logger B"}'),
  (:'C', 'c@test.dev', '{"full_name":"Viewer C"}'),
  (:'D', 'd@test.dev', '{"full_name":"Stranger D"}');

insert into family_members (owner_id, invitee_id, invitee_email, role, status) values
  (:'A', :'B', 'b@test.dev', 'dose_logger', 'accepted'),
  (:'A', :'C', 'c@test.dev', 'viewer',      'accepted');

insert into medications (id, profile_id, name, is_active, pill_count)
  values (:'MED', :'A', 'Test Med', true, 30);
insert into vitals (profile_id, type, weight_value, weight_unit, recorded_at)
  values (:'A', 'weight', 70, 'kg', now());
insert into ice_profiles (profile_id, is_public, qr_token, blood_type)
  values (:'A', true, 'tok-A', 'O+');

-- ════════════════════════════ OWNER CRUD ═══════════════════════════════════
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'A', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*)::int from medications where profile_id = :'A'), 1, 'A reads own medication');
select is((select count(*)::int from vitals      where profile_id = :'A'), 1, 'A reads own vital');
select lives_ok(
  $$ update medications set pill_count = 29 where id = '00000000-0000-0000-0000-0000000ed001' $$,
  'A can update own medication');

-- ═══════════════════════════ FAMILY READ ═══════════════════════════════════
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'B', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from medications where profile_id = :'A'), 1,
  'dose_logger B can read owner A''s medication (family read)');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'C', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from medications where profile_id = :'A'), 1,
  'viewer C can read owner A''s medication (family read)');
select is((select count(*)::int from vitals where profile_id = :'A'), 1,
  'viewer C can read owner A''s vitals (family read)');

-- ═══════════════════════ CROSS-TENANT DENIAL ═══════════════════════════════
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from medications where profile_id = :'A'), 0, 'stranger D cannot read A''s medications');
select is((select count(*)::int from vitals      where profile_id = :'A'), 0, 'stranger D cannot read A''s vitals');
select throws_ok(
  $$ insert into vitals (profile_id, type, weight_value, weight_unit, recorded_at)
     values ('00000000-0000-0000-0000-0000000000aa', 'weight', 99, 'kg', now()) $$,
  '42501', null,
  'stranger D cannot write a vital into A''s profile (RLS WITH CHECK)');

-- ═══════════════════════ DOSE-LOGGER AUTHORISATION ═════════════════════════
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'B', 'role', 'authenticated')::text, true);
set local role authenticated;
select lives_ok(
  $$ insert into dose_logs (medication_id, profile_id, logged_by, status, logged_at)
     values ('00000000-0000-0000-0000-0000000ed001','00000000-0000-0000-0000-0000000000aa',
             '00000000-0000-0000-0000-0000000000bb','taken', now()) $$,
  'dose_logger B can log a dose for owner A');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'C', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$ insert into dose_logs (medication_id, profile_id, logged_by, status, logged_at)
     values ('00000000-0000-0000-0000-0000000ed001','00000000-0000-0000-0000-0000000000aa',
             '00000000-0000-0000-0000-0000000000cc','taken', now()) $$,
  '42501', null,
  'viewer C cannot log a dose for owner A');

reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, true);
set local role authenticated;
select throws_ok(
  $$ insert into dose_logs (medication_id, profile_id, logged_by, status, logged_at)
     values ('00000000-0000-0000-0000-0000000ed001','00000000-0000-0000-0000-0000000000aa',
             '00000000-0000-0000-0000-0000000000dd','taken', now()) $$,
  '42501', null,
  'stranger D cannot log a dose for owner A');

-- ══════════════════════════════ ICE ANON ═══════════════════════════════════
reset role;
select set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
set local role anon;
select throws_ok(
  $$ select 1 from ice_profiles limit 1 $$,
  '42501', null,
  'anon has no base-table SELECT on ice_profiles');
select is((select count(*)::int from get_public_ice_profile('tok-A')), 1,
  'anon can read one public ICE profile via the RPC');
select is((select count(*)::int from get_public_ice_profile('nope')), 0,
  'anon RPC returns nothing for an unknown token');

-- ═══════════════════════ PROFILE VISIBILITY ════════════════════════════════
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, true);
set local role authenticated;
select is((select count(*)::int from profiles where id = :'A'), 0, 'stranger D cannot read A''s profile');

reset role;
select * from finish();
rollback;
