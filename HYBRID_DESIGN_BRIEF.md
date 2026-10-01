# Nova Shield — Hybrid Design Brief

**V5's business system, composed the way Version 4 composes, on the corrected
brand navy.** Not V4 pasted into V5 — a third thing.

---

## The governing idea

> One installation. A different home every night.

That sentence is already in Version 4 and it is the strongest line either
version has. It is literally true of permanent lighting, and metaphorically true
of everything else: the house is the constant, Nova Shield changes how it reads.
The homepage should earn that sentence and the lighting page should prove it.

## The three worlds

| World | Feels like | Accent |
|---|---|---|
| **Permanent Outdoor Lighting** | architectural, nocturnal, transformational | warm white → gold |
| **Seasonal Christmas Lighting** | warm, domestic, handled-for-you | amber / warm |
| **Exterior Cleaning** | material, restorative, precise | cool slate per service |

One brand, three temperatures. Never three different websites.

---

## Homepage narrative — DISCOVER → IMAGINE → EXPLORE → UNDERSTAND → REQUEST

Deliberately **not** V5's current order.

1. **DISCOVER — Hero.** Real photograph, warm white, calm ground for type, mountain-silhouette seam at the base. Headline, one promise, two CTAs. *(V5 photo + V4 composure)*
2. **DISCOVER — The two halves.** *Nova — the light. Shield — the protection.* The asymmetric split with a chip, not two equal boxes. *(V4 composition + V5 copy)*
3. **IMAGINE — The signature service.** Permanent lighting, asymmetric, with the **WARM / COLOUR / OFF toggle**. The one interaction on the site, and it demonstrates the product. *(V4 idea, properly built)*
4. **IMAGINE — One system. Every mood.** The captioned gallery: Warm white / Colour scenes / Soffit & detail. *(V4, restored wholesale)*
5. **EXPLORE — The season.** Christmas lighting: install Oct–Nov, remove Jan–Feb, stored under your name. *(V5 copy, V4 composition)*
6. **EXPLORE — Exterior care.** The grouped **capability matrix**, not nine cards. Chips by area, linking into real service pages. *(V4 device + V5 database)*
7. **UNDERSTAND — How it works.** 01 Tell us / 02 Plan / 03 Complete. *(V4)*
8. **UNDERSTAND — Who we are.** "Built around the home, not just the job", with the shield lockup as a design element. Two founders, the same two people start to finish. *(V4 composition, V5 honesty)*
9. **REQUEST — Quote.** Designed as a destination.

## Service-page continuity

Homepage = **introduction**. Service page = **deeper chapter**. Quote = **conversion**.

Carried through without exception: header, display/interface type pairing,
navy ground, section seams, button system, accent behaviour, motion language,
footer. A service page must never look like a different site.

The service page keeps everything V5 built — argumentative headline, numbered
specification, ruled "Before you book", good-to-know, related services,
preselected quote form — and gains V4's compositional variety: an asymmetric
block, at least one real image moment, section seams, and reveal-on-scroll.

## What the hybrid takes from Version 4

1. The **mood gallery** (Warm white / Colour scenes / Soffit & detail)
2. The **WARM / COLOUR / OFF toggle**
3. **Asymmetric image+content splits** with a chip above the heading
4. **Feature bullets** as title + description with an accent dot
5. The **grouped capability matrix** of tag chips
6. The **About plate** using the shield lockup as artwork
7. **Numbered process steps**
8. The **mountain-silhouette seam** as a northern motif
9. Section-level background layering
10. Mobile discipline: calm ground, type dominant

## What the hybrid keeps from V5

1. Everything behind the glass: Supabase, RPCs, Turnstile, Resend, RLS, service-key validation
2. `services` as the only service catalogue, and `services.detail` as the only service copy
3. The service-page system and its per-service arguments
4. Per-service accents
5. Numbered specification lists and ruled entries
6. The quote form with the service preselected
7. Night-navy ground sampled from the brand banner
8. 4px architectural edges
9. Cache headers, CSP, HSTS, nosniff, X-Frame-Options
10. The honest-hero rule: no photograph that misrepresents the service

## What the hybrid rejects from both

| Rejected | From | Why |
|---|---|---|
| Nine-card cleaning grid | V5 | The dashboard look, at every viewport |
| Icon feature strip under the hero | both | Generic SaaS |
| **Nova Circle loyalty tiers** | V4 | Advertises a programme that does not exist |
| Green-black ground | V4 | The brand artwork is blue |
| Aurora gradient *instead of* photography | V4 | Gradients are atmosphere, not evidence |
| Old form logic / Supabase UMD | V4 | V5's gated path is the only write path |
| Giant dashboard radius | V5 (fixed) | Architecture has edges |
| Colour-install hero image | V5 | Everyday story is warm white; colour is the reveal |
| Theme switcher in the footer | V5 | A review aid; source of the "too white" impression |

## Motion

One signature (the lighting toggle), one ambient (slow aurora drift behind two
moments), one systemic (reveal-on-scroll: short, small travel, no layout shift).
Hover = light responding. `prefers-reduced-motion` fully respected — with motion
off the page must still read as composed.

## Imagery

Layouts are built to receive proper photography, not to substitute for it.
Gradients are the air around images. Any service without a truthful image gets
the atmospheric treatment and a spec chip rather than a misleading photograph —
the window-cleaning mistake does not repeat.

## Prototype scope

Two pages only, then review:
- **Homepage** — brand and system test
- **Concrete service page** — deep service-page test

No other page is rebuilt until these are approved.
