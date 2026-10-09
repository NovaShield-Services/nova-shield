-- Minimal fixture schema for the Batch 7.1 database tests.
--
-- THIS IS NOT THE PRODUCTION SCHEMA. The repository has no base schema at
-- all -- supabase/migrations/ begins at the Phase C repair and contains only
-- incremental changes, so production cannot be rebuilt from this repo (see
-- docs/batch7-1-findings.md, finding 4b). This file recreates only the parts
-- the Batch 7.1 migrations actually touch, with column types and function
-- signatures taken from read-only introspection of the live project.
--
-- What that buys, and what it does not:
--   * it DOES prove the migrations' SQL is valid, that their function
--     signatures match the live ones exactly (a REVOKE against a wrong
--     signature errors rather than silently no-opping), and that the
--     trigger logic enforces what it claims against real Postgres.
--   * it does NOT prove the live database is protected. Nothing here is
--     applied to production, and these results must not be reported as
--     production verification.

create schema if not exists public;

-- Supabase's two browser-facing roles. NOLOGIN is enough: the tests use
-- SET ROLE, not a connection.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------------- quotes --
-- Only the columns the content-freeze trigger reads.
drop table if exists public.ns_quotes cascade;
create table public.ns_quotes (
  id             uuid primary key default gen_random_uuid(),
  status         text not null default 'draft',
  customer_notes text,
  terms          text,
  internal_notes text,
  total          numeric not null default 0
);

-- ------------------------------------------------- admin-only RPC stubs --
-- Bodies are irrelevant: these exist so the grant migration has real
-- functions with the EXACT live signatures to revoke from. If a signature in
-- the migration is wrong, the REVOKE raises and the test fails.
--
-- DROP before CREATE, not CREATE OR REPLACE: replacing a function PRESERVES
-- its existing grants, so on a second run the stubs would still carry the
-- revoke the previous run applied and the "before" assertions would fail
-- against a state the fixture is supposed to have reset. (That preservation
-- is the same property the Batch 5 grant work relied on -- worth knowing in
-- both directions.)
drop function if exists public.calculate_job_pricing(uuid, uuid[]);
create function public.calculate_job_pricing(p_job_id uuid, p_measurement_ids uuid[])
returns void language sql as $$ select $$;

drop function if exists public.save_quote_signature(uuid, text, text);
create function public.save_quote_signature(p_quote_id uuid, p_signature_path text, p_signed_by_name text)
returns void language sql as $$ select $$;

-- Both now start from Postgres's default: EXECUTE to PUBLIC.

-- --------------------------------------------- inert-grant demonstration --
-- Used to assert the migration's claim that a PUBLIC grant on a trigger or
-- event-trigger function cannot be exercised, so revoking it would be
-- cosmetic. Asserted, not assumed.
create or replace function public.fixture_trigger_fn()
returns trigger language plpgsql as $$ begin return new; end $$;

create or replace function public.fixture_event_trigger_fn()
returns event_trigger language plpgsql as $$ begin end $$;

grant execute on function public.fixture_trigger_fn() to public;
grant execute on function public.fixture_event_trigger_fn() to public;

-- ------------------------------------------------------- legacy tables --
drop table if exists public.job_requests cascade;
drop table if exists public.jobs cascade;
drop table if exists public.quotes cascade;
create table public.job_requests (id uuid primary key default gen_random_uuid(), note text);
create table public.jobs         (id uuid primary key default gen_random_uuid(), note text);
create table public.quotes       (id uuid primary key default gen_random_uuid(), note text);

-- Reproduce the inherited state ARCHITECTURE finding 5 records, so the
-- revoke has something real to remove.
grant select, insert, update, delete on public.job_requests to anon;
grant select, insert, update, delete on public.jobs         to anon;
grant select, insert, update, delete on public.quotes       to anon;
