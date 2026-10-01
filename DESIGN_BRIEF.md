# Nova Shield — Public Site Design Brief

Stage 1 deliverable. Written after rendering every existing version in a
browser, not from reading CSS.

---

## 1. What already exists

| # | Version | File | Verdict |
|---|---|---|---|
| 1 | **Original** | `Nova-Shield-Website/index.html` | Closest to the brand. Keep its DNA. |
| 2 | **Upgraded (4.0)** | `Version 4.0 claude website.html` | Refinement of #1. Good structure, weaker imagery. |
| 3 | **Current (V5 Refined)** | `nova-shield/site/` | Functionally best, visually weakest. |
| 4 | **Night Signal** | `…(Night Signal - WILD DRAFT).html` | Best single idea on the whole project. |
| 5 | **Bold Editorial** | `…(Bold Editorial - DRAFT).html` | Best typography. Wrong ground colour. |
| 6 | Gemini draft | `gemini-code-….html` | Not referenced further. |

### A correction worth making

The current site is **not white**. Its default `refined` theme is near-black
(`#0f1412`). The "too white" reaction most likely came from the **footer theme
switcher**: picking *Bold Editorial* once stores `novaShieldTheme=editorial` in
`localStorage`, and every later visit renders the cream/paper skin until it is
changed back. That switcher was always a temporary review aid and is being
removed.

The substantive complaints — sterile, generic, SaaS-like, interchangeable —
are **correct and independent of lightness**. The current site is flat, not
pale. That distinction decides the fix: the problem is absence of depth,
imagery and atmosphere, not the presence of white.

### What each version actually does

**#1 Original — the brand is here.**
Uses the real supplied banner as a full-bleed hero: aurora, mountains, snowy
pines, stars. Serif display headline ("Make Your Home Feel Like Home"), an
oversized ghosted `NOVA SHIELD` wordmark layered *behind* the headline, gold
primary CTA, letterspaced uppercase eyebrows. Its own README names the
direction: *"Luxury architectural + Northern/Aurora + modern technical"* and
*"Permanent lighting is the visual flagship rather than a generic service
card."* That brief was right. The build was simply less developed.

**#3 Current — why it fails.**
Dark but inert. Below the hero: a four-item icon strip that reads as a generic
SaaS feature bar, then **nine identical cleaning cards** in a uniform grid —
same title, same paragraph, same "What this involves →", no imagery in any of
them. Flat matte panels, no gradient, no glow, no depth, no transitions between
sections. It looks like a dashboard listing records. Nothing says *night*,
*aurora*, or *Northern Ontario*. A visitor would not remember it.

**#4 Night Signal — one outstanding idea.**
"One shield. Seven signals." renders the services as a **radial constellation**
with the shield monogram at the centre and each service as a labelled point
orbiting it. It is memorable, it is navigation, and it is literally on-brand:
*nova* = star, night sky = the brand's own backdrop. Its gradient display type
is also effective in small doses. Its weakness is that the gradient text and
glow are applied broadly enough to drift toward neon.

**#5 Bold Editorial — the typography.**
Cream ground, high-contrast serif at tight leading, framed photo plates with
`Fig. 01` captions, hairline rules, numbered service entries, big paired
display words. Confident and grown-up. The cream ground contradicts a brand
built on night — but every one of those typographic devices works on a dark
ground, and that is how they should be reused.

---

## 2. The brand is already decided — by the logo

`assets/nova-shield-lockup.jpg` and `nova-shield-brand-banner.png` are real
supplied artwork, and they settle most open questions:

- A **chrome/silver shield** with a **gold `N` monogram**
- "NOVA SHIELD" in heavy metallic uppercase; "MAINTENANCE SERVICES" letterspaced below
- A **midnight-navy night sky** with stars
- **Green and violet aurora** as the atmosphere behind everything
- A Northern Ontario landscape: snowy pines, mountains, still reflective water

So the palette is not a choice to make, it is a palette to **extract**. Night
navy is the ground. Chrome is the text. Gold is the action. Aurora is weather —
present, never the subject.

---

## 3. Desired visual identity

> A home photographed at night, by someone who cared about the photograph.

Dark, atmospheric, architectural, quiet, expensive. Closer to a lighting
manufacturer's brand film or an architectural monograph than to a contractor
site. Confidence through restraint and contrast, not through decoration.

**Nova** = the light. **Shield** = the protection. The site should make that
duality legible without ever explaining it in a diagram.

---

## 4. Colour direction

Extracted from the supplied artwork.

- **Ground:** midnight navy, near-black with blue in it — never neutral grey, never pure black
- **Elevated surfaces:** a slightly lifted navy, separated by light and hairlines rather than by boxes
- **Text:** warm off-white at the top of the hierarchy, cool muted slate beneath
- **Primary accent — gold:** the monogram colour. Reserved almost entirely for the primary CTA and a very small number of emphasis marks. Its power comes from scarcity.
- **Atmospheric accent — aurora green and violet:** used as *light*, not as *paint*. Glow behind an image, a tint along a section seam, a gradient across two or three words. Never a filled button, never body text, never a whole section.

**Rule:** if a screenshot of any page looks green-and-purple, it is wrong.
Aurora should read as weather in the sky behind a building.

---

## 5. Typography direction

A two-voice system, taken from what already works.

- **Display — a high-contrast serif.** Large, tight leading, occasionally set in two stacked lines with a deliberate line break. This is the editorial voice from #5 and the original from #1. It carries the emotion.
- **Interface — a clean grotesque.** Navigation, labels, body, forms, buttons. This is the technical voice. It carries the information.
- **Eyebrows — letterspaced uppercase, small.** Section orientation. Already present in #1 and #3; keep it.
- **Numerals as structure.** `01 / LIGHT`, `Fig. 03` — borrowed from #5. Cheap, distinctive, and makes a page feel authored rather than generated.

