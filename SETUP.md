# Nova Shield — setup and remaining manual steps

The database, public site, field tool, notification function and customer quote
page are built and tested. The database currently contains **zero** customers,
requests, jobs or quotes — all test data was removed. The price book,
inspection checklist and settings are seeded and intact.

Everything below is something I could not do for you, with the reason.

---

## 1. Create your staff account  (required — nothing works without this)

I deliberately did not create a permanent account or generate a password for
you. Do it in the Supabase dashboard:

1. **Authentication → Users → Add user → Create new user**
2. Email: `novashield@novashieldmaintenance.com` (or whichever you prefer)
3. Set your own password, and tick **Auto Confirm User**

Then grant it access — signing in is not enough, every table denies access
unless the account is in `admin_users`:

```sql
insert into public.admin_users (user_id)
select id from auth.users
where email = 'novashield@novashieldmaintenance.com'
on conflict do nothing;
```

Adding your business partner later is the same two steps. To revoke someone:

```sql
delete from public.admin_users
where user_id = (select id from auth.users where email = 'them@example.com');
```

They stay signed in but every screen shows "Account not authorised" and no
customer data is reachable.

> Note: email confirmation is currently **on**, and the project uses Supabase's
> built-in SMTP which is rate-limited to a couple of messages an hour. That is
> fine for staff accounts created from the dashboard. If you ever want
> self-service signup you will need custom SMTP.

## 2. Turn on email delivery  (required before launch)

The `send-notifications` Edge Function is deployed and working. With no
provider key it marks notifications `skipped` and records the reason rather
than pretending to send — which is what you saw in testing.

To make it actually send:

1. Create a [Resend](https://resend.com) account and verify your sending domain
2. **Edge Functions → send-notifications → Secrets**, add:

   | Secret | Value |
   |---|---|
   | `RESEND_API_KEY` | your Resend API key |
   | `NOTIFY_FROM` | `Nova Shield <quotes@novashieldmaintenance.com>` |
   | `NOTIFY_TO` | where internal alerts should land |
   | `ADMIN_BASE_URL` | where the field tool is hosted (for the deep link) |
   | `CRON_SECRET` | any long random string (the function is public) |

3. Schedule it. Once `pg_cron` is enabled:

```sql
select cron.schedule('nova-shield-notifications', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://xrgutmdgjzclaeyugsqg.supabase.co/functions/v1/send-notifications',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'x-cron-secret', 'YOUR_CRON_SECRET'),
    body := '{}'::jsonb);
$$);
```

Failure handling already works: transient errors stay `pending` and retry up to
5 times, then become `failed` with `last_error` kept.

## 3. Add bot protection  (recommended before launch)

PostgREST does not expose the client IP to Postgres, so the rate limit works on
email / phone / address only. A determined bot can vary all three. Put
Cloudflare Turnstile (or hCaptcha) in front of the public form. The honeypot
catches naive bots only.

## 4. Version control  (I could not do this)

**git is not installed on this machine.** I checked, and I did not install
system software without asking. Once git exists:

```bash
cd /home/demiurge/Downloads/nova-shield
bash git-init.sh
```

That creates the repository, a `.gitignore` that excludes secrets, and four
logical commits rather than one giant blob.

## 5. Optional clean-up

The legacy tables `job_requests`, `jobs`, `quotes` and the `job_from_request()`
trigger are now **unused by every site and by the admin app**. Dropping them is
destructive so I left it to you:

```sql
drop table if exists public.quotes cascade;
drop table if exists public.jobs cascade;
drop table if exists public.job_requests cascade;
drop function if exists public.job_from_request() cascade;
```

---

## Running it

From `/home/demiurge/Downloads`:

```bash
python3 -m http.server 8123
```

- Public site — `http://localhost:8123/nova-shield/site/`
- Field tool — `http://localhost:8123/nova-shield/admin/`
- Customer quote — `.../site/quote.html?id=<quote-uuid>`

The site has three presentations, switchable from the footer or by URL:

- `?theme=refined` (default)
- `?theme=editorial`
- `?theme=signal`

All three are **CSS skins over identical markup and identical business logic**.
Pick one as the public default when you are ready; the switcher in
`chrome.js` (`themeSwitcher()`) is a review aid and can be deleted.

## Layout

```
nova-shield/
  shared/          supabase client, DOM + formatting helpers (both apps)
  site/            public website — 3 skins, one implementation
    js/lib/        site-api.js   ← the only public data access
    js/components/ chrome.js · quote-form.js   (shared by all skins)
    css/           site.css + theme-refined|editorial|signal.css
  admin/           internal field tool
    js/lib/api.js  ← the only admin data access
  ARCHITECTURE.md  review, known weaknesses, orphan-photo cleanup
  git-init.sh      run once git is installed
```

See `ARCHITECTURE.md` for the full review, including the asset-caching issue to
fix before your first real deploy.
