# Nova Shield — setup and remaining manual steps

The database, public site, field tool, notification worker, customer quote page,
Turnstile gate and the notification schedule are built, deployed and tested.

**The system is not production-ready yet, and the reason is deployment, not
code:** `novashieldmaintenance.com` currently serves a Squarespace "Coming Soon"
parking page. Until the Nova Shield site is actually hosted there, the real
Turnstile submission path cannot be exercised, because Cloudflare will only mint
a token on a hostname the widget allows.

The database contains **zero** customers, requests, jobs, quotes or
notifications. The price book (13 services, 122 modifiers, 24 inspection flags)
is intact.

---

## 1. Create your staff account  (required — nothing works without this)

There are currently **no user accounts at all**, so the field tool cannot be
signed into by anyone.

1. **Authentication → Users → Add user → Create new user**
2. Email: `novashield@novashieldmaintenance.com`
3. Set your own password, tick **Auto Confirm User**

Then grant access — signing in is not enough:

```sql
insert into public.admin_users (user_id)
select id from auth.users
where email = 'novashield@novashieldmaintenance.com'
on conflict do nothing;
```

To revoke someone later:

```sql
delete from public.admin_users
where user_id = (select id from auth.users where email = 'them@example.com');
```

## 2. Deploy the site to the production domain  (this is the main blocker)

The public site is static files — no build step, no Node. It needs to be served
at `https://novashieldmaintenance.com`, replacing the Squarespace parking page.

Whatever you host it on, two things must line up:

1. **Cloudflare Turnstile → your widget → Allowed hostnames** must include
   `novashieldmaintenance.com` (and `www.` if you serve that).
2. The gate already restricts the server side to exactly those two hostnames,
   defaulted in code, so a token minted anywhere else is refused even if
   Cloudflare issued it.

**For local development**, add `localhost` and `127.0.0.1` to the widget's
allowed hostnames and set the Edge Function secret
`TURNSTILE_DEV_HOSTNAMES=localhost,127.0.0.1`. Both are needed — Cloudflare has
to render the widget, and the server has to accept the hostname it reports.
**`TURNSTILE_DEV_HOSTNAMES` must be unset in production**; the config check
below warns loudly whenever it is set.

Without this, the form on your own machine shows Turnstile error `110200` and
refuses to submit. That is the current state.

## 3. Set the admin URL

Notification emails include a link into the field tool. It is currently unset,
so emails are sent **without the link**. Once the field tool has a URL:

```sql
update public.app_settings
   set value = jsonb_build_object('base_url', 'https://your-admin-host/path')
 where key = 'admin';
```

No redeploy needed — the worker reads it per run. Link construction is tested:
a base of `https://x/admin` produces `https://x/admin/#/requests`, which is a
real route.

## 4. Configuration that is already done

| Item | State |
|---|---|
| `RESEND_API_KEY` | set, verified reaching Resend, real mail delivered |
| `TURNSTILE_SECRET_KEY` | set, verified accepted by Cloudflare siteverify |
| `CRON_SECRET` | **not needed as an env var** — see below |
| Notification schedule | `pg_cron`, every 2 minutes, verified running |
| anon bypass of the gate | revoked |

**`CRON_SECRET` is handled entirely server-side.** A strong value is stored
encrypted in Supabase Vault as `ns_cron_secret`. The scheduled job reads it from
Vault at call time, and the Edge Function verifies it by calling
`verify_cron_secret()`, which compares *inside the database*. The secret is
therefore never in the cron job definition, never in an environment variable,
never in frontend code, and never returned by any endpoint. You do not need to
copy it anywhere.

Check configuration without exposing anything (run from SQL, so the secret
stays in the database):

```sql
select public.dispatch_notification_worker('?check=1');
-- then read the response:
select status_code, content::text from net._http_response order by created desc limit 1;
```

## 5. Remove two orphaned test photos

End-to-end testing uploaded two 178-byte PNGs that are now unreferenced.
Postgres blocks `delete from storage.objects`, so remove them from
**Storage → request-photos → requests/0ddb09f6-95d6-46c4-8c56-08900ec4bb18/**
in the dashboard, or just delete that whole folder.

To find orphans in future (ARCHITECTURE.md documents the full strategy):

```sql
select o.name, o.created_at
from storage.objects o
left join public.job_attachments a on a.storage_path = o.name
where o.bucket_id = 'request-photos' and a.id is null
  and o.created_at < now() - interval '24 hours';
```

## 6. Optional clean-up

Legacy tables, unused by every site and by the admin app:

```sql
drop table if exists public.quotes cascade;
drop table if exists public.jobs cascade;
drop table if exists public.job_requests cascade;
drop function if exists public.job_from_request() cascade;
```

---

## How a submission flows

```
Customer fills the form
  -> Turnstile widget mints a token (hostname-bound)
  -> POST /functions/v1/submit-request
     -> siteverify with TURNSTILE_SECRET_KEY (+ client IP as remoteip)
     -> reject unless success AND action=quote_request AND hostname allowed
     -> submit_quote_request() as service_role
        -> validation, honeypot, rate limit, service-key check
        -> customer/property deduplication
        -> notifications row (status 'pending')
  -> customer uploads photos -> attach_request_photo() (1-hour window)

pg_cron every 2 min
  -> dispatch_notification_worker()        (secret from Vault)
  -> send-notifications Edge Function      (verify_cron_secret)
     -> claim_notifications()  pending -> sending   (atomic, SKIP LOCKED)
     -> Resend API
     -> mark_notification_sent()  sending -> sent   (only after a message id)
        or mark_notification_failed() -> pending (retry, max 5) -> failed
```

There is exactly one public write path. The anon role can no longer call
`submit_quote_request()` directly.

## Running it locally

From `/home/demiurge/Downloads`:

```bash
python3 -m http.server 8123
```

- Public site — `http://localhost:8123/nova-shield/site/`
- Field tool — `http://localhost:8123/nova-shield/admin/`
- Customer quote — `.../site/quote.html?id=<quote-uuid>`

Themes: `?theme=refined` (default), `?theme=editorial`, `?theme=signal` — CSS
skins over identical markup and identical business logic.

## Layout

```
nova-shield/
  shared/          supabase client, DOM + formatting helpers (both apps)
  site/            public website — 3 skins, one implementation
    js/lib/        site-api.js   <- the only public data access
                   turnstile.js  <- widget (site key only)
    js/components/ chrome.js - quote-form.js
    css/           site.css + theme-refined|editorial|signal.css
  admin/           internal field tool
    js/lib/api.js  <- the only admin data access
  ARCHITECTURE.md  review, known weaknesses, orphan-photo cleanup
```

Edge Functions live in Supabase, not in this repo: `submit-request` (Turnstile
gate) and `send-notifications` (queue worker).
