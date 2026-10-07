-- Batch 3 follow-up (corrected). The previous migration revoked EXECUTE
-- "from anon", which was a no-op: anon's access came from Postgres's default
-- grant to PUBLIC, not from a grant made to anon directly, and
-- REVOKE ... FROM anon does not remove a PUBLIC grant. Verified afterwards
-- via has_function_privilege(), which still reported true -- hence this fix
-- rather than a silent assumption that the first revoke worked.
--
-- This matches the pattern the already-locked admin RPCs use. Compare
-- proacl: create_job_from_request reads {postgres=X/postgres,
-- authenticated=X/postgres} with no bare "=X/postgres" entry, whereas the
-- new functions still carried "=X/postgres" (that leading "=" IS the PUBLIC
-- grant). Revoking from PUBLIC and granting authenticated explicitly
-- reproduces the former exactly.
--
-- Confirmed after applying:
--   admin_dashboard_summary  anon=false authenticated=true
--   search_jobs              anon=false authenticated=true
--   job_activity             anon=false authenticated=true
-- all with proacl {postgres=X/postgres, authenticated=X/postgres}, i.e.
-- byte-identical to create_job_from_request.
--
-- is_admin() inside each function remains the real authorisation; this only
-- stops a non-admin role being able to invoke them at all.

revoke execute on function public.admin_dashboard_summary() from public;
grant  execute on function public.admin_dashboard_summary() to authenticated;

revoke execute on function public.search_jobs(text, text[], text, date, date, boolean, text, integer, integer) from public;
grant  execute on function public.search_jobs(text, text[], text, date, date, boolean, text, integer, integer) to authenticated;

revoke execute on function public.job_activity(uuid) from public;
grant  execute on function public.job_activity(uuid) to authenticated;
