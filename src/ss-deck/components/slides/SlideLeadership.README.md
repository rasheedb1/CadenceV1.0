# SlideLeadership - Design Notes

The "About Yuno → Team" slide shown at the Stripe Sessions 2026 booth.

## Goal

Walk-up booth visitors (merchants, typically 2–5 seconds of attention per slide
as they pass) should come away with **one instant takeaway**: *"This team has
actually shipped payments at every brand I recognize."* Not a bio read, not a
reading exercise - a pedigree signal.

## What changed vs. the original

| Area | Before | After |
|---|---|---|
| Tiers | 3 labeled blocks (Founders / Leadership / Merchant Success & Delivery) - visually unequal weight because Founders had a bordered card and the others did not | 2 tiers (Founders / Leadership), consistent card treatment across the slide |
| Founders emphasis | Bordered purple-tinted box wrapping both cards | Gradient accent ring on each founder photo - subtle, elegant, no enclosing container |
| Per-person bio | 3-line prose description | One row of ex-employer logos (or a short pedigree label when no logo fits) |
| Logo strips | Two separate strips (one per tier), partly overlapping | One unified strip at the bottom with all 11 deduped pedigree brands |
| Vertical fit | Content overflowed the bottom margin | Fits comfortably inside the slide's safe area at 16:9 (tested down to ≈900px content height) |
| Section labels | Floating uppercase text | Dot + rule + uppercase label - same pattern the rest of the deck uses |
| Tagline | None | Right-aligned subtitle "12 operators who scaled payments at the world's most trusted brands" - gives the presenter/booth attendee an instant stat |

## Why the bio prose got replaced with logos

Prose descriptions like *"20+ years of experience in banking and fintech,
including CEO of RappiBank and leadership roles at Mastercard"* are optimized
for reading, not scanning. On a booth slide the reader parses the **logos**
faster than the sentence. Dropping to `mastercard · rappi` logos gives the
same credential signal in ~⅕ the visual footprint, which is what frees up the
vertical space the old layout was overflowing.

When no company logo is available (Marco - generic fintech experience; Walter -
MercadoPago + Cielo aren't in our asset set; Christo - Settle is sub-brand of
PayPal), fall back to a small `pedigreeLabel` string.

## Why one logo strip instead of two

The original slide showed a Leadership logo strip *and* a Delivery logo strip.
Several brands (worldpay, adyen, rappi) appeared in both, wasting space. A
single deduped strip with all 11 unique brands reads as one coherent
"pedigree bar" and makes the collective weight of the team more obvious than
two half-lists.

## Vertical budget (16:9, ≈960px content area)

Rough budget the layout was sized against - useful if any downstream edit
wants to keep it overflow-free:

| Section | Height |
|---|---|
| Top bar (section pill + Yuno logo) | ~45px |
| Title + tagline row | ~90px |
| Gap | ~20px |
| Founders (header + 2 cards) | ~140px |
| Gap | ~25px |
| Leadership (header + 5×2 grid) | ~280px |
| Gap | ~10px |
| Pedigree strip | ~110px |
| Slide number + bottom padding | ~50px |
| **Total** | **~770px** (comfortable inside ~960px) |

All sizes use `clamp()` so the slide scales gracefully for non-1920×1080
viewports (e.g. 1440×900 MacBook screens, 4K booth displays).

## Files

- [SlideLeadership.jsx](SlideLeadership.jsx) - component
- [SlideLeadership.data.js](SlideLeadership.data.js) - all people + logo data (split out so the component file satisfies `react-refresh/only-export-components`)
- [SlideLeadership.test.mjs](SlideLeadership.test.mjs) - data-integrity smoke test (photos exist, logos exist, scales defined, no duplicates). Run with `node src/components/slides/SlideLeadership.test.mjs`.

## Adding or removing a person

1. Edit `SlideLeadership.data.js` - add to `FOUNDERS` or `LEADERS`.
2. Drop the photo into `public/team/{name}.jpg|png`.
3. If they bring a new company pedigree, add its logo to `public/company-logos/{slug}.png` and register an entry in `LOGO_SCALES` + `PEDIGREE_LOGOS`.
4. Run the smoke test: `node src/components/slides/SlideLeadership.test.mjs`.
5. Update the tagline if the headcount changes (`"12 operators"` in `SlideLeadership.jsx`).

The leadership grid is hard-coded to 5 columns × 2 rows. If Leadership grows
past 10, bump `gridTemplateColumns` to 6 or move to a 4×N layout - don't let
the grid wrap unevenly, it looks broken.

## Per-logo scale calibration

`LOGO_SCALES` normalizes perceived visual weight: compact, stacked marks
(Mastercard's two circles, Adyen's rounded square, Rappi's script R) need to
be taller than horizontal wordmarks (Stripe, Uber, Worldpay) to read at
equivalent optical size. If a new logo looks undersized in the strip,
increase its scale by 0.1 increments until it balances.
