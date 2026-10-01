# Nova Shield — Asset Specification

Every image the public site needs. Anything marked **BLOCKING** is holding the
design back right now.

**Placeholder policy:** development uses the existing low-resolution job photos
and brand files, each overlaid with a gold `PLACEHOLDER` chip naming its spec
ID. Nothing ships with a placeholder chip still visible — the chips are the
checklist.

---

## Priority 0 — brand files (BLOCKING)

The supplied `nova-shield-lockup.jpg` and `nova-shield-brand-banner.png` are
beautiful, but both have the **aurora photograph baked into the background**.
Placed on a dark navy nav bar they render as a visible rectangular patch with
their own sky inside. Verified in all three prototypes.

### `BRAND-01` — Shield mark, transparent
- **Purpose:** nav bar, favicon, constellation centre, footer, email header
- **Subject:** the chrome shield with the gold `N` only — no wordmark, no background
- **Format:** **SVG strongly preferred**; otherwise PNG with real alpha at 512×512
- **Notes:** must read at 32px. Needs a flat single-colour variant for small sizes
- **Text overlay:** no

### `BRAND-02` — Horizontal lockup, transparent
- **Purpose:** nav bar on desktop, footer, letterhead
- **Subject:** shield + "NOVA SHIELD" + "MAINTENANCE SERVICES", transparent background
- **Format:** SVG preferred, or PNG alpha at 1600×340
- **Variants:** one for dark grounds (chrome/gold as supplied), one all-white for photo overlays
- **Text overlay:** no

### `BRAND-03` — Stacked lockup, transparent
- **Purpose:** mobile nav, square contexts, social avatar
- **Format:** SVG or PNG alpha, 800×800
- **Text overlay:** no

> Until these exist the nav uses a cropped lockup, which is the single most
> visible flaw in all three prototypes.

---

## Priority 1 — hero and story imagery

### `HERO-01` — Homepage hero (BLOCKING)
- **Purpose:** the first impression; the strongest visual moment on the site
- **Subject:** a real Nova Shield home at **blue hour**, permanent roofline lighting lit, warm white. House three-quarter view so the roofline leads the eye
- **Composition:** wide, low-ish angle, house off-centre (right third), generous sky on the left for the headline. Sky must stay legible behind type
- **Aspect ratio:** 16:9 desktop, with a **9:16 safe crop** that keeps the lit roofline intact
- **Resolution:** 2880×1620 minimum (retina), plus 1200×2000 portrait crop
- **Lighting/mood:** deep blue sky, not black. Warm light against cool sky — that contrast *is* the brand
- **Where:** homepage hero, full bleed
- **Text overlay:** **yes, heavy** — headline, paragraph, two buttons. Keep the left 45% visually calm
- **Dev placeholder:** `gallery/photo-02.jpg` (640×480, too small)

### `LIGHT-01` — Permanent lighting story
- **Subject:** roofline with peaks/gables lit warm white at night; whole-house read
- **Composition:** architectural, straight-on or slight angle, roofline crossing the upper third
- **Aspect:** 3:2 · 2400×1600
- **Mood:** calm, residential, warm-on-cool
- **Where:** homepage lighting band; permanent lighting page hero
- **Text overlay:** yes, left or right half

### `LIGHT-02` — Soffit channel detail
- **Subject:** macro of the aluminium channel fitted under the soffit, colour-matched, **daylight**
- **Why:** proves the "invisible by day" claim that the copy makes
- **Aspect:** 4:5 · 1600×2000
- **Text overlay:** no — caption beneath

### `LIGHT-03` — Colour scene
- **Subject:** same house as LIGHT-01 if possible, in a colour scene (single tasteful colour, not rainbow)
- **Why:** pairs with LIGHT-01 as a before/after of *mood*, not of cleaning
- **Aspect:** 3:2 · 2400×1600
- **Text overlay:** no

### `XMAS-01` — Christmas lighting story
- **Subject:** home with seasonal display, snow on the ground, warm windows
- **Mood:** warm, domestic, inviting. **Not** luxury-exclusive — a normal Sault Ste. Marie house
- **Aspect:** 3:2 · 2400×1600
- **Where:** homepage seasonal band; Christmas page hero
- **Text overlay:** yes

### `XMAS-02` — Install in progress
- **Subject:** crew installing in autumn daylight, ladder, clips, roofline
- **Why:** supports "we climb the ladder, not you"
- **Aspect:** 3:2 · 2000×1333
- **Text overlay:** no

