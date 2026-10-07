-- Batch 3 follow-up: keep the three new admin RPCs off the anon role.
--
-- Postgres grants EXECUTE to PUBLIC by default, so a freshly created function
-- is callable by Supabase's `anon` role even when it is admin-only. All three
-- Batch 3 functions re-check is_admin() and return 'Not authorised.' to a
-- non-admin, so no data was reachable -- but being callable at all is new
-- anonymous surface, and this project already revokes anon EXECUTE on its
-- admin-only RPCs (create_job_from_request, create_quote_from_calculation,
-- mark_quote_sent, recalculate_quote_totals, submit_quote_request).
--
-- !! THIS MIGRATION WAS A NO-OP. !!
--
-- Kept in history because it was applied, and history is append-only. It is
-- superseded by 20261007133403_batch3_fix_revoke_public_execute_on_new_admin_rpcs.
--
-- REVOKE ... FROM anon only removes a grant made specifically TO anon. anon's
-- access here came from the default grant to PUBLIC, which this does not
-- touch. Verifying with has_function_privilege('anon', ...) afterwards still
-- returned true, which is how the mistake was caught rather than assumed
-- away. The next migration revokes from PUBLIC and grants authenticated
-- explicitly, which is what the already-locked RPCs actually do.
--
-- NOT touched here, and recorded as a pre-existing finding rather than
-- silently widened scope: calculate_job_pricing, create_option_quote,
-- duplicate_quote, save_quote_signature and send_option_group are
-- admin-only yet still carry anon EXECUTE. Each has its own is_admin()
-- guard, so this is defence-in-depth rather than an open door.
-- get_customer_quote and respond_to_quote are deliberately anon-callable:
-- they are the public customer quote endpoints.

revoke execute on function public.admin_dashboard_summary() from anon;
revoke execute on function public.search_jobs(text, text[], text, date, date, boolean, text, integer, integer) from anon;
revoke execute on function public.job_activity(uuid) from anon;
