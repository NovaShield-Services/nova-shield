# Nova Shield — architecture review

Written after V5 Refined was completed and the other two presentations were
migrated. This is the honest state of the system, including what is still weak.

## The shape of it

```
Postgres (Supabase)         ← the only source of truth
  ├─ services + pricing_rules + pricing_modifiers + site_factors
  ├─ inspection_flags + service_inspection_flags
  ├─ app_settings                (company, tax, quote defaults, lighting)
  ├─ customers → properties → quote_requests → ns_jobs → ns_quotes
  └─ RPCs = the API boundary
       submit_quote_request()     service_role   (behind the Turnstile gate)
       attach_request_photo()     public write   (id-gated, 1-hour window)
       get_customer_quote()       public read    (curated payload)
       respond_to_quote()         public write   (accept / decline)
       create_job_from_request()  admin
       calculate_job_pricing()    admin
       create_quote_from_calculation() / recalculate_quote_totals() / mark_quote_sent()

shared/            supabase.js · dom.js · format.js        (both apps)
site/js/lib/       site-api.js       ← the ONLY public data access
site/js/components chrome.js · quote-form.js               (all three skins)
site/css/          site.css + theme-refined/editorial/signal.css
admin/js/lib/      api.js            ← the ONLY admin data access

Edge Functions (in Supabase, not in this repo)
  submit-request       Turnstile gate in front of submit_quote_request()
  send-notifications   queue worker, driven by pg_cron every 2 minutes
```

**One backend, one business-logic layer, three CSS skins.** The three
presentations are the same HTML, the same components and the same API calls;
only `theme-*.css` differs. Verified by submitting from the Signal skin and
confirming it produced an identical record and notification.

## Where business logic lives, and where it must not

| Concern | Single home | Enforced how |
|---|---|---|
| Service list | `services` table | site + admin both read it; nothing hardcoded |
| Pricing | `pricing_rules` (date-versioned) | `calculate_job_pricing()` only |
| Modifier maths | `pricing_modifiers.kind` | multiplier/flat/per_unit is structural |
| Quote totals | `recalculate_quote_totals()` | never computed in the browser |
| Validation | `submit_quote_request()` | the client cannot bypass it |
| Warranty / seasons | `app_settings.lighting` | pages read, never embed |
| Permissions | RLS + `is_admin()` + GRANTs | checked inside SECURITY DEFINER too |

Changing a rate, a service, a settings value or the submission rules is **one
edit in one place**, and all three skins pick it up on next load.

## Findings

### 1. No cache-busting on static assets — FIXED in the production server
Editing `api.js` had no effect until the page was loaded with a changed query
string. In production a user could sit on a stale module for a long time.

**Fixed in `deploy/Caddyfile`:** `.html`/`.js`/`.css`/`.json` are served
`Cache-Control: no-cache`, so they revalidate against an ETag before use — a
deploy can never be masked by a cached module. Verified returning **304** with
`If-None-Match`. Images and fonts get `max-age=31536000, immutable`.

This is a server-side fix, so no `?v=` query strings are needed in source and
nested module imports are covered too (which query-string versioning on entry
points would have missed).

### 2. `JOB_STATUSES` is duplicated
`admin/js/views/job.js` hardcodes the status list that also lives in the
`ns_jobs.status` CHECK constraint. Add a status to the database and the
dropdown silently lacks it. **Fix:** expose the allowed values from the
database (a small `job_statuses` table or a lookup RPC).

### 3. UI vocabularies are hardcoded in `quote-form.js`
`PROPERTY_TYPES`, `TIMING`, `CONTACT_METHODS` and `CATEGORY_LABELS` are arrays
in the component. They are presentation-level, not pricing, so this is low
risk — but property type in particular is customer data we may want to
standardise later. **Fix when it matters:** move to `app_settings`.

### 4. `site-api.js` caches in module scope
`listPublicServices()` and `getPublicSettings()` memoise for the page's
lifetime. A service added in admin will not appear in an already-open tab.
Acceptable for a marketing site; be aware when testing.

### 5. Legacy tables are now genuinely unused
`job_requests`, `jobs`, `quotes` and the `job_from_request()` trigger are no
longer referenced by any site or by the admin app. They are still present and
still hold the old anon INSERT grant. **Recommended:** drop them once you are
satisfied, in that order (`quotes` → `jobs` → `job_requests`). I have not
dropped them — that is destructive and should be your call.

### 6. Rate limiting cannot see IP addresses — now mitigated by Turnstile
PostgREST does not pass the client IP to Postgres, so `submit_quote_request()`
limits on email / phone / address only. A determined bot can vary all three.

**Fixed structurally:** the browser no longer calls that RPC. It posts to the
`submit-request` Edge Function, which verifies a Cloudflare Turnstile token
server-side (and *can* see the client IP, which it forwards to siteverify as
`remoteip`) before forwarding to the same validated RPC as `service_role`.

`TURNSTILE_SECRET_KEY` is set and verified against Cloudflare (siteverify
returns `invalid-input-response` for a bad token, not `invalid-input-secret`).
The `anon` grant on `submit_quote_request()` has been **revoked**, so there is
now exactly one public write path. Verified: a direct anonymous RPC call returns
`42501 permission denied`, while the public service menu still reads.

Hostname policy is defaulted **in code** to the two production hostnames, so a
missing env var fails strict rather than open. `TURNSTILE_DEV_HOSTNAMES` is a
separate, default-empty list for local work and is never merged silently — the
function logs a warning on every request it admits.

### 7. Photo bucket accepts anonymous writes
Required, so a customer can attach photos before an account exists.
Constrained by: private bucket, 10 MB cap, image-only MIME allowlist, and
`attach_request_photo()` which only links to a request created in the last
hour. **Orphan risk is real** — see the cleanup strategy below.