### `XMAS-03` — Storage
- **Subject:** labelled bins on a rack, a customer name visible on a tag
- **Why:** makes the storage half of the rental model concrete and believable
- **Aspect:** 4:3 · 1600×1200
- **Text overlay:** no

---

## Priority 2 — service pages

Each cleaning service needs **a hero** and **a before/after pair**. Before/after
is the most persuasive asset in exterior cleaning and must be shot deliberately:
**identical camera position, identical framing, similar light.**

| ID | Service | Subject | Aspect | Resolution | Overlay |
|---|---|---|---|---|---|
| `SID-01` | Siding | Full elevation, clean vinyl, raking light showing texture | 3:2 | 2400×1600 | yes |
| `SID-02/03` | Siding | Before/after pair — green algae on a north wall → clean | 1:1 | 1600×1600 | no |
| `ROOF-01` | Roof | Roof plane from ground level, shingles reading clearly | 3:2 | 2400×1600 | yes |
| `ROOF-02/03` | Roof | Before/after — black streaking → clean | 1:1 | 1600×1600 | no |
| `GUT-01` | Gutter brightening | Tight on gutter face + fascia, strong horizontal line | 21:9 | 2400×1030 | yes |
| `GUT-02/03` | Gutter brightening | Before/after — tiger striping → uniform | 1:1 | 1600×1600 | no |
| `WIN-01` | Windows | Glass with sky/trees reflected, no streaks | 3:2 | 2400×1600 | yes |
| `WIN-02` | Windows | Screen and track detail | 4:5 | 1400×1750 | no |
| `CON-01` | Concrete | Driveway with a visible clean/dirty boundary mid-wash | 3:2 | 2400×1600 | yes |
| `CON-02/03` | Concrete | Before/after | 1:1 | 1600×1600 | no |
| `DECK-01` | Deck/wood | Wood grain after cleaning, warm low light | 3:2 | 2400×1600 | yes |
| `FEN-01` | Fence | Fence line receding, clean vs weathered | 3:2 | 2400×1600 | yes |
| `MOSS-01` | Moss removal | Moss on a shaded roof/walkway | 3:2 | 2400×1600 | yes |
| `GRAF-01` | Graffiti removal | Wall mid-removal, partial clean | 3:2 | 2400×1600 | yes |

**Mobile note:** every service hero needs a 4:5 crop that still shows the
material. Wide architectural shots collapse badly on a 390px screen.

---

## Priority 3 — supporting

### `TEAM-01` — The two founders
- **Subject:** both founders, on site, working clothes, daylight, real equipment. Not a studio portrait
- **Why:** "one crew who does the work themselves" is the strongest differentiator and currently has no image
- **Aspect:** 3:2 · 2400×1600
- **Where:** About, homepage trust moment
- **Text overlay:** optional

### `TRUCK-01` — Vehicle and kit
- **Subject:** branded work truck, equipment visible, tidy
- **Aspect:** 16:9 · 2400×1350

### `AREA-01` — Sault Ste. Marie context
- **Subject:** recognisable local residential street or landscape, dusk
- **Why:** anchors the business locally without a map
- **Aspect:** 21:9 · 2800×1200
- **Text overlay:** yes

### `OG-01` — Social share card
- **Subject:** HERO-01 crop with the lockup
- **Aspect:** 1.91:1 · 1200×630 — **exact**

---

## Shooting notes

1. **Shoot lighting work at blue hour, not full dark.** A black sky kills the architecture; a deep blue sky makes warm light sing. Roughly 20–40 minutes after sunset.
2. **Before/after must be locked off.** Mark the tripod position. A different angle makes the pair worthless.
3. **Leave calm space for type.** Many of these carry a headline. Sky, lawn or a plain wall on one side.
4. **Shoot wide, crop later** — but check the 4:5 and 9:16 crops on site, not afterwards.
5. **Horizontals level.** Rooflines are the subject; a tilted roofline reads as sloppy work.
6. **Deliver originals.** Full-resolution unsharpened files; the build generates responsive sizes.

## Delivery

Drop files into `site/assets/` using the spec ID as the filename — `HERO-01.jpg`,
`SID-02.jpg`. The build picks them up and removes the placeholder chip
automatically; no layout changes needed per image, because every slot already
has its aspect ratio and crop behaviour defined here.

## Legal

A photo release is needed before publishing any image of a customer's property.
This is still an open gap and should be resolved before the first real
photograph goes on the site.