Display type should be allowed to get genuinely large on desktop. The current
site's headings are too timid for the ambition.

---

## 6. Layout philosophy

**Continuous, not stacked.** The homepage is one descent through a night, not a
sequence of containers. Sections hand off to one another through shared
background, an image that bleeds across a seam, or a gradient that resolves.

- Full-bleed imagery is the default for story moments; constrained measure for reading
- Asymmetry over centred symmetry — a 7/5 split reads more designed than 6/6
- Hairlines and spacing for separation, not boxes
- **No uniform card grids as a primary device.** The nine-card cleaning grid is the single clearest failure in the current site
- Generous vertical rhythm; let moments breathe

---

## 7. Image philosophy

Images carry this site. CSS gradients are atmosphere *around* images, never a
substitute for them.

- **Real work, at night, wherever possible.** Permanent lighting is a night product; photograph it as one.
- Prefer **wide, architectural, low-angle** framing that shows a roofline against sky
- **Before/after is the most persuasive asset in exterior cleaning** and should be a designed component, not an afterthought
- Every image gets an intentional crop per breakpoint — not one file squashed into every slot
- Text over image always sits on a controlled scrim, never raw

Until real photography exists, placeholders must be **obviously placeholder** —
labelled, not pretty — so nothing fake survives to launch. Every required image
is specified in `ASSET_SPEC.md`.

---

## 8. Animation philosophy

Motion should feel like **light behaving**, not like elements sliding in.

- Reveals: short, small distance, slight blur-to-sharp. Never long slides
- Parallax only on hero and major image bands, and always subtle
- One signature motion: a slow aurora drift behind key moments
- Hover: light responds — a lift, a glow, a brightened edge
- Strict `prefers-reduced-motion` support; with motion off the site must still feel composed, which means layout and contrast do the work, not animation
- Nothing animates that would cause layout shift

---

## 9. Navigation philosophy

- Transparent over the hero, condensing to a solid navy bar on scroll
- Logo lockup always present — it is the strongest brand asset available
- **Services as a constellation**, carried forward from #4, used as a real navigation surface on the homepage and as a compact switcher in the service-page footer
- Contextual location shown as a designed line (`Services — Exterior Cleaning — Siding`), set in the eyebrow style, never a default breadcrumb
- Mobile: full-screen overlay panel, large touch targets, services grouped by category

---

## 10. Homepage structure

One continuous descent:

1. **Hero** — night, a lit home, the wordmark, one promise, one CTA
2. **The brand promise** — *Nova* is the light, *Shield* is the protection
3. **Permanent lighting story** — the flagship; transformation, architecture, year-round
4. **Seasonal lighting story** — warmth, the season handled, the arrangement
5. **Exterior care story** — material, surface, restoration
6. **The constellation** — service discovery, shield at centre
7. **Process / transformation** — how a job actually runs
8. **Proof** — only if real proof exists (see §12)
9. **Quote invitation** — designed as a destination, not a strip

## 11. Service page structure

A shared skeleton, with a per-service identity slot:

1. Contextual location line + service title + atmospheric hero
2. What this actually is — plain language
3. Why it matters for this home
4. How Nova Shield approaches it
5. What affects the work (the honest section — access, height, surface, condition)
6. What to expect on the day
7. Related services, as real suggestions
8. Quote CTA with **this service preselected**

Each service gets its own imagery, its own accent weighting and its own
"what affects the work" content. The skeleton repeats; the atmosphere does not.

## 12. Mobile approach

Designed, not shrunk.

- Hero recomposed for portrait: the headline is the hero, image crops to a tall architectural frame
- Breakpoints tested: **390 / 768 / 1024 / 1440**
- Display type steps down in scale but keeps its character
- Primary CTA always reachable; never a full-screen interstitial
- Constellation becomes a vertical list on small screens — the idea degrades gracefully instead of breaking
- Images serve correctly-sized sources; no desktop hero on a phone

---

## 13. Things explicitly NOT to do

- **No uniform card grid** as the main way of presenting services
- **No all-green-and-purple site.** Aurora is weather, not paint
- No neon, cyberpunk, gamer or "tech startup" cues
- No pure white or cream page grounds on the public site
- No generic contractor copy — "high-quality professional solutions" is banned
- No stock photography standing in permanently for real work
- No icon-strip feature bar under the hero
- No animation on everything; no motion that shifts layout
- No rounded-card-on-flat-panel dashboard look — that is the admin tool's job, and the two products must not converge
- No second hardcoded service catalogue — `services` in the database stays the source of truth
- No backend changes during this phase

---

## 14. What carries forward from where

| From | Carry forward |
|---|---|
| **#1 Original** | Supplied banner imagery, ghost wordmark layering, serif display, gold CTA, eyebrow labels, "permanent lighting is the flagship" |
| **#2 Upgraded** | Section rhythm, the *Nova — the light / Shield — the protection* framing |
| **#3 Current** | All of it functionally: database-driven services, the quote form, Turnstile, routing, accessibility scaffolding |
| **#4 Night Signal** | The constellation service map; gradient display type **in small doses only** |
| **#5 Bold Editorial** | Figure captions, hairline rules, numbered entries, paired display words, editorial confidence — transplanted onto a dark ground |

| Removed from current |
|---|
| Nine-card uniform cleaning grid |
| Icon-strip feature bar |
| Flat undifferentiated section panels |
| Footer theme switcher (review aid; source of the "too white" impression) |
| Timid heading scale |
