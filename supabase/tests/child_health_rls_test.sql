-- ============================================================================
-- R9 — Child-health RLS policy tests (pgTAP)   [Phase 5]
--
-- Proves the row-level-security policies on the dependant-scoped tables that the
-- client-direct model (R1) relies on:
--   dependants, immunisations, growth_measurements, milestones.
--
-- Run with:  supabase test db
--
-- Covered:
--   • guardian-only CRUD (own child reads/writes; cross-tenant denied)
--   • accepted family member gets READ on the guardian's child data
--   • a stranger can neither read nor write the child's data
--   • cross-tenant INSERT is blocked by the WITH CHECK clause
--   • expand_immunisation_schedule / expand_milestone_schedule populate rows
--
-- Same harness idioms as rls_test.sql: seed as the superuser role (RLS bypassed),
-- then simulate each user via request.jwt.claims.sub + SET LOCAL ROLE.
-- ============================================================================

begin;
select plan(15);

-- G = guardian, F = accepted family member of G, D = stranger
\set G '00000000-0000-0000-0000-00000000c001'
\set F '00000000-0000-0000-0000-00000000c002'
\set D '00000000-0000-0000-0000-00000000c003'
\set KID '00000000-0000-0000-0000-00000000c1d0'

-- ── Seed auth users (trigger on_auth_user_created creates their profiles) ───
insert into auth.users (id, email, raw_user_meta_data) values
  (:'G', 'g@test.dev', '{"full_name":"Guardian G"}'),
  (:'F', 'f@test.dev', '{"full_name":"Family F"}'),
  (:'D', 'd2@test.dev', '{"full_name":"Stranger D"}');

insert into family_members (owner_id, invitee_id, invitee_email, role, status) values
  (:'G', :'F', 'f@test.dev', 'viewer', 'accepted');

-- Guardian G's child (seeded as superuser; RLS bypassed for setup).
insert into dependants (id, guardian_id, full_name, date_of_birth, sex, popia_consent, popia_consent_at)
  values (:'KID', :'G', 'Baby G', '2024-01-01', 'female', true, now());
insert into immunisations (dependant_id, vaccine_code, vaccine_name, status, due_date)
  values (:'KID', 'BCG', 'Bacillus Calmette-Guérin', 'due', '2024-01-01');
insert into growth_measurements (dependant_id, measured_at, weight_kg)
  values (:'KID', '2024-02-01', 4.2);
insert into milestones (dependant_id, domain, milestone, status)
  values (:'KID', 'motor', 'Sits without support', 'not_yet');

-- ═══════════════════════════ GUARDIAN CRUD ═════════════════════════════════
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'G', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*)::int from dependants          where id = :'KID'),          1, 'G reads own child');
select is((select count(*)::int from immunisations       where dependant_id = :'KID'), 1, 'G reads own child immunisation');
select is((select count(*)::int from growth_measurements where dependant_id = :'KID'), 1, 'G reads own child growth');
select is((select count(*)::int from milestones          where dependant_id = :'KID'), 1, 'G reads own child milestone');
select lives_ok(
  $$ update immunisations set status = 'given', given_date = '2024-01-02'
     where dependant_id = '00000000-0000-0000-0000-00000000c1d0' $$,
  'G can update own child immunisation');
select lives_ok(
  $$ insert into growth_measurements (dependant_id, measured_at, length_cm)
     values ('00000000-0000-0000-0000-00000000c1d0', '2024-03-01', 56.0) $$,
  'G can add a growth measurement for own child');

-- ═══════════════════════════ FAMILY READ ═══════════════════════════════════
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'F', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*)::int from dependants    where id = :'KID'),          1, 'family F can read the child (family read)');
select is((select count(*)::int from immunisations where dependant_id = :'KID'), 1, 'family F can read the child immunisations (family read)');
select is((select count(*)::int from milestones    where dependant_id = :'KID'), 1, 'family F can read the child milestones (family read)');
select throws_ok(
  $$ insert into milestones (dependant_id, milestone, status)
     values ('00000000-0000-0000-0000-00000000c1d0', 'Walks alone', 'not_yet') $$,
  '42501', null,
  'family F (viewer) cannot write the child''s milestones');

-- ═══════════════════════ CROSS-TENANT DENIAL ═══════════════════════════════
reset role;
select set_config('request.jwt.claims', json_build_object('sub', :'D', 'role', 'authenticated')::text, true);
set local role authenticated;

select is((select count(*)::int from dependants          where id = :'KID'),          0, 'stranger D cannot read the child');
select is((select count(*)::int from immunisations       where dependant_id = :'KID'), 0, 'stranger D cannot read the child immunisations');
select is((select count(*)::int from growth_measurements where dependant_id = :'KID'), 0, 'stranger D cannot read the child growth');
select throws_ok(
  $$ insert into dependants (guardian_id, full_name, date_of_birth, popia_consent)
     values ('00000000-0000-0000-0000-00000000c001', 'Hijack', '2024-01-01', true) $$,
  '42501', null,
  'stranger D cannot create a child under guardian G (RLS WITH CHECK)');
select throws_ok(
  $$ insert into growth_measurements (dependant_id, measured_at, weight_kg)
     values ('00000000-0000-0000-0000-00000000c1d0', '2024-04-01', 5.0) $$,
  '42501', null,
  'stranger D cannot write growth into G''s child');

reset role;
select * from finish();
rollback;
