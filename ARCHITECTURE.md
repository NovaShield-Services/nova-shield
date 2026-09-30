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
       submit_quote_request()     public write   (validated, rate-limited)
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

### 1. No cache-busting on static assets — real, will bite on deploy
Editing `api.js` had no effect until the page was loaded with a changed query
string. In production a user could sit on a stale module for a long time.
**Fix before launch:** version the asset URLs (`?v=<build>`) or serve
`Cache-Control: no-cache` for `.js`/`.css` and long-cache only hashed files.

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

### 6. Rate limiting cannot see IP addresses
PostgREST does not pass the client IP to Postgres, so `submit_quote_request()`
limits on email / phone / address only. A determined bot can vary all three.
**Fix before launch:** put Cloudflare Turnstile (or similar) in front of the
form. The honeypot catches naive bots only.

### 7. Photo bucket accepts anonymous writes
Required, so a customer can attach photos before an account exists.
Constrained by: private bucket, 10 MB cap, image-only MIME allowlist, and
`attach_request_photo()` which only links to a request created in the last
hour. **Orphan risk is real** — see the cleanup strategy below.

### 8. Email delivery depends on a key you must supply
`send-notifications` is deployed and works, but with no `RESEND_API_KEY` it
marks rows `skipped` with the reason recorded rather than pretending to send.
Failure handling is real: transient errors stay `pending` and retry up to 5
attempts, then become `failed` with `last_error` preserved.

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

1. Add Turnstile to the public form (finding 6) — this is the one real
   pre-launch security gap.
2. Set `RESEND_API_KEY` and schedule `send-notifications` via `pg_cron`.
3. Add cache-busting (finding 1) before the first real deploy.
4. Drop the legacy tables (finding 5).
5. Pick one skin as the public default; keep the others behind `?theme=`.
