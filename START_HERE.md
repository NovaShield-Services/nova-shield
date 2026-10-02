# Nova Shield — start here

Everything is built and committed. This is the one page that tells you what to
do next, in order. The other documents are reference.

---

## What exists right now

| Layer | State |
|---|---|
| Public website | 8 pages + 11 database-driven service pages. Design frozen for your review |
| Database | Supabase. 15 services, 151 pricing modifiers, 28 inspection flags. **Zero customer rows** |
| Quote requests | Live, behind Cloudflare Turnstile |
| Email | Resend, verified domain, real delivery proven |
| Notifications | pg_cron every 2 minutes → Edge Function → Resend |
| Field tool (admin) | Built and tested, **but no account exists yet** |
| Deployment | Prepared for Cloudflare Tunnel, not yet live |

---

## Do these in order

### 1. Create your staff account  — 5 minutes, blocks everything else

There are **zero** user accounts, so the field tool cannot be signed into.

1. Supabase dashboard → **Authentication → Users → Add user → Create new user**
2. Email `novashield@novashieldmaintenance.com`, your own strong password
3. **Tick Auto Confirm User** (without it the account cannot sign in)
4. Then SQL Editor:

```sql
insert into public.admin_users (user_id)
select id from auth.users
where email = 'novashield@novashieldmaintenance.com'
on conflict do nothing;
```

Verify:

```sql
select u.email, u.email_confirmed_at is not null as confirmed,
       (a.user_id is not null) as is_admin
from auth.users u
left join public.admin_users a on a.user_id = u.id;
```

You want `confirmed = true`, `is_admin = true`.

### 2. Set your winter rates  — before the snow

Live and quotable, but the rates are **my market estimates, not your numbers**:

| Service | Unit | Rate | Minimum |
|---|---|---|---|
| Winter Property Care | per visit | $55.00 | $45.00 |
| Roof & Gutter De-Icing Cables | per linear ft | $14.00 | $450.00 |

With ~20 customers over 15–20 snowfalls, the per-visit rate decides whether
winter is worth running. Change it in the admin Settings screen, or:

```sql
update public.pricing_rules set effective_to = now()
 where service_id = (select id from public.services where key='winter_property_care')
   and effective_to is null;

insert into public.pricing_rules (service_id, rate, minimum, note)
select id, 65.00, 50.00, 'Reviewed before the 2026/27 season'
  from public.services where key='winter_property_care';
```

Rates are date-versioned, so changing one never alters a quote already sent.

### 3. Deploy the site  — waiting on Cloudflare

Nameservers are changed; the zone must show **ACTIVE**, not PENDING.

Everything needed is in **`deploy/`**, with exact commands in
**`deploy/README.md`**. Architecture:

```
novashieldmaintenance.com
  → Cloudflare edge
  → Cloudflare Tunnel (outbound only — no router port opened)
  → cloudflared (podman, on your PC)
  → 127.0.0.1:8080 Caddy (podman, loopback only)
  → nova-shield/ mounted read-only
```

When the zone is active, also add both hostnames to the **Turnstile widget**
(dashboard → Turnstile → your widget → allowed hostnames).

> **Important:** development served `~/Downloads`, which through a tunnel would
> have published your partnership agreement, the DNS PDF, torrents and the
> repo's `.git` history. Production roots at `nova-shield/` with dotfiles
> refused. Do not change the document root.

### 4. Lock the submission path  — after the first real submission works

`anon` can no longer call `submit_quote_request()` directly, so Turnstile is the
only public write path. Already done — just don't re-grant it.

### 5. Send me photography

See **`ASSET_SPEC.md`**. The blocking ones:

- **`HERO-01`** — homepage hero. Current placeholder is 640px and would upscale 2.25×, so it is deliberately treated as atmosphere
- **`XMAS-04`** — Christmas hero
- **`LIGHT-04`** — the same house in daylight, lights off, tripod locked. This unlocks the third state of the lighting toggle
- **Cleaning photography for all nine services** — before/after pairs are the highest value and neither old version had any
- **`BRAND-01/02/03`** — vector/transparent logo

Two provenance questions first: `photo-04` contains a **third-party yard sign**,
and several gallery photos may be supplier marketing rather than your jobs —
which changes whether they can be captioned as your work.

---

## Running it locally

```bash
cd /home/demiurge/Downloads
python3 -m http.server 8123
```

Or the production config, which is what I tested against:

```bash
distrobox-host-exec podman run -d --rm --name ns-web -p 127.0.0.1:8090:8080 -v /home/demiurge/Downloads/nova-shield:/srv:ro,Z -v /home/demiurge/Downloads/nova-shield/deploy/Caddyfile:/etc/caddy/Caddyfile:ro,Z docker.io/library/caddy:2-alpine
```

Then `http://127.0.0.1:8090/`. Use this one — it sends cache-revalidation
headers, so you never see stale CSS.

---

## The documents

| File | What it is |
|---|---|
| **START_HERE.md** | this page |
| **SETUP.md** | full setup detail, secrets, cron, cleanup |
| **ASSET_SPEC.md** | every image needed, with crops and shooting notes |
| **DESIGN_SYSTEM.md** | colours sampled from your logo, type, spacing, motion |
| **ARCHITECTURE.md** | system review, known weaknesses, orphan-photo cleanup |
| **DESIGN_BRIEF.md** | the direction and why |
| **DESIGN_COMPARISON.md** | V4 vs V5, rendered not guessed |
| **HYBRID_DESIGN_BRIEF.md** | what the hybrid takes from each |
| **ASSET_COMPARISON.md** | what each photo actually shows |
| **deploy/README.md** | tunnel runbook |

---

## Known open items

- Winter rates are placeholders (step 2)
- No staff account (step 1)
- Site not deployed (step 3)
- Cleaning services have **no cleaning photography at all**
- `photo-04` unusable; some photo provenance unconfirmed
- Service heroes are type-only until photography arrives
- Bold Editorial and Night Signal not migrated — deliberately, pending your review of V5
