# Nova Shield — Design System

Everything here is derived from the canonical brand artwork. **No colour in this
document was chosen from memory** — each was sampled from the master file with a
canvas reader and is recorded with where it came from.

---

## 1. The canonical artwork

**Aurora Nova Shield Maintenance Banner**

| | |
|---|---|
| **Master** | `site/assets/brand/logo-hi.jpeg` |
| **Original source** | `Downloads/websie pics/logo .jpeg` |
| **Dimensions** | **2172 × 724** (3:1) |
| **Transparency** | None — fully opaque, alpha 255 throughout |
| **Vector source** | **None found.** See the open item below |

### Do not use the PNG

`Nova-Shield-Website/assets/nova-shield-brand-banner.png` (2048 × 682) looks
like the same artwork but is a **damaged export**. Its alpha channel collapses
down the image — measured with the browser's own decoder at the horizontal
centre:

| Height | 5% | 30% | 60% | 80% | 90% | 97% |
|---|---|---|---|---|---|---|
| Alpha | 244 | 248 | 249 | 232 | **66** | **10** |

The bottom ~15% is effectively transparent, so the snow and mist foreground
disappear and anything behind it shows through. Verified by compositing it over
pure red. It is lower resolution *and* broken. The JPEG is the master.

### Derivative presentations

Every placement is a **window onto the master**, never a redraw, recolour or
stretch. Each box carries the aspect ratio of its own crop window, so the
artwork can only scale proportionally. Verified: zero distortion at 28, 40, 64,
128, 190, 300, 480 and 760 px.

| Class | Window on master | Rendered aspect | Use |
|---|---|---|---|
| `.brandart--mark` | x12% y17% w18% h54% → 391×391 | 1:1 | header, favicon-scale contexts |
| `.brandart--lockup` | x12% y15% w78% h46% → 1694×333 | 5.087:1 | hero, footer, customer quote |
| `.brandart--full` | whole file | 3:1 | About, brand moments |

**Legibility floors, measured:**
- `--mark` holds down to **40px**. Below that the aurora inside the crop competes with the shield.
- `--lockup` holds down to **300px**. Below that the artwork's own "MAINTENANCE SERVICES" stops being readable.
- **Therefore the header uses the mark plus a typeset wordmark**, not the lockup. That keeps the canonical symbol and keeps the descriptor legible and subordinate.

### Open item

No vector or transparent master exists. `ASSET_SPEC.md` records `BRAND-01/02/03`
for an SVG mark, a transparent lockup and a stacked lockup. Until those arrive,
every placement sits on a dark ground where the artwork's own navy sky blends in.

---

## 2. Colour — sampled, not invented

Read from `logo-hi.jpeg` by hue-filtered region sampling.

| Token | Value | Sampled from |
|---|---|---|
| `--art-night` | `#091933` | deepest night sky, upper corners |
| `--art-sky` | `#07456a` | mid sky behind the mountains |
| `--art-green` | `#1cc1a3` | brightest aurora green (hue 120–175°) |
| `--art-cyan` | `#0b999a` | aurora cyan band (hue 175–200°) |
| `--art-violet` | `#8a58f9` | aurora violet ribbons (hue 250–300°) |
| `--art-gold` | `#ddb675` | the `N` monogram |
| `--art-chrome` | `#fbfaff` | shield highlight |

### Working palette

| Token | Value | Role |
|---|---|---|
| `--ink` | `#03070f` | page ground — same hue family as `--art-night`, darker so artwork sits *on* it |
| `--ink-2` | `#071226` | raised surfaces |
| `--ink-3` | `#091933` | = `--art-night` |
| `--cream` | `#f3f6fa` | primary text |
| `--muted-lt` | `#bccbdd` | secondary text |
| `--muted` | `#8b9cb3` | tertiary text, labels |
| `--line` | `rgba(170,200,235,.13)` | hairlines |
| `--gold` | `#e0a53f` | **action only** — primary CTA |
| `--gold-2` | `#ffd48c` | gold hover, accent text |
| `--teal` | `#1cc1a3` | = `--art-green` |
| `--violet` | `#8a58f9` | = `--art-violet` |

**The aurora rule.** Green and violet are *light*, not paint. Allowed: a glow
behind an image, a tint along a section seam, a gradient across two or three
words, a dot on a bullet. Never: a filled button, body text, or a whole section.
**If a screenshot of any page reads as green-and-purple, it is wrong.**

Gold earns its power from scarcity — one primary CTA per view.

---

## 3. Typography

| Role | Face | Treatment |
|---|---|---|
| Display | **Fraunces** 300–560 | `clamp(2.3rem, 4.6vw, 3.9rem)` h2, `clamp(2.7rem, 5.6vw, 5.2rem)` h1, line-height .99–1.03, tracking −.03em |
| Interface | **Inter** 400–700 | body 16–16.5px / 1.6–1.68 |
| Eyebrow / chip | Inter 700 | 10.5px, tracking .22em, uppercase |
| Numerals | Inter 600 | `01` `02` — structure markers in spec lists |

"NOVA SHIELD" is always primary. "Maintenance Services" is always subordinate —
smaller, lighter, letterspaced — and is **hidden below 500px** where it crowds
the mark.

## 4. Space, grid, edges

- Container `1260px`, gutter `32px` (24px below 760px)
- Section rhythm `clamp(80px, 11vw, 160px)`
- Asymmetric splits: `5fr 7fr` (offset), `6.2fr 5.8fr` (media). Never 6/6
- **Radius `4px`** (`3px` small). 26px read as a SaaS dashboard card; architecture has edges
- Separation by hairline and space, not by boxes

## 5. Buttons

| | |
|---|---|
| Primary | gold gradient, dark text, 4px radius |
| Ghost | 1px hairline, cream text, gold on hover |
| Mode toggle | hairline + blur, gold when active, **44px minimum touch target** |

## 6. Service accents

Each service carries a desaturated hue for its hero wash, chip, spec numbers and
hover states. Presentation only — service definitions live in the `services`
table. Siding `#6fb3d8` · Roof `#5e8fd4` · Gutter `#9fb6c9` · Concrete `#c0a98a`
· Deck `#d2a06a` · Fence `#b99a77` · Windows `#7fd4e3` · Moss `#6fc79a` ·
Graffiti `#9d8fe0`.

## 7. Image treatment

- Real photography carries the site; gradients are the air around it
- Text over image always on a controlled scrim, never raw
- Any service without a truthful photograph gets the atmospheric hero plus a spec chip — never a misleading image
- A file under `assets/gallery/photo-NN.jpg` is treated as a generic placeholder; anything else is treated as verified and used

## 8. Motion

| Layer | Behaviour |
|---|---|
| Signature | the lighting mode toggle — demonstrates the product |
| Systemic | reveal on scroll, 16px travel, 700ms, no layout shift |
| Hover | light responding — lift, glow, brightened edge |

One shared implementation in `site/js/lib/reveal.js`. `prefers-reduced-motion`
fully respected; with motion off the page must still read as composed.

## 9. Responsive

Breakpoints **390 / 768 / 1024 / 1440**. Mobile is composed, not shrunk: the
headline is the hero, the lockup steps to 280px, mood tiles go single-column,
the brand descriptor is hidden, and touch targets are ≥44px.
