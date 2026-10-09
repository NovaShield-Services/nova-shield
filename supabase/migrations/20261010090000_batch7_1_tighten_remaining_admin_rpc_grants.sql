-- Batch 7.1: minimal grants on the last two admin-only RPCs that PUBLIC
-- could still execute.
--
-- Full read-only inventory of every function in `public`, taken against the
-- live project, asking has_function_privilege('anon', oid, 'EXECUTE') rather
-- than reading the grant list -- so inherited and PUBLIC grants are counted,
-- not just explicit ones. Eleven functions came back anon-executable. They
-- fall into four groups:
--
--   HARDEN HERE (admin-only, is_admin() guard, no customer caller):
--     calculate_job_pricing(uuid, uuid[])          PUBLIC
--     save_quote_signature(uuid, text, text)       PUBLIC
--
--   KEEP -- genuinely customer-facing, part of a supported contract:
--     get_customer_quote(uuid)        the customer quote page
--     respond_to_quote(uuid, text)    customer accept / decline
--     attach_request_photo(...)       public submission photo contract
--     get_request_status(uuid)        public request status lookup
--
--   KEEP -- required by RLS:
--     is_admin()
--       RLS policies that call is_admin() are evaluated as the CALLING role,
--       so anon and authenticated must retain EXECUTE or every policy
--       referencing it fails. Revoking this would break reads across the
--       app. It is a boolean about the caller and leaks nothing.
--
--   LEAVE -- the grant is inert:
--     guard_quote_is_draft(), set_updated_at(), job_from_request()
--       return `trigger`; rls_auto_enable() returns `event_trigger`.
--       PostgreSQL will not let any of these be invoked directly from SQL
--       whatever the grant says, and does not consult EXECUTE when firing a
--       trigger. Revoking would be cosmetic churn on functions the owner
--       would then have to re-reason about. Asserted in the Batch 7.1 tests
--       rather than assumed.
--
-- This is a missing layer, not an open door. Checked as the anon role in
-- Batch 5 for the three functions hardened then; both functions here carry
-- the same `if not public.is_admin() then raise ... insufficient_privilege`
-- as their first statement, so an anonymous call already fails. Nothing here
-- fixes a reproduced bypass, and it is not described as one.
--
-- Callers confirmed by grep before touching anything:
--   calculate_job_pricing -> admin/js/lib/api.js, measurements.js, settings.js
--                            and five calculator components. No site/ caller.
--   save_quote_signature  -> admin/js/lib/api.js only. No site/ caller; the
--                            customer page accepts via respond_to_quote.
--   Both are also called INTERNALLY by SECURITY DEFINER functions owned by
--   postgres (create_quote_from_calculation calls calculate_job_pricing),
--   which run as the owner and are unaffected by a PUBLIC revoke.
--
-- Pattern as established in 20261007133403: revoking from anon alone is a
-- no-op while the default PUBLIC grant stands, so revoke from PUBLIC first,
-- then grant back to authenticated. Every admin is authenticated.

revoke execute on function public.calculate_job_pricing(uuid, uuid[]) from public;
grant  execute on function public.calculate_job_pricing(uuid, uuid[]) to authenticated;

revoke execute on function public.save_quote_signature(uuid, text, text) from public;
grant  execute on function public.save_quote_signature(uuid, text, text) to authenticated;
