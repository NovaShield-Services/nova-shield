# Nova Shield — setup and remaining manual steps

The database, public site, field tool, notification worker, customer quote page,
Turnstile gate and the notification cron schedule are built and deployed.

**Two things are blocking a fully working system, and both are secrets that only
you can add.** They are in section 2. Everything else below is already done or
optional.

The database currently contains **zero** customers, requests, jobs, quotes or
notifications. The price book, inspection checklist and settings are intact.

---

## 1. Create your staff account  (required — nothing works without this)

I deliberately did not create a permanent account or generate a password for
you. Do it in the Supabase dashboard:

1. **Authentication → Users → Add user → Create new user**
2. Email: `novashield@novashieldmaintenance.com`
3. Set your own password, tick **Auto Confirm User**

Then grant access — signing in is not enough, every table denies access unless
the account is in `admin_users`:

```sql
insert into public.admin_users (user_id)
select id from auth.users
where email = 'novashield@novashieldmaintenance.com'
on conflict do nothing;
```

Adding your partner later is the same two steps. To revoke someone:

```sql
delete from public.admin_users
where user_id = (select id from auth.users where email = 'them@example.com');
```

## 2. Add the Edge Function secrets  (REQUIRED — this is what is blocking)

**This is the step that is not done, and it is the reason email and Turnstile
are not yet proven working.**

Important distinction, because it caused the confusion already: the Resend key
you entered under **Authentication → Emails → SMTP Settings** is used *only* by
Supabase Auth, for login and password-reset emails. **Edge Functions cannot read
it.** They have a separate secret store, and it is currently empty.

Go to **Edge Functions → Secrets** (project-wide) and add:

| Secret | Value | Used by |
|---|---|---|
| `RESEND_API_KEY` | your Resend API key (starts `re_`) | send-notifications |
| `NOTIFY_FROM` | `Nova Shield <noreply@novashieldmaintenance.com>` | send-notifications |
| `NOTIFY_TO` | `info@novashieldmaintenance.com` | send-notifications |
| `ADMIN_BASE_URL` | where the field tool is hosted | send-notifications |
| `CRON_SECRET` | see below | send-notifications |
| `TURNSTILE_SECRET_KEY` | the secret key for widget `0x4AAAAAAFKrXWCUGrpnB1gd` | submit-request |
| `TURNSTILE_ALLOWED_HOSTNAMES` | `novashieldmaintenance.com,www.novashieldmaintenance.com` | submit-request |

`NOTIFY_FROM`, `NOTIFY_TO` and `ADMIN_BASE_URL` already have sensible defaults
baked in, so they are optional. The two keys are not.

**`CRON_SECRET`** — a strong value has already been generated and stored
encrypted in Supabase Vault under the name `ns_cron_secret`. It was never
printed into a chat window or a file. Read it once from
**Database → Vault → Secrets**, and paste that same value in as the
`CRON_SECRET` Edge Function secret. The scheduled job reads it from Vault at
call time, so it never appears in the cron job definition either.

Until `CRON_SECRET` is set on the function, the worker endpoint is publicly
callable. Nobody can read data through it, but anyone could trigger a queue
drain, so set it.

Verify your work without exposing anything:

```bash
curl -s "https://xrgutmdgjzclaeyugsqg.supabase.co/functions/v1/send-notifications?check=1"
```

That returns presence booleans only — never a key value. You want
`"configured": true` and `"cron_secret_configured": true`. Once `CRON_SECRET` is
set you will need to pass `-H "x-cron-secret: <value>"` to call it at all.

## 3. Finish the Turnstile widget in Cloudflare

The widget is integrated in code. Site key `0x4AAAAAAFKrXWCUGrpnB1gd` is in
`site/js/lib/turnstile.js` — that key is public by design and is useless without
the secret key, which lives only in Edge Function secrets.

Two things to do in the Cloudflare dashboard:

1. **Copy the widget's secret key** into `TURNSTILE_SECRET_KEY` (section 2).
2. **Add `localhost` and `127.0.0.1` to the widget's allowed hostnames.**
   Right now the widget refuses to render locally with Turnstile error
   `110200` (domain not allowed), which means the form cannot be submitted from
   your own machine at all.

Allowing localhost in Cloudflare is safe here *because* the server re-checks the
hostname: set `TURNSTILE_ALLOWED_HOSTNAMES` to your real domain only, and a
token minted against `localhost` will be rejected in production even though
Cloudflare issued it.

## 4. Lock the submission path  (do this after section 2 works)

The public form now posts to the `submit-request` Edge Function, which verifies
the Turnstile token and only then calls `submit_quote_request()`.

The old direct path is still open: the `anon` role can still execute that RPC,
so a bot that knows the endpoint can bypass Turnstile entirely. I left it in
place deliberately so the site keeps working while the secrets are missing.
**Once a real submission succeeds through the gate, close it:**

```sql
revoke execute on function public.submit_quote_request(
  text, text, text, text, text, text, text, text, text[], text, text, text, text
) from anon;
```

Do not run that before the gate works, or the form will be dead.

## 5. Supabase Auth SMTP  (already configured — just verify)

Custom SMTP is already on, pointing at `smtp.resend.com:465` as `noreply@novashieldmaintenance.com`.
Verify it by triggering a password reset for your staff account and confirming
the email arrives. This is separate from application email (section 2) and uses
a separate copy of the credential.

Do not change the Google Workspace MX/DNS records — Resend sending and Workspace
receiving coexist on the same domain and the current DNS is correct.

## 6. Optional clean-up

The legacy tables `job_requests`, `jobs`, `quotes` and the `job_from_request()`
trigger are unused by every site and by the admin app. Dropping them is
destructive so I left it to you:

```sql
drop table if exists public.quotes cascade;
drop table if exists public.jobs cascade;
drop table if exists public.job_requests cascade;
drop function if exists public.job_from_request() cascade;
```

---

## How notifications flow

```
submit_quote_request()  ->  inserts a row in notifications (status 'pending')
pg_cron  every 2 min    ->  dispatch_notification_worker()  (reads CRON_SECRET from Vault)
  -> net.http_post      ->  send-notifications Edge Function
     -> claim_notifications()      pending -> sending   (atomic, SKIP LOCKED)
     -> Resend API
     -> mark_notification_sent()   sending -> sent      (only after Resend returns an id)
        or mark_notification_failed()  -> pending (retry, max 5) -> failed
        or mark_notification_skipped() -> skipped (no API key)
```

A row can only become `sent` if it was in `sending`, and only one worker can
ever hold a claim, so concurrent runs cannot double-send. Delivery is
at-least-once: if a worker dies after Resend accepts but before recording,
`requeue_stale_notifications()` puts the row back after 15 minutes and it may
send again. That is the standard trade-off and it is deliberate — a duplicate
staff alert is better than a silently lost one.

## Running it

From `/home/demiurge/Downloads`:

```bash
python3 -m http.server 8123
```

- Public site — `http://localhost:8123/nova-shield/site/`
- Field tool — `http://localhost:8123/nova-shield/admin/`
- Customer quote — `.../site/quote.html?id=<quote-uuid>`

Three presentations, switchable from the footer or by URL: `?theme=refined`
(default), `?theme=editorial`, `?theme=signal`. All three are CSS skins over
identical markup and identical business logic.

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

Edge Functions live in Supabase, not in this repo: `send-notifications`
(queue worker) and `submit-request` (Turnstile gate).