### 8. Email delivery depends on a key you must supply
`send-notifications` is deployed and the whole loop around it is proven working
(pg_cron -> pg_net -> function -> claim -> settle, verified with real rows and
HTTP 200 responses). With no `RESEND_API_KEY` it marks rows `skipped` with the
reason recorded rather than pretending to send.

The Resend key configured under **Authentication -> Emails -> SMTP Settings** is
*not* visible to Edge Functions — that store is only for Supabase Auth's own
emails. The key has to be added separately under Edge Functions -> Secrets.

Failure handling is real: transient errors stay `pending` and retry up to 5
attempts, then become `failed` with `last_error` preserved.

### 10. Notification delivery is claim-based, and at-least-once
Rows move `pending -> sending -> sent|failed|skipped`. The claim is atomic
(`FOR UPDATE SKIP LOCKED`), and `mark_notification_sent()` only fires on a row
still in `sending`, so two concurrent workers cannot both email the same row —
verified by firing three workers simultaneously at one row: one claimed it, two
claimed nothing.

A row is marked `sent` only after Resend returns a message id, which is stored
in `provider_message_id`. If a worker dies mid-send the row sits in `sending`
until `requeue_stale_notifications()` returns it after 15 minutes, counting the
attempt. That window is genuinely at-least-once: a message that reached Resend
but was never recorded can send twice. Accepted deliberately — these are
internal staff alerts, and a duplicate beats a silent loss.

Two unique indexes also stop duplicate *rows* being queued for the same event
(one per request+kind, one per quote response).

### 9. The customer quote page is deliberately unthemed
`quote.html` keeps one light, printable document design regardless of the
marketing skin. A quote should not change appearance based on which landing
page the customer happened to arrive through.

## Orphan photo cleanup strategy

An upload can succeed while the linking RPC fails (or the customer abandons the
form), leaving an object in `request-photos` with no `job_attachments` row.

**Detection** — list bucket objects and anti-join against attachments:

```sql
select o.name, o.created_at
from storage.objects o
left join public.job_attachments a on a.storage_path = o.name
where o.bucket_id = 'request-photos'
  and a.id is null
  and o.created_at < now() - interval '24 hours';
```

**Removal** — Postgres blocks `delete from storage.objects`, so removal must go
through the Storage API: either the dashboard, or a scheduled call to an Edge
Function using the service-role key with `storage.from('request-photos').remove([...])`.

**Recommended cadence:** weekly, deleting unlinked objects older than 24 hours.
The 24-hour grace period matters because `attach_request_photo()` allows
linking for one hour after submission.

## What I would do next, in order

1. Deploy the site to `novashieldmaintenance.com` (finding 13) and add that
   hostname to the Turnstile widget. Nothing else unblocks the real gate test.
2. Create a staff account — there are currently zero user accounts, so the
   field tool cannot be signed into at all.
3. Set `app_settings.admin.base_url` so staff emails carry a working link.
4. Add cache-busting (finding 1) before the first real deploy.
5. Drop the legacy tables (finding 5).
6. Pick one skin as the public default; keep the others behind `?theme=`.


### 11. Service keys are validated, not silently dropped
The original insert used `where s.key = any(p_service_keys) and s.active`, which
quietly discarded any key that was unknown, inactive, or an internal jump-wire
component. A customer could tick three services, have one dropped, and be
quoted for the wrong job.

Now every key is checked **before anything is written**, and the whole
submission is rejected with a customer-safe "refresh and try again" message.
Verified with zero partial rows for: unknown key, valid+unknown mixed, a
deliberately deactivated real service, and an internal jump-wire key.

### 12. Deleting a customer leaves orphaned properties
`properties.customer_id` is `ON DELETE SET NULL`, so removing a customer leaves
property rows behind with a null owner and no requests. Harmless today (only
seen while cleaning up test data) but it will accumulate. Worth a periodic
sweep, or changing the constraint, if customer deletion ever becomes routine.

### 13. The production domain is not serving this site
`novashieldmaintenance.com` resolves to Squarespace (198.185.159.x /
198.49.23.x) and returns a "Coming Soon" parking page. Until the site is hosted
there, the real Turnstile path cannot be exercised end to end, because
Cloudflare binds tokens to allowed hostnames. This is the single remaining
blocker to calling the system production-ready.


### 14. The development document root was dangerously wide
`python3 -m http.server 8123` served **`/home/demiurge/Downloads`** — 41
entries including the partnership agreement, the domain's DNS settings PDF,
torrents, game directories, and the repository's own `.git`. That was harmless
on loopback and would have been a serious exposure through a tunnel.

Production roots at `nova-shield/` with path-scoped handlers, dotfiles refused
and listings off. Verified 404: `/.git/config`, `/.gitignore`, `/SETUP.md`,
`/deploy/Caddyfile`, and traversal above the root.

### 15. get_customer_quote returns HTTP 500 for an unknown id
The RPC raises `P0002` with the customer-safe message "Quote not found.", which
PostgREST maps to 500. The customer experience is correct — `quote.js` catches
it and renders "Quote not available" — but a mistyped link logging as a server
error is noise. Returning NULL instead of raising would make it a clean 200.
Cosmetic; left alone to avoid changing a working contract.

### 16. The field tool is reachable at a public path
`/admin/` is served from the same origin. Defence in depth is real and verified
(Supabase Auth, `admin_users`, RLS, table GRANTs — anonymous and non-admin both
rejected at the data layer), but the login page itself is Internet-facing.
**Recommended:** a Cloudflare Access policy on the `admin` path, which adds an
identity check without needing a second domain. Steps in `deploy/README.md`.
