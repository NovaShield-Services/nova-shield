# Deploying Nova Shield through Cloudflare Tunnel

```
novashieldmaintenance.com
   -> Cloudflare edge (TLS, caching, WAF)
   -> Cloudflare Tunnel        outbound only, no open router ports
   -> cloudflared  (podman, host network, on the Bazzite PC)
   -> 127.0.0.1:8080  Caddy  (podman, loopback only)
   -> /home/demiurge/Downloads/nova-shield   (read-only mount)
```

No inbound port is opened. `cloudflared` dials out to Cloudflare, so ports 80
and 443 stay closed on the router and the origin is not reachable from the LAN.

## What changed, and why it mattered

Development served the site with `python3 -m http.server 8123` rooted at
**`/home/demiurge/Downloads`**. Exposing that through a tunnel would have
published 40+ unrelated files — the partnership agreement, the DNS settings
PDF, torrents, game folders — plus the repository's `.git` directory, which
contains the full history.

The production root is `nova-shield/` with path-scoped handlers, dotfiles
refused, and directory listings off. Verified: `/.git/config`, `/.gitignore`,
`/SETUP.md`, `/deploy/Caddyfile` and traversal above the root all return 404.

## URL layout

| URL | Serves | Verified |
|---|---|---|
| `/` | `site/index.html` | 200, 12 DB-driven services render |
| `/css/…`, `/js/…`, `/assets/…` | `site/…` | 200 |
| `/shared/…` | `shared/…` | 200 — both apps import from here |
| `/admin/` | `admin/index.html` | 200, login gate shown, nav hidden |
| `/admin` | redirect to `/admin/` | 302 |

The shared-module path matters: a module at `/js/lib/site-api.js` importing
`../../../shared/supabase.js` clamps at the origin root and resolves to
`/shared/supabase.js`. Confirmed in the browser — `/shared/supabase.js` and
`/shared/dom.js` both load 200 from the clean root URL.

## Caching

This is the fix for the stale-module problem in ARCHITECTURE.md finding 1.

| Type | Header | Effect |
|---|---|---|
| `.html` `.js` `.css` `.json` | `Cache-Control: no-cache` | revalidates every load; verified returning **304** with `If-None-Match` |
| images, fonts | `public, max-age=31536000, immutable` | cached hard |

`no-cache` does not mean "do not cache" — it means "revalidate before use", so
a deploy can never be masked by a browser holding an old module, while repeat
visits still cost only a 304.

## Steps once Cloudflare shows the zone as ACTIVE

Run these on the **Bazzite host**, not inside the distrobox container.

**1. Confirm the zone is active.** Cloudflare dashboard must show
`novashieldmaintenance.com` as ACTIVE, not PENDING. Do not proceed while pending.

**2. Install cloudflared** — Bazzite is immutable, so run it as a container
rather than layering a package. Nothing to install; the quadlet pulls it.

**3. Authenticate and create the tunnel** (needs cloudflared once, interactively):

```bash
podman run --rm -it -v ~/.cloudflared:/etc/cloudflared:Z \
  docker.io/cloudflare/cloudflared:latest tunnel login
podman run --rm -it -v ~/.cloudflared:/etc/cloudflared:Z \
  docker.io/cloudflare/cloudflared:latest tunnel create nova-shield
```

`tunnel login` opens a browser to authorise the zone. `tunnel create` prints a
**tunnel ID** and writes `<TUNNEL_ID>.json` into `~/.cloudflared/`.

**4. Install the config:**

```bash
cp /home/demiurge/Downloads/nova-shield/deploy/cloudflared-config.yml ~/.cloudflared/config.yml
# replace <TUNNEL_ID> in three places with the id from step 3
${EDITOR:-nano} ~/.cloudflared/config.yml
```

**5. Point DNS at the tunnel.** This creates proxied CNAMEs for the two
hostnames and touches nothing else — your Google Workspace MX records and the
Resend verification records are unaffected:

```bash
podman run --rm -it -v ~/.cloudflared:/etc/cloudflared:Z \
  docker.io/cloudflare/cloudflared:latest \
  tunnel route dns nova-shield novashieldmaintenance.com
podman run --rm -it -v ~/.cloudflared:/etc/cloudflared:Z \
  docker.io/cloudflare/cloudflared:latest \
  tunnel route dns nova-shield www.novashieldmaintenance.com
```

**6. Install and start the services:**

```bash
mkdir -p ~/.config/containers/systemd
cp /home/demiurge/Downloads/nova-shield/deploy/novashield-web.container ~/.config/containers/systemd/
cp /home/demiurge/Downloads/nova-shield/deploy/novashield-tunnel.container ~/.config/containers/systemd/
loginctl enable-linger "$USER"        # survive logout / run at boot
systemctl --user daemon-reload
systemctl --user start novashield-web.service
systemctl --user start novashield-tunnel.service
systemctl --user status novashield-web novashield-tunnel
```

**7. Verify from outside:**

```bash
curl -sI https://novashieldmaintenance.com | head -20
curl -s https://novashieldmaintenance.com | grep -o '<title>[^<]*'
```

**8. Add the hostnames in Turnstile.** Cloudflare dashboard → Turnstile → your
widget → Allowed hostnames: add `novashieldmaintenance.com` and
`www.novashieldmaintenance.com`. The server side is already locked to exactly
these two, defaulted in code.

**9. Protect the field tool.** `/admin/` is reachable publicly. It is already
defended in depth — Supabase Auth, `admin_users`, RLS and table GRANTs were all
verified to reject anonymous and non-admin access — but it should not be
exposed to the open Internet unnecessarily. Add a Cloudflare Access policy:

Zero Trust → Access → Applications → Add → Self-hosted
- Domain `novashieldmaintenance.com`, path `admin`
- Policy: Allow → Emails → your two staff addresses

That puts an identity check in front of the tool without a second domain.

## Rolling back

```bash
systemctl --user stop novashield-tunnel.service novashield-web.service
```

The site goes offline; nothing else is affected. Deleting the tunnel removes
the CNAMEs Cloudflare created in step 5 and nothing else.

## Notes

- The repository currently lives under `~/Downloads`. That works, but
  `~/srv/nova-shield` or similar would be a more sensible home for something
  serving production traffic. Both container units reference the path in one
  place each if you move it.
- The origin is mounted **read-only**. The web server cannot modify the repo.
- `git pull` (or editing files) is picked up immediately — Caddy serves from
  disk and the cache headers force revalidation. No restart needed for content
  changes; restart only after editing the Caddyfile.
