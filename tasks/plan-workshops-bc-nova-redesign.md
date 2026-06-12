# NOVA slide redesign (Workshops BC · S21)

Source of truth for content: https://product.y.uno/nova
Source of truth for design language: NOVA web hero — kept inside Workshops BC system (Titillium Web + halftones + 6 themes).

## Goal
Make the NOVA slide carry NOVA's full story instead of just the "75% recovered" hook. Mirror the web page rhythm: pill → headline → subtext → capability cards → metrics strip, with the WhatsApp conversation as the live demo on the right.

## Plan

- [x] Read current `SlideNova.jsx` and confirm what to keep (conversation bubble) vs. replace (single-lever framing)
- [x] Fetch product.y.uno/nova to extract canonical copy + capabilities + metrics
- [x] Rebuild `SlideNova.jsx`:
  - [x] Top eyebrow `AI · NOVA` (existing SectionLabel)
  - [x] "Conoce a NOVA AI" pill with sparkle dot (mimic NOVA web hero pill)
  - [x] Headline: **"De la fricción al crecimiento — automáticamente."** — `automáticamente` painted with lime `#E0ED80`, `crecimiento` painted with `#BDC3F6`
  - [x] Subhead (NOVA web copy, ES): "NOVA convierte carritos abandonados, tarjetas rechazadas y solicitudes de soporte en conversaciones por IA que recuperan ingresos, encantan a los clientes y revelan las señales que antes pasabas por alto."
  - [x] Three capability cards (the 3 NOVA functions): Recuperación de ingresos / Soporte proactivo / Insights y optimización — icon + title + 1-line desc each
  - [x] Right column: keep conversation bubble (Coppel-flavored) with channel header `WhatsApp · Voz` (was WhatsApp-only)
  - [x] Below capability cards: Benante / Rappi quote — verified customer proof (placed left column, not under bubble, to balance the layout)
  - [x] Bottom metrics strip: `75% tx recuperadas · 70+ idiomas · 200+ países · 24/7 · PCI + GDPR + 0 dev`
- [x] Verify in `vite build` — green, ✓ built in 11.78s
- [x] Append review section

## Constraints
- Workshops BC uses Titillium Web (NOT Geist). Don't import Geist.
- Lime `#E0ED80` is for "live/ok/success" only — used here on `automáticamente` (the value moment) and the recovery checkmark in the bubble.
- 1920×1080 stage. Padding `--margin = 80px`. Don't overflow.
- Customer proof: ONLY Rappi-Benante (has public quote in `reference_yuno_customer_proof_library`).
- No new contexts, no new UI libs, no schema changes — just an `Edit` on `SlideNova.jsx`.

## Review

**Done in one file:** [src/workshops-bc/components/slides/SlideNova.jsx](src/workshops-bc/components/slides/SlideNova.jsx)

**What changed vs. v1:**
| | Before | After |
|---|---|---|
| Hero | "NOVA recupera hasta 75% de las transacciones fallidas" | "De la fricción al crecimiento — automáticamente" (NOVA web hero, verbatim) |
| Hero pill | none | "✦ Conoce a NOVA AI" (mirrors NOVA web hero pill) |
| Capabilities | 1 implicit (recovery) | 3 explicit cards: Recuperación / Soporte proactivo / Insights |
| Stats | 4 blocks: 75% / 70+ / 0 / 24/7 | 5-piece strip: 75% / 70+ idiomas / 200+ países / 24/7 / 0 dev · PCI + GDPR |
| Channels | "WhatsApp" only | Pill row: WhatsApp + Voz |
| Customer proof | none | Rappi · Benante verbatim quote (PCI library `reference_yuno_customer_proof_library`) |
| Conversation bubble | 4 turns | 5 turns + "es-mx · pago declinado · checkout coppel" metadata strip |

**Layout (1920×1080, --margin=80):**
- Left col (x=80 → 1180): pill / headline / subhead / 3 capability cards / Rappi quote
- Right col (x=1240 → 1860): full-height conversation bubble (top=120, bottom=110)
- Bottom strip (left col only, bottom=70): 5-stat metrics row with hairline divider

**Verified:**
- `vite build` green, no TS errors, 11.78s
- Customer proof library compliance — only Rappi-Benante cited (verified quote)
- Lime `#E0ED80` reserved for value moment (`automáticamente`) + recovery checkmark only
- No new imports, no new dependencies, no schema changes

**Not done (intentionally):**
- No border-beam / shimmer (Workshops BC system doesn't have those keyframes; would require new CSS in `index.css`)
- No use-case tabs ("Pagos fallidos / Checkouts / Saldos") — would saturate the slide
- No animated WhatsApp ticks — static `✓ pago recuperado` pill keeps the bubble readable on screenshot

