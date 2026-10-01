# Asset Comparison — Version 4 and V5

Both versions reference the **same nine photographs**. V4 uses them well; V5
uses two of them and assigns the rest at random.

## The headline finding

**All nine photographs are permanent-lighting shots. There are zero cleaning
photographs.** Every one of the nine cleaning-service hero assignments in
`services.detail.hero` is therefore wrong — not slightly off, but a lighting
photo fronting a cleaning page. That is what put a purple Christmas display
behind "Glass, frames and the edges people miss".

## Inventory

| File | What it actually shows | Currently assigned to | Correct? |
|---|---|---|---|
| `photo-01` | **Product shot** — four channel colours (black, tan, white, brown) with LED pucks, white background | Graffiti Removal hero | **No** |
| `photo-02` | Warm-white roofline, bungalow, dusk, deck and stairs | Siding hero | **No** |
| `photo-03` | Large home, warm white roofline + soffit, night, landscaped | Gutter Brightening hero | **No** |
| `photo-04` | Two-storey, warm white, night — **third-party yard sign visible** | Concrete hero | **No** |
| `photo-05` | **Teal/cyan colour scene**, night, moon, autumn pumpkins | Fence hero | **No** |
| `photo-06` | **Purple colour scene**, two-storey, night | Window Cleaning hero | **No** — caused the error |
| `photo-07` | **Multicolour scene**, portrait, night | Moss Removal hero | **No** |
| `photo-08` | **Warm white at blue hour**, portrait, patio + paver walkway | Roof Soft Wash hero | **No** |
| `photo-09` | Warm white, blue hour, **Christmas wreath on door** | Deck Cleaning hero | **No** |

All are 640px on the long edge — **too small for a hero at any viewport**.
Usable as thumbnails and gallery tiles today; not as full-bleed imagery.

## Where each one actually belongs

| Use | Files |
|---|---|
| Homepage hero (warm white, calm sky for type) | `photo-08` *(best)*, `photo-02` |
| Mood gallery — **Warm white** | `photo-02`, `photo-03`, `photo-08`, `photo-09` |
| Mood gallery — **Colour scenes** | `photo-05` (teal), `photo-06` (purple), `photo-07` (multicolour) |
| Mood gallery — **Soffit & detail** | `photo-01` |
| Permanent lighting — proof of colour-matching | `photo-01` |
| Christmas lighting | `photo-09` only, and weakly — it is a warm-white install with a wreath |
| **Any cleaning service** | **Nothing. All require new photography.** |

## What Version 4 did better with them

V4's **"One system. Every mood."** gallery groups these by *use* — Warm white /
Colour scenes / Soffit & detail — with a caption under each. That grouping is
the correct mental model for this product and it uses seven of the nine photos
meaningfully. V5 discarded it and shows two.

The hybrid restores it.

## Two provenance questions before launch

1. **`photo-04` contains a third-party yard sign.** If that is another company's
   sign, publishing it advertises a competitor on your own site. Confirm before use.
2. **Several of these look like supplier or manufacturer marketing photography**
   rather than Nova Shield's own jobs — the house styles and a visible US-format
   address plate suggest they are not local. If they are not your installs, they
   must not be captioned or implied as "our work", and usage rights need checking.

Until both are resolved, treat `photo-04` as unusable and caption the colour
scenes neutrally ("what the system can do") rather than as completed local jobs.

## Technical usability

| Question | Answer |
|---|---|
| Resolution adequate for hero? | **No** — 640px long edge |
| Adequate for gallery tiles? | Yes, at roughly 300–400px rendered |
| Correct service represented? | Lighting yes; **cleaning not at all** |
| Keep? | Yes, as lighting/gallery assets |
| Replace? | Yes — all need high-resolution versions; cleaning needs entirely new shoots |

## Consequence for the build

1. Cleaning service heroes keep the **atmospheric treatment** with a spec chip. No lighting photo is used to front a cleaning page.
2. The mood gallery is built now, using the real photos at tile size where they are genuinely adequate.
3. `ASSET_SPEC.md` already specifies the replacements; the before/after pairs (`SID-02/03`, `ROOF-02/03`, `GUT-02/03`, `CON-02/03`) are the highest-value missing assets, because neither version has a single before/after and it is the most persuasive asset in exterior cleaning.
