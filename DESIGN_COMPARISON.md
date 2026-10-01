# Version 4 vs V5 — rendered comparison

Both rendered at **1440 / 1024 / 390**. Version 4 from
`Downloads/Version 4.0 claude website.html` (untouched, its `assets/gallery/`
already resolves from `Downloads/`). V5 from the production Caddy config.

Verdict up front: **V4 composes better, V5 says more.** V4 knows how to build a
page; V5 knows what the business actually does. Neither is a keeper on its own.

---

### 1. Hero

**V4 — what works.** Aurora gradient ground, starfield, and a **mountain
silhouette** along the bottom edge — a northern landscape motif nothing else
has. Type sits on calm ground, so the headline is the loudest thing on screen.
At 390 it is still completely legible.

**V5 — what works.** A **real photograph of real work**: a house with the
roofline lit. Honest, specific, and it proves the product exists. Copy is far
better — "from one crew who does the work themselves" beats "thoughtfully
installed lighting and exterior care". A location badge grounds it locally.

**Keep:** V5's real photography and copy. V4's calm-ground discipline and the
mountain motif.
**Change:** V5's hero fails at 390 — the multicolour roofline runs straight
through "feel like home" and legibility collapses. It is also a *colour* install
fronting a brand whose everyday story is warm white.
**Why:** The photo is the honest choice; it is simply untreated. The fix is a
stronger scrim, a portrait crop that puts type on sky, and a warm-white hero
image with colour shown later as the party trick.

### 2. Navigation

**V4.** Shield + "NOVA SHIELD" only. Clean at 390.
**V5.** Adds "Maintenance Services" under the wordmark — cluttered at 390. Nav
labels are better though: actual service names rather than "Lighting / Services".

**Keep:** V5's labels, V4's mobile restraint.
**Change:** Drop the sub-line below ~500px.

### 3. Typography

Both use Fraunces display over Inter. V4 sets the headline larger relative to
its container and gives it more room. V5's recent service pages have the better
type *rhythm* (numbered spec lists, ruled entries).

**Keep:** The pairing, plus V5's editorial devices.
**Change:** Let homepage display type get bigger. V5 is still timid above 1200px.

### 4. Colour

**V4.** Green-black ground (`#060b0b`-family), teal + gold.
**V5.** Now true night navy, sampled from the supplied brand banner
(`#02040f / #011630 / #001433`), teal confirmed on-brand at `#019d8b`.

**Keep:** V5. This is not a preference — the brand artwork is blue.
**Change:** Nothing. V4's green ground is the one place it is objectively wrong.

### 5. Background treatment

**V4 — what works.** Layered: gradient + stars + silhouette + a chevron pattern
band between sections. Sections feel *composed*.
**V5.** One fixed body gradient, then flat sections all the way down.

**Keep:** V4's layering approach.
**Change:** V5 needs section-level treatment, not just a page-level wash.
**Why:** This is most of why V5 reads "flat" despite being dark.

### 6. Section composition

**V4 — what works.** Genuinely varied: asymmetric image-left/content-right
splits, a tag chip above the heading, feature bullets with gold dots and
title+description pairs, bordered process boxes. No two sections are the same
shape.
**V5.** Every section is `container → heading → grid`. Uniform padding
throughout.

**Keep:** V4's variety, especially the asymmetric split with a chip.
**Change:** V5's uniformity is the core failure.

### 7. Service presentation

**V5 — what works.** Database-driven, real per-service content with a point of
view, per-service accents, a numbered specification list, ruled "Before you
book" entries.
**V4 — what works.** A **capability matrix of tag chips grouped by area**
(01 LIGHT / 02 CARE / 03 WINTER). Dense, scannable, and it conveys breadth
without nine identical cards.

**Keep:** V5's content model and service pages. V4's grouped-chip matrix.
**Change:** **Delete the nine-card cleaning grid on the homepage.** It is still
the single worst thing on the page at every viewport.

### 8. Imagery

**V4 — what works, and this is the biggest single find.**
**"One system. Every mood."** — a captioned gallery grouped by *use*, not by
service: **Warm white** (the everyday look) / **Colour scenes** (holidays, game
days) / **Soffit & detail** (low-profile installs). It uses the real photographs
properly and it *proves the core claim* that one installation gives you a
different home every night.

**V5.** Uses two of the nine photos. Discarded the gallery entirely.

**Keep:** The mood gallery, wholesale.
**Change:** V5 is sitting on nine real job photos and showing almost none.

### 9. CTA design

**V4.** Gold pill primary, ghost secondary; a teal gradient full-width submit.
**V5.** Same pattern, plus the far better "no payment, no obligation" note and
the preselected-service quote form.

**Keep:** V5's behaviour, V4's full-width submit weight.
**Change:** Reduce pill rounding to match the 4px architectural language.

### 10. Animation

**V4 — what works.** A **WARM / COLOUR / OFF toggle** on the lighting preview.
It is the best interaction in any version: it is not decoration, it *demonstrates
the product*.
**V5.** Essentially no motion.

**Keep:** The toggle. Build it properly.
**Change:** Everything else — V5 has nothing to keep here.

### 11. Page transitions

Neither does anything. Both jump between pages with no continuity.
**Change:** Shared header, consistent accent carry-through, and reveal-on-scroll
so a page assembles rather than appearing.

### 12. Storytelling

**V4 — what works.** A real arc: promise → the signature service → what it can
look like → who we are → how it works → ask. It includes an **About moment**
("Built around the home, not just the job") using the shield lockup as a design
element, and a **numbered process** (01 Tell us / 02 Plan / 03 Complete).
**V5.** Promise → two lighting blurbs → nine cards → form. No About, no process.

**Keep:** V4's arc, About plate and process steps.
**Reject from V4:** The **"Nova Circle" loyalty tiers** (New / Returning /
Regular / Nova Circle). It advertises a programme that does not exist in the
database, the pricing engine or the business. Do not ship an invented loyalty
scheme.

### 13. Mobile layout

**V4.** Wins clearly. Calm ground, type dominant, fully legible at 390.
**V5.** Hero type fights the photograph; nav is cluttered.

**Keep:** V4's mobile discipline.
**Change:** V5's mobile hero needs a dedicated portrait composition, not a
desktop crop.

### 14. Service-page experience

**V5.** No contest — V4 has no real service pages. V5 has nine, each with its
own argument, accent, spec list, honest caveats, related services and a
preselected quote form.

**Keep:** All of it. This is V5's crown jewel.
**Change:** Give those pages V4's compositional variety and imagery.

### 15. Footer

Both thin. Neither is a model.
**Change:** Build one properly — service index, area served, contact, brand mark.

### 16. Overall brand personality

**V4** feels like a brand that hired a designer and had nothing to say yet.
**V5** feels like a real business that hired an engineer and no designer.

**The hybrid:** V5's substance, composed the way V4 composes, on V5's corrected
navy, with the gallery and the lighting toggle restored.

---

## What neither does well

- **No before/after anywhere.** It is the most persuasive asset in exterior cleaning and neither version has one.
- **No proof.** No reviews, no named local work, no team photograph.
- **Service imagery is wrong in both.** All nine photos are lighting shots; cleaning pages have no cleaning imagery.
- **No real page-to-page continuity.**
- **Neither footer is finished.**
