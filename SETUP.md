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

## 1. Create the first staff account  (required — nothing works without this)

There are currently **zero** Supabase auth users, so the field tool cannot be
signed into by anyone. I did not create one: that would mean inventing a
password, and a real credential should never originate in a chat transcript or
a repository. These are the exact clicks.

**Step 1 — create the user**

1. Open the Supabase dashboard for project `xrgutmdgjzclaeyugsqg`
2. Left sidebar → **Authentication**
3. **Users** → green **Add user** button (top right) → **Create new user**
4. Email: `novashield@novashieldmaintenance.com`
5. Password: choose a strong one in your password manager — not reused
6. Tick **Auto Confirm User**
   *(without this the account stays unconfirmed and cannot sign in; the
   built-in SMTP is rate limited to a couple of messages an hour)*
7. **Create user**

**Step 2 — grant it admin access**

Signing in is not enough. Every table denies access unless the account is
listed in `admin_users`. Left sidebar → **SQL Editor** → **New query**:

```sql
insert into public.admin_users (user_id)
select id from auth.users
where email = 'novashield@novashieldmaintenance.com'
on conflict do nothing;
```

**Step 3 — confirm it worked**

```sql
select u.email, u.email_confirmed_at is not null as confirmed,
       (a.user_id is not null) as is_admin
from auth.users u
left join public.admin_users a on a.user_id = u.id;
```

You want one row, `confirmed = true`, `is_admin = true`. If `confirmed` is
false, go back and tick Auto Confirm User.

**Step 4 — tell me**

Once that row looks right, say so and I will drive the real admin UI with it:
login, dashboard, requests, convert-to-job, sections, measurements, inspection,
quote builder, send, settings — on desktop and mobile, with the database state
checked at each step.

**Adding your business partner later** is the same two steps with their email.
To revoke someone:

```sql
delete from public.admin_users
where user_id = (select id from auth.users where email = 'them@example.com');
```

They stay signed in but every screen shows "Account not authorised" and no
customer data is reachable.

## 2. Deploy the site  (waiting on Cloudflare)

Nameservers have been changed at Squarespace and Cloudflare shows the zone as
**PENDING**. Nothing below can be done until it shows **ACTIVE**.

The deployment is prepared and tested locally. Everything you need is in
**`deploy/`**, with step-by-step commands in **`deploy/README.md`**:

| File | Purpose |
|---|---|
| `Caddyfile` | static server: routing, cache policy, security headers |
| `cloudflared-config.yml` | tunnel ingress for the two hostnames |
| `novashield-web.container` | systemd/podman unit for the web server |
| `novashield-tunnel.container` | systemd/podman unit for cloudflared |

Architecture: `Cloudflare -> Tunnel -> cloudflared (podman) -> 127.0.0.1:8080
Caddy (podman) -> nova-shield/ read-only`. **No router port is opened** —
cloudflared dials outbound.

One thing to know: development served `/home/demiurge/Downloads`, which through
a tunnel would have published your partnership agreement, the DNS settings PDF,
torrents and the repo's `.git` history. Production roots at `nova-shield/` with
dotfiles refused. Verified 404 on `/.git/config`, `/.gitignore`, `/SETUP.md`
and traversal above the root.

When the zone goes ACTIVE, also add both hostnames to the Turnstile widget's
allowed list (dashboard → Turnstile → your widget). The server already restricts
to exactly those two.

**For local development**, add `localhost` and `127.0.0.1` to the widget and set
the Edge Function secret `TURNSTILE_DEV_HOSTNAMES=localhost,127.0.0.1`. Both are
needed. **It must stay unset in production** — the config check warns whenever
it is set.

## 3. Admin URL  (done)

Set to `https://novashieldmaintenance.com/admin`, derived from the actual
deployed layout rather than invented: the field tool is served at `/admin/` on
the same origin and its router uses hash paths.

Emails now link to `https://novashieldmaintenance.com/admin/#/requests`, which
is a real route — verified rendering locally through the production server
config. No redeploy is needed to change it later:

```sql
update public.app_settings
   set value = jsonb_build_object('base_url', 'https://.../admin')
 where key = 'admin';
```

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

## 6. Winter pricing is placeholder  (review before the season)

The two winter services are live, quotable, and fully wired into the pricing
engine — but their rates are market placeholders, not your numbers:

| Service | Unit | Rate | Minimum |
|---|---|---|---|
| Winter Property Care | per visit | $55.00 | $45.00 |
| Roof & Gutter De-Icing Cables | per linear foot | $14.00 | $450.00 |

`pricing_rules` is date-versioned, so changing a rate never alters a quote
already sent. Change them from the admin Settings screen, or:

```sql
-- close the old rate and open a new one, preserving history
update public.pricing_rules set effective_to = now()
 where service_id = (select id from public.services where key='winter_property_care')
   and effective_to is null;

insert into public.pricing_rules (service_id, rate, minimum, note)
select id, 65.00, 50.00, 'Reviewed before the 2026/27 season'
  from public.services where key='winter_property_care';
```

Salting is priced as a **flat** per-visit amount ($18 as needed, $30 every
visit), not a multiplier — a material cost must never be multiplied by a
quantity-derived subtotal. That is the same structural point that caused the
original concrete bug.

## 7. Optional clean-up

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

**The site must be served at a document root.** Pages reference `/css/...`,
`/js/...` and `/assets/...` with root-relative paths, because a page at
`/services/exterior-cleaning/siding-washing/` cannot use relative ones. A plain
`python3 -m http.server` in `Downloads/` therefore no longer works for the
public site — it puts everything under `/nova-shield/site/`, and every asset
404s.

Use the same Caddy config production uses (`deploy/`, see `deploy/README.md`).
It maps `site/` to `/`, `shared/` to `/shared/` and `admin/` to `/admin/`,
which is exactly what the modules expect:

```bash
podman run --rm -p 127.0.0.1:8080:8080 \
  -v /home/demiurge/Downloads/nova-shield:/srv:ro,Z \
  -v /home/demiurge/Downloads/nova-shield/deploy/Caddyfile:/etc/caddy/Caddyfile:ro,Z \
  docker.io/library/caddy:alpine
```

- Public site — `http://127.0.0.1:8080/`
- Field tool — `http://127.0.0.1:8080/admin/`
- Customer quote — `http://127.0.0.1:8080/quote.html?id=<quote-uuid>`

Themes: `?theme=refined` (default), `?theme=editorial`, `?theme=signal` — CSS
skins over identical markup and identical business logic.

## Layout

```
nova-shield/
  shared/          supabase client, DOM + formatting helpers (both apps)
  site/            public website — 3 skins, one implementation
    index.html     the homepage
    services/      generated route tree (see below)
    js/lib/        site-api.js   <- the only public data access
                   routes.js     <- the only place a public URL is decided
                   turnstile.js  <- widget (site key only)
    js/components/ chrome.js - quote-form.js
    css/           site.css + theme-refined|editorial|signal.css
  admin/           internal field tool
    js/lib/api.js  <- the only admin data access
  tools/           build-routes.py  <- regenerates services/ + sitemap
  ARCHITECTURE.md  review, known weaknesses, orphan-photo cleanup
```

### The service route tree

```
/services/lighting/                     3 category hubs      -> js/pages/category.js
/services/exterior-cleaning/
/services/winter-care/
/services/<category>/<service>/         14 service pages     -> js/pages/service.js
```

Each service page is a ~2 KB shell carrying only its title, description,
canonical and Open Graph tags; the content is rendered from `services.detail`
by the shared template. **Two lighting pages are hand-built** and are never
overwritten by the generator.

After changing a service, a name, a blurb or `services.detail`, regenerate:

```bash
python3 tools/build-routes.py
```

That rewrites the shells, `site/sitemap.xml` and `deploy/redirects.caddy`
(the 301s from the old `.html` / `?s=` URLs). Slugs live in
`site/js/lib/routes.js` — add a service there and in the database, then run it.

Two winter pages deliberately share one service. `winter_property_care` is a
single priced visit with a "what is cleared" scope, so splitting walkway and
deck clearing into two services would charge the per-visit minimum twice to
anyone who wants both. They are two pages over one service, with their copy in
`detail.variants`.

Edge Functions live in Supabase, not in this repo: `submit-request` (Turnstile
gate) and `send-notifications` (queue worker).
