# Card Authorization Rates by Country — Global Research

**Date compiled:** 2026-05-10
**Method:** 5 parallel research agents (one per region) — Worldpay, Adyen, Checkout.com, Stripe Outlook, McKinsey, EBANX, dLocal, Banxico/CONDUSEF, EBA/ECB, Forter, Ravelin, Apaya, Razorpay, RankingsLATAM, central bank publications.

---

## 0. Methodology & honesty disclaimers

**Authorization rate ≠ acceptance rate ≠ 3DS success rate.** These are three distinct metrics and are often conflated in industry blogs.
- **Authorization rate** = % of card txns approved by the issuer (what we want)
- **3DS / SCA success rate** = % of txns that complete the authentication flow (Europe data is mostly this)
- **Acceptance rate** = % of merchants accepting a card type (irrelevant here)

**Public country-level auth rates are scarce.** Only a handful of jurisdictions/processors publish anything granular: Mexico (CONDUSEF/Banxico), India (Razorpay), Japan (Forter/Adyen post Apr-2025 3DS mandate), Europe (Ravelin 2026), Brazil (Visa Performance Solutions 2016-17). For most other markets numbers below are **processor-side benchmarks or inferred from regional bands** — flagged in the table.

---

## 1. Master comparison table

Legend: **R** = regulator-published, **P** = processor/PSP disclosed, **B** = regional benchmark (no country data), **3DS** = 3DS success rate not pure auth, **n/a** = no public data found.

| Region | Country | Anchor rate | Type | Notes |
|---|---|---|---|---|
| NA | USA | ~85-90% e-com | B | Visa/MC cite ~15% e-com decline |
| NA | Canada | ~85-90% e-com | B | Interac dominates debit |
| NA | Mexico | **69% e-com (72% credit / 69% debit by count)** | R | CONDUSEF/Banxico H1 2024 |
| NA | Puerto Rico | ~US-tier (inferred) | B | Runs on US banking rails |
| NA | Dominican Rep. | **93% (NT cross-border)** | P | EBANX Oct 2025 |
| NA/CA | CR, PA, GT, SV, HN, NI, JM, BS, TT | n/a | — | No public data |
| LATAM | Brazil | **~80% e-com domestic / ~30% cross-border** | P | Visa cohort |
| LATAM | Argentina | ~70-80% domestic (inferred) | B | FX controls + PAIS tax |
| LATAM | Colombia | ~70-75% / **+10pp NT** | P | EBANX |
| LATAM | Chile | n/a | — | CMF MFA mandate 2023 |
| LATAM | Peru | **~73% / >80% NT** | P | EBANX 2025 |
| LATAM | EC, UY, PY, BO, VE | n/a | — | No public data |
| EU | UK | **92% (3DS-auth) / 95% 3DS success** | 3DS | Forter + Ravelin |
| EU | Germany | ~78-82% / **87% 3DS** | 3DS | Worst SCA impact |
| EU | France | **94.4% CIT / 91% 3DS** | R | Banque de France |
| EU | Spain | **81% 3DS** | 3DS | Ravelin 2026 |
| EU | Italy | **93% 3DS** | 3DS | Biggest post-SCA recovery |
| EU | Netherlands | **92% 3DS** | 3DS | iDEAL eats 70% |
| EU | Belgium | 80% 3DS | 3DS | Bancontact dominates |
| EU | Portugal | 77% 3DS | 3DS | MB WAY dominates |
| EU | Poland | 87% 3DS | 3DS | BLIK eats share |
| EU | Sweden | 76% 3DS | 3DS | Klarna ecosystem |
| EU | Norway | 78% 3DS | 3DS | High challenge rate |
| EU | Denmark | 75% 3DS | 3DS | MitID friction |
| EU | Finland | **72% 3DS (worst EU)** | 3DS | Ravelin 2026 |
| EU | Ireland | 91% 3DS | 3DS | UK-tier issuers |
| EU | Switzerland | ~85-90% (inferred) | B | TWINT dominates |
| EU | Austria | 88% 3DS | 3DS | |
| EU | Czech Rep. | 91% 3DS | 3DS | Modernized fast |
| EU | Greece | **74% 3DS (worst eurozone)** | 3DS | 28-31% txn loss |
| EU | Romania | 80% 3DS | 3DS | |
| EU | Hungary | 82% 3DS | 3DS | |
| MEA | UAE | ~78-94% (orchestration dep.) | P | Apaya / Jaywan |
| MEA | Saudi Arabia | **+8-12pp Mada local routing** | P | Apaya |
| MEA | Israel | n/a | — | Isracard/CAL/Max |
| MEA | Turkey | n/a | — | TROY 20% share |
| MEA | KW, BH, QA, OM | n/a | — | Domestic schemes |
| MEA | Egypt | **94% Fawry / 12-20% loss on cards** | P | EBANX + Apaya |
| MEA | South Africa | **rank 31/37 on 3DS globally** | 3DS | Ravelin 2025 |
| MEA | Nigeria | n/a (CBN reporting H2 2026) | — | Verve 70M+ cards |
| MEA | Kenya | n/a | — | M-PESA displaces cards |
| MEA | Morocco | n/a | — | CMI 200M+ tx 2024 |
| MEA | Algeria | **84% txn / 94% per-user** | P | Yassir post-opt |
| MEA | GH, CI, TZ, TN, ET | n/a | — | Mobile money dominates |
| APAC | Japan | **~94% non-3DS / ~75% 3DS** | P | Forter post-mandate |
| APAC | India | **85-90% domestic / 70-80% intl** | P | Razorpay |
| APAC | China | n/a (cards 14%) | — | Alipay/WeChat dominate |
| APAC | Australia | ~88-92% (inferred) | B | Adyen local |
| APAC | New Zealand | ~88-92% (inferred) | B | |
| APAC | Singapore | ~88-92% (inferred) | B | Card-heavy |
| APAC | Hong Kong | ~88-92% (inferred) | B | 339M tx Q4 2024 |
| APAC | South Korea | n/a (cards 58% e-com) | — | KRW 1,255T 2024 |
| APAC | Taiwan | n/a | — | $168B market |
| APAC | Indonesia | n/a (cards 5-8%) | — | GoPay/OVO/DANA |
| APAC | Thailand | n/a | — | PromptPay |
| APAC | Vietnam | n/a (NAPAS uptime ≠ auth) | — | VietQR |
| APAC | Philippines | n/a | — | GCash/Maya |
| APAC | Malaysia | n/a | — | "Debit-heavy" |
| APAC | Pakistan | n/a | — | PayPak |
| APAC | BD, LK | n/a | — | NPSB / LankaPay |

---

# 2. Per-country detail — North America + Caribbean / Central America

## United States
- **Overall:** No country-specific public figure. Global benchmark places e-commerce average at **85% (PayU), 85-90% (Worldpay)**. US e-commerce widely cited at ~85% via Visa/MC secondary sources. In-store ~97% (PayU).
- **Domestic vs cross-border:** Cross-border into US lower; pattern is domestic 85-90% / cross-border 72-80% (Stripe, Solidgate).
- **Credit vs debit:** Spreedly 2019 — debit/credit success differ >2 points in NA (tighter in Europe). No 2024 split published.
- **Decline benchmark:** ~15% of e-com declines (Visa/MC widely cited). 10-15% of e-com txns fail, costing $300-600B/year globally (MRC 2024).
- **Recurring:** ~15% of recurring payment attempts decline.
- **Stripe Authorization Boost:** +3.8% acceptance uplift on baseline.
- **Notes:** Federal Reserve Payments Study 2024 reports volumes/values, not auth. CFPB 2025 covers credit *application* approvals (different metric).
- **Sources:** [PayU](https://corporate.payu.com/blog/a-deep-dive-on-payment-approval-rates/) · [Worldpay](https://www.worldpay.com/en/insights/articles/c-suite-guide-to-auth-rates) · [Chargebacks911](https://chargebacks911.com/credit-card-decline-rates/) · [Stripe](https://stripe.com/authorization-boost)

## Canada
- **Overall:** No public country-specific number. Falls inside Worldpay 85-90% global e-com band.
- **Domestic vs cross-border:** Checkout.com (Jan 2025) launched direct Canadian acquiring specifically to lift Canadian approval rates vs cross-border. 47% of Canadian online purchases are credit cards.
- **Volume context:** Visa/MC/Amex/Interac processed **17.89B purchase txns in Canada in 2024, +6.7% YoY** (Nilson).
- **Notes:** Visa $0.0028 CVV2 fee from Apr-2024 — issuers say improves approval by enabling positive AVS/CVV scoring.
- **Sources:** [Checkout.com Canada](https://www.checkout.com/blog/2025-ecommerce-trends-in-canada-mobile-cross-border-and-payment-insights) · [Nilson](https://nilsonreport.com/articles/canada-card-issuers-and-networks-2024/)

## Mexico (the gold standard dataset)
- **E-com June 2025 (RankingsLATAM/CNBV):**
  - Credit: **75% by volume / 65% by value** (122.4M of 163.7M attempts; MX$149.8B of MX$229.6B)
  - Debit: **70% by volume / 68% by value** (288.6M of 412.0M attempts)
- **E-com Sep 2024 baseline:**
  - Credit: 72% by volume / 64% by value
  - Debit: 69% by volume / 61% by value
- **H1 2024 CONDUSEF:** **69% overall e-com auth by count** (893M attempts, 619M authorized)
- **Domestic vs cross-border:** Not split by RankingsLATAM. Worldline: traditional offshore yields **20-45% LATAM** vs **60-80% with local acquiring**. Pattern: 9/10 local-card vs 3/10 international-card.
- **Credit vs debit:** Credit > debit by volume (75 vs 70); debit > credit by value (68 vs 65) — credit hits more high-ticket credit-limit declines.
- **Chargebacks mid-2025:** Credit 0.27% value / 0.41% volume; Debit 0.24% / 0.31%.
- **Notes:** Structurally below 85-90% global benchmark. Year-over-year improvement: credit volume +3pts, debit volume +1pt. ClearSale: 58-65% offshore-acquirer floor; Samsonite case Hot Sale 2024 80% → 96% with fraud-screen tuning.
- **Sources:** [RankingsLATAM Jun 2025](https://rankingslatam.com/blogs/industry-news/mexico-ecommerce-payments-in-mid-2025-credit-and-debit-cards-show-solid-volumes-amid-controlled-chargeback-levels) · [Banxico/Condusef](https://www.condusef.gob.mx/) · [Worldline](https://worldline.com/en/home/main-navigation/solutions/merchants/global-collect/latin-america) · [ClearSale](https://en.clear.sale/blog/country-profile-the-guide-to-e-commerce-in-mexico)

## Puerto Rico
- **Overall:** No public data. PR treated as US-domestic for Visa/MC routing — issuers are US-bank affiliates. Auth likely tracks US baseline (80-92%) rather than LATAM/Caribbean.
- **Notes:** Cards "backbone of payments". 3DS adoption rising.
- **Sources:** [PayAtlas](https://payatlas.com/countries/puerto-rico-pr)

## Dominican Republic
- **Overall:** No public aggregate. **EBANX (Dec 2025): 93% approval rate for cross-border txns using Network Tokens** in early rollout phase — tokenized subset only, not whole market. Highest documented LATAM auth-rate figure published.
- **Cross-border:** 77% of DR e-com volume is cross-border (consumers buying internationally). USD-pegged reduces FX friction.
- **Credit vs debit:** No split. 84% of digital txns are credit/debit.
- **Local schemes:** CardNet ~80% of card txn value; Visanet Dom Rep + Azul compete.
- **Notes:** "Moderate fraud risk environment, CNP fraud most common threat." 3DS 2.0 is the lever issuers/merchants use.
- **Sources:** [EBANX press](https://www.fintechweekly.com/magazine/articles/ebanx-expands-network-tokens-latin-america-transaction-approval) · [Financial IT](https://financialit.net/news/payments/ebanx-drives-next-phase-credit-cards-latam-network-tokenization-cross-border)

## Costa Rica
- **Overall:** No public data.
- **Cross-border:** 77% of e-com volume is cross-border (dLocal).
- **Mix 2024:** 65% credit / 17% debit / 10% transfer / 4% cash / 3% wallet.
- **Notes:** From Jan-1-2024 BCCR mandated PIN auth for txns >¢50,000 — lifts security but dings auth at margin. SINPE Móvil (A2A real-time) cannibalizing card volume; >76% of CR adults 15+ use it.
- **Sources:** [Expat-tations](https://expat-tations.com/corporate/2024-card-payment-changes-in-costa-rica/) · [BCCR SINPE](https://www.bccr.fi.cr/en/payments-system/public-services/sinpe-m%C3%B3vil)

## Panama
- **Overall:** No public data. ~90% of online buyers purchase international. USD economy — cross-border auth should be unusually strong vs LATAM peers but no measured number.
- **Notes:** EBANX entered with CA launch (CR, SV, PA, GT, DO). Clave (domestic ATM/debit) handles in-country debit.
- **Sources:** [EBANX CA launch](https://business.ebanx.com/en/press-room/press-releases/ebanx-kicks-off-operations-in-central-america-starting-with-costa-rica-el-salvador-panama-guatemala-and-dominican-republic)

## Guatemala
- **Overall:** No public data. Up to **~70% of e-com sales are cross-border** (Americas MI) — implies aggregate dragged down by cross-border decline patterns.
- **Notes:** E-com $2.7B (2024) → $5.3B (2027), 26% CAGR. Cards recently overtook cash.
- **Sources:** [PaymentsCMI](https://paymentscmi.com/insights/top-global-payment-methods/)

## Jamaica
- **Overall:** No public data.
- **Notes:** Canadian banks (Scotiabank, RBC, CIBC) + Republic Bank dominate acquiring. PowerTranz / WiPay are primary gateways. No public benchmarks.
- **Sources:** [Finextra Caribbean](https://www.finextra.com/blogposting/18449/card-acquiring-trends-in-the-caribbean)

## Bahamas
- **Overall:** No public data. Same acquiring as Jamaica + Bank of the Bahamas, Royal Fidelity. Contactless penetration ~73% across Caribbean.

## Trinidad & Tobago
- **Overall:** No public data. Republic Bank's EPay and FirstAtlanticCommerce/PowerTranz dominate.

## Honduras / El Salvador / Nicaragua
- **Overall:** No public data. Not in EBANX/dLocal/RankingsLATAM published country lists.

---

# 3. Per-country detail — LATAM

## Brazil
- **E-com / CNP:** **~80%** (Visa Performance Solutions cohort 2016-17, still cited). Manual-PAN ~75%; tokenized Click-to-Pay 85% (ABECS/Adyen pilot 2024).
- **Card-present:** ~97%.
- **Domestic vs cross-border:** Brazilian cards authorize ~85-90% domestic; international cards authorize **~30%** ("3 in 10") — multiple sources (CommerceGate, Pagsmile, PagBrasil). Cross-border BRL ~11% outright failure (PCMI 2024).
- **Credit vs debit:** No public split. Credit ~50% of e-com volume. Online card = 21.9% of credit volume, 9.8% of debit (BCB 2024 H1).
- **Local schemes:** MC 51% / Visa 31% / Elo 14% (Worldpay GPR 2024). **Elo is domestic-only** — boosts domestic / kills cross-border. **41% of Brazilian online card txns come from digital issuers (Nubank etc.)** — EBANX 2025.
- **Network tokens:** EBANX measured **+7pp uplift** in Brazil pilots; **86% reduction in fraud-related declines**.
- **Notes:** Brazil has the LOWEST e-com auth rate in LATAM per Visa's own study. Cuotas/parcelado complexity + anti-fraud sensitivity + dual-rail (Elo + intl) are main drivers.
- **Sources:** [Visa BR](https://www.visa.com.br/sobre-a-visa/noticias-visa/nova-sala-de-imprensa/brasil-tem-menor-indice-de-aprovacao-nas-compras-digitais-da-america-latina-segundo-visa.html) · [Ingresse Click-to-Pay](https://www.mobiletime.com.br/noticias/23/08/2024/taxa-de-aprovacao-de-pagamento-do-click-to-pay-na-ingresse-e-de-85/) · [EBANX NT](https://business.ebanx.com/en/press-room/press-releases/network-tokens-cut-credit-card-fraud-declines-in-emerging-markets-by-86-ebanx-reports)

## Argentina
- **Overall:** No public number. Inferred ~70-80% domestic based on regional Rapyd bands (local 60-80% / offshore 20-45%).
- **Domestic vs cross-border:** Cross-border severely depressed by FX controls + IIBB/PAIS taxes. Many Argentine cards blocked from international by default — one of LATAM's worst.
- **Credit vs debit:** No split. Credit bigger online due to "cuotas sin interés" (3, 6, 12, 24 cuotas) and Cuota Simple program (TNA reduced 80→70% late 2024).
- **Local schemes:** **Cabal** (cooperative, ~1.8% MDR cap), **Naranja X** (largest non-bank credit; doubled issuance 2024). Visa acquiring Prisma + Newpay (Feb 2026 announcement).
- **Notes:** Hyperinflation → massive cuotas adoption → installment complexity reduces auth (must match issuer+acquirer+scheme+BIN). Wallets projected to overtake credit in e-com share by 2027 (59% wallets vs 25% credit). Rebill claims +20% above market avg + 71% auto-retry recovery.
- **Sources:** [PCMI Argentina](https://paymentscmi.com/insights/payments-ecommerce-trends-argentina-2024/) · [Rapyd LATAM](https://www.rapyd.net/blog/payment-processing-decline-rates-in-latam/) · [Naranja X](https://www.infobae.com/economia/networking/2024/10/08/naranja-x-duplico-el-otorgamiento-de-tarjetas-de-credito-con-tecnologia-cloud/)

## Colombia
- **Overall:** No headline number. EBANX states Network Token txns "10 percentage points higher" than non-tokenized — implies baseline non-tokenized ~70-75%, tokenized ~80-85%. EBANX processing 2M+ NT txns/month in Colombia; 87% merchant adoption.
- **Domestic vs cross-border:** Cross-border especially weak. Bancolombia PSE had documented "high error rate" approval incidents twice in 2024 (Jun + Aug, via Mercado Pago status).
- **Local schemes:** Visa/MC dominate cards. **PSE (A2A) handles 95% of bank-transfer e-com**, used by 29% of online shoppers.
- **Notes:** One of EBANX's 5 priority NT countries. Nuvei launched direct local acquiring 2024 specifically to lift auth.
- **Sources:** [EBANX NT LATAM](https://business.ebanx.com/en/press-room/press-releases/ebanx-drives-the-next-phase-of-credit-cards-in-latam-with-network-tokenization-for-cross-border-transactions) · [Nuvei Colombia](https://www.pymnts.com/news/acquiring/2024/nuvei-expands-latam-presence-with-direct-local-acquiring-in-colombia/)

## Chile
- **Overall:** No headline number. EBANX NT priority market — implies baseline issues. Cards 80% of e-com (60% credit + 20% debit). Visa cohort included but per-country not published.
- **Domestic vs cross-border:** More "international friendly" than Brazil/Argentina (lower FX friction, fully convertible CLP).
- **Local schemes:** No active proprietary scheme post-Redcompra/Transbank breakup. Transbank/WebPay processes ~70% electronic payments, now multi-acquirer.
- **Notes:** **CMF mandates MFA on all CNP since 2023 (NCG 514).** WebPay validated by Itaú Pass / soft-token from 2024. Banco Central Chile updated card regulation 2024. MFA likely creates measurable lift on auth + drag on conversion (no public study yet).
- **Sources:** [PCMI Chile](https://paymentscmi.com/insights/payments-ecommerce-trends-chile-2024/) · [BC Chile reg](https://www.bcentral.cl/en/content/-/detalle/bcch-actualiza-regulacion-tarjetas-pago)

## Peru
- **Tokenized e-com:** Verticals "exceed 80% approval" with Network Tokens; non-tokenized baseline **~7pp lower (so ~73%)**. **7 of 10 card txns in EBANX Peru flow now use NTs** (EBANX 2025).
- **NT uplift by vertical:** SaaS +8pp, online education +7pp, social media +6pp, online retail +3pp, streaming +3pp.
- **Credit vs debit:** No split. Credit 31% e-com, debit 20% (Niubiz/Ecommercenews).
- **Local schemes:** Niubiz (formerly Visanet Peru) processes 400M+ tx/year, 300k+ merchants. No major proprietary scheme.
- **Notes:** Best LATAM example of NT rollout actually lifting rates; verticals matter more than category averages.
- **Sources:** [EBANX NT LATAM](https://business.ebanx.com/en/press-room/press-releases/ebanx-drives-the-next-phase-of-credit-cards-in-latam-with-network-tokenization-for-cross-border-transactions) · [PCMI Peru](https://paymentscmi.com/insights/peru-analisis-tendencias-pagos-comercio-electronico-2024/)

## Ecuador
- **Overall:** No public data. Kushki ("higher acceptance rate" marketing) and Datafast (40k+ merchants) dominate; no benchmarks.
- **Notes:** Dollarized (USD) — no FX gap, cross-border friendly. Bank fees ~4% credit / 2% debit. Expect 70-80% domestic per Rapyd regional band.

## Uruguay
- **Overall:** No public data. Comprehensive new e-payments law 2024 (debit + credit + e-money unified).
- **Notes:** OCA (domestic credit issuer + scheme), Visa, MC. Debit promoted by VAT-reduction (Inclusión Financiera). Banco Central Uruguay published "Uruguay 2030" payments strategy Mar 2026.
- **Sources:** [Impo Inclusión Financiera](https://www.impo.com.uy/inclusionfinanciera/)

## Paraguay
- **Overall:** No public data.
- **E-com:** US$700M in 2024 (+32% YoY), 81% mobile.
- **Local schemes:** Bancard (domestic processor), Cabal Paraguay. QR adoption ahead of card growth — SiPAP.

## Bolivia
- **Overall:** No public data. Smallest payments market in scope.
- **Notes:** Heavy FX restrictions (USD shortage); cross-border card use restricted. Cash + bank transfer dominate.

## Venezuela
- **Overall:** No publicly available data. Effectively no cross-border card market.
- **Notes:** Most cards have credit limits in USD-equivalent of $55-385 (Banco de Venezuela). Foreign-currency debit cards (BNC "Pago Global" prepaid) used to access Shein/Amazon/Walmart. Suiche 7B (domestic switch). Sanctions + currency controls dominate every metric.

---

# 4. Per-country detail — Europe

**Bimodal market:** Non-3DS auth typically 88-94% (US-comparable); 3DS-applied conversion 75-90%. Since SCA covers ~60% of card volume, effective merchant-facing approval lands 5-12pp below US peers.

## United Kingdom
- **Overall:** **92%** (3DS-authorized txns, 2023, Forter). **95% 3DS success** (Ravelin 2026).
- **Completion:** 90% (5 biggest EU markets benchmark, UK highest).
- **Domestic vs cross-border:** EEA-issued ~85.5%; non-EEA ~89% on UK acceptance.
- **Credit vs debit:** No public split. Visa ~80% market share.
- **SCA:** UK delayed SCA to 14-Mar-2022. Post-enforcement: 79% complete, 8% customer-abandoned, 11% data-entry fail, 2% technical (Forter).
- **Web vs mobile:** 81% web / 72% mobile 3DS success.
- **Notes:** Best-in-class in Europe. FCA phased rollout + issuer maturity gives 5-10% auth advantage. New FCA push to soften SCA expected in PSD3 transposition.
- **Sources:** [Ravelin 2026](https://www.ravelin.com/blog/3d-secure-rates-2026) · [Forter via PCM](http://paymentsindustryintelligence.com/psd2-in-the-uk-the-impact-on-fraud-and-revenues-to-date/) · [Netcetera PSD2 UK](https://www.netcetera.com/stories/expertise/2022-PSD2-UK.html)

## Germany
- **Overall:** ~78-82% effective; **87% 3DS success** (Ravelin 2026).
- **Without 3DS:** 78-94% complete; **with 3DS:** 45-55% complete (Forter 2021 — worst-case Europe).
- **3DS abandonment:** 17-20% customer-abandoned + 20-22% auth fail.
- **Web vs mobile:** ~13% 3DS drop web→mobile.
- **Credit vs debit:** Heavily debit-led (**girocard 7.9bn payments 2024, +5.6% YoY**); credit penetration low → cross-border merchants see higher decline.
- **SCA:** Among harshest in Europe. 97% of DE/ES merchants cite conversion concerns (Ravelin).
- **Notes:** Issuer conservatism structural — Sparkassen/Volksbanken default to challenge. 3DS 2.2 frictionless adoption uneven across Landesbanken.
- **Sources:** [Forter PSD2](https://www.forter.com/blog/the-real-impact-of-psd2/) · [Ravelin 2026](https://www.ravelin.com/blog/3d-secure-rates-2026)

## France
- **Overall:** **94.4% CIT (customer-initiated)** — Cartes Bancaires scheme 2024. **91% 3DS success** (Ravelin 2026).
- **3DS decline vs non-3DS:** 40-50% drop (Forter 2021); improving fast — France saw **+40% jump in frictionless flows H1 2024**.
- **Credit vs debit:** ~85% of card volume is CB (co-badged Visa/MC, mostly debit-flagged). CB CIT 94.4% materially higher than 3DS-applied.
- **SCA:** Strict enforcer. Online card fraud dropped **40% 2018-2024** due to SCA (Banque de France). Card fraud rate at all-time low 0.053%.
- **Notes:** Domestic CB routing significantly outperforms international scheme routing.
- **Sources:** [Cartes Bancaires](https://knowledge.antom.com/cartes-bancaires-explained-what-global-merchants-need-to-know) · [Banque de France OSMP](https://www.banque-france.fr/en/publications-and-statistics/publications/annual-activity-report-observatory-security-payment-means-2023)

## Spain
- **Overall:** **81% 3DS success** (Ravelin 2026). 3DS decline ~40% (Forter 2021).
- **Card market:** 51% online payments by card in 2024; 62% by volume; ~94M cards in circulation by 2025.
- **SCA:** Severe — 97% of Spanish merchants cite 3DS conversion concerns. Behind France/UK on frictionless adoption.
- **Notes:** Big issuer concentration (Santander, BBVA, CaixaBank). High preference for challenge flows. Catching up on EMV 3DS 2.2 slowly.
- **Sources:** [Ravelin 2026](https://www.ravelin.com/blog/3d-secure-rates-2026) · [Cross-Border ES](https://cross-border-magazine.com/e-commerce-payment-spain-2025/)

## Italy
- **Overall:** **93% 3DS success** (Ravelin 2026, #2 in Europe).
- **3DS decline:** 40-50% drop with 3DS applied (Forter 2021) — but Italy made the biggest post-SCA recovery in Europe.
- **Notes:** **Italian issuers (Intesa, Unicredit) early-moved on Click-to-Pay and tokenization**, driving the recovery. PagoBancomat domestic scheme handles meaningful debit but migrating to international. Visa/MC each accepted by ~95% of Italian online stores; PayPal 91%.
- **Sources:** [Ravelin 2026](https://www.ravelin.com/blog/3d-secure-rates-2026) · [Forter](https://www.forter.com/blog/the-real-impact-of-psd2/)

## Netherlands
- **Overall:** **92% 3DS success** (Ravelin 2026, top-3 Europe).
- **Fraud:** 0.051% on Mollie platform (lowest globally).
- **Notes:** Card auth secondary for NL — **iDEAL handles ~70% of online volume**. Card payments perform very well; meaningful issuer count small (ABN AMRO, ING, Rabobank) and aligned on frictionless. Cross-border card auth into NL strong. Visa/MC Debit replacing Maestro is raising card share.
- **Sources:** [Ravelin 2026](https://www.ravelin.com/blog/3d-secure-rates-2026) · [Mollie NL](https://www.mollie.com/growth/card-payments-netherlands)

## Belgium
- **Overall:** **80% 3DS success.** Payments lost through 3DS ~28%.
- **Notes:** **Bancontact dominates online (73% preference)** — card auth matters less domestically, lots for cross-border. Belgian issuers conservative — high challenge rate. Bancontact-via-card txns near frictionless and don't show in card auth stats.

## Portugal
- **Overall:** **77% 3DS success** (Ravelin 2026).
- **Notes:** MB WAY / Multibanco dominate local stack; card auth smaller share + skews international. Issuers more challenge-prone than EU average. Cross-border auth into PT notably weak.

## Poland
- **Overall:** **87% 3DS success** (Ravelin 2026).
- **Notes:** BLIK has eaten card share heavily (**2.4bn txns 2024, +37% YoY; 76% consumer preference online**). Card auth comparatively strong because remaining volume is high-intent / high-value. PKO, Santander Polska, mBank reasonably modern on 3DS 2.2.
- **Sources:** [BLIK 2024](https://www.blik.com/en/over-2-4-bn-blik-transactions-in-2024-and-7-bn-in-10-years)

## Sweden
- **Overall:** **76% 3DS success.** Regional Nordic 83-86%. Payments lost through 3DS ~14% (best-in-Nordics).
- **Notes:** Domestic BankID is dominant SCA factor. Strong card culture (~80% preference), but **Klarna** (47% of online stores offer Klarna Invoice) eats checkout share. Swedish issuers (Swedbank, SEB, Handelsbanken, Nordea) lean conservative.

## Norway
- **Overall:** **78% 3DS success.** Nordic 83-86%.
- **Notes:** Flagged by Stripe as one of *worst* frictionless markets (very high challenge rate). **Vipps + BankID** dominate non-card. Conservative issuer policy + high mobile share = friction.

## Denmark
- **Overall:** **75% 3DS success.** Nordic 83-86%.
- **Notes:** Dankort (domestic debit) still meaningful but converging with international. **MitID required for SCA challenges drives high abandonment.** One of worst frictionless rates Europe (bottom-5 per Stripe).

## Finland
- **Overall:** **72% 3DS success — lowest in Europe** (Ravelin 2026).
- **Notes:** Counterintuitive — Finland scores high in Decta regional Nordic data (83-86%) but lowest in Ravelin's per-country. Discrepancy likely high challenge rate but high challenge *success* among those challenged. Bank-ID based auth high friction.

## Ireland
- **Overall:** **91% 3DS success** (Ravelin 2026).
- **Notes:** Visa >80% share. Issuer mix similar to UK with similar policies. English-speaking issuers benefit from shared 3DS UX best practice.

## Switzerland
- **Overall:** No specific public auth rate. **Not in EEA → PSD2/SCA does not apply legally**; 3DS adoption scheme-mandated only. High-friction market, conservative issuers (UBS, PostFinance, Raiffeisen). **TWINT dominates mobile** and bypasses card auth entirely. Anecdotal industry consensus: 85-90% domestic.

## Austria
- **Overall:** **88% 3DS success** (Ravelin 2026).
- **Notes:** **EPS / Klarna heavily used**; card share lower than EU avg. Austrian issuers similar profile to German — conservative but better 3DS UX.

## Czech Republic
- **Overall:** **91% 3DS success** (Ravelin 2026); 81% acceptance (older variance article).
- **Notes:** **76% of online payments by card — highest card-share in CEE.** Issuer market (ČSOB, Komerční banka, Česká spořitelna) modernized rapidly on 3DS 2.2.

## Greece
- **Overall:** **74% 3DS success.** Payments lost through 3DS ~31% (worst in EU dataset).
- **Technical issues:** 17% (ECB SPACE 2024, highest in eurozone).
- **Notes:** Worst combination of issuer friction + technical instability. **Over half of online retail uses cash-on-delivery.** Card issuers (NBG, Piraeus, Alpha) under-invested in 3DS UX. SCA exemption usage low.
- **Sources:** [Ravelin 2026](https://www.ravelin.com/blog/3d-secure-rates-2026) · [ECB SPACE 2024](https://www.ecb.europa.eu/stats/ecb_surveys/space/html/ecb.space2024~19d46f0f17.en.html)

## Romania
- **Overall:** **80% 3DS success.**
- **Notes:** Card leading in Eastern Europe but **BLIK launching late 2024/2025 will compress**. Domestic issuer concentration moderate. Improving 3DS trajectory.

## Hungary
- **Overall:** **82% 3DS success.**
- **Notes:** Mobile payments grew from 15% (2022) to 20%+ (2024). OTP Bank dominates issuance. Conservative challenge policy but reasonable success rate among completed flows.

### EBA / ECB pan-European context
- **94%** of EU payment cards SCA-enabled
- **82%** of EU users enrolled in SCA solution
- **87%** of issuer-initiated e-com SCA-compliant (EBA 2021 readout)
- **40%** of card payments SCA-secured (rest exempt — TRA, low-value, MIT, whitelisting)
- **17x higher fraud rate** on EEA-card txns where merchant is outside EEA
- **Card fraud 2024:** €1.329bn EU/EEA-issued (+29% YoY); overall fraud 0.002% of value
- **Frictionless rate Europe Jan-Jul 2025:** 62% (declining)
- **3DS success Europe aggregate 2025:** 83%; challenge success 75%

---

# 5. Per-country detail — Middle East + Africa

## United Arab Emirates
- **Overall:** No central-bank-published rate. **Apaya illustrative: same card at 94% with one acquirer vs 78% with another** — orchestration-dependent, 78-94% observed band.
- **Domestic vs cross-border:** Cross-border tourist volumes +55% YoY 2023 (Network International); no auth split. Apaya: **12-20% of legitimate txns fail across UAE/KSA/Egypt with single-PSP**.
- **Local schemes:** **Jaywan launched Q4 2024** (Al Etihad Payments). By Aug 2024 >90% of UAE POS Jaywan-ready. Domestic interchange ~30bps below international.
- **Notes:** Tokenization MENA grew **344.9%** (Checkout × MC May 2026); tokenized lifts approval **+3-6pp**.
- **Sources:** [Network Intl AR23](https://www.networkinternational.ae/media/1552/net-ar23-270324-2200.pdf) · [Apaya MENA](https://www.apaya.io/post/how-top-mena-merchants-improve-approval-rates-in-2026) · [Jaywan launch](https://aep.ae/en/news-media/press-releasesarticles/jaywan-uaes-new-domestic-card-payment-scheme-all-your-questions-answered/) · [Checkout × MC](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2026/may/checkout-com-and-mastercard-report-reveals-mena-emerges-as-one-of-the-fastest-growing-regions-to-adopt-tokenization-at-344-9/)

## Saudi Arabia
- **Overall:** No SAMA-published rate. Apaya: **8-12pp higher approval** when Mada routed via local-aware PSPs vs generic international rails. Non-optimized routing has materially lower auth (swing of ~10pp).
- **Cross-border:** Mada **>95% of POS txns** + **>90% of issued cards**. E-com on Mada: SR197.4B (~$52.6B) in 2024, +25.8% YoY; ~1.13B txns. Cross-border auth for foreign-issued cards in KSA reported lower by orchestrators.
- **Credit vs debit:** Mada is debit-dominated.
- **Notes:** E-payments **79% of retail txns** (SAMA 2024). 96% POS contactless; 51.9% cardless (tokenized mobile). International merchants routing Mada via Visa/MC rails suffer higher declines.
- **Sources:** [SAMA news](https://www.sama.gov.sa/en-US/News/Pages/news-1083.aspx) · [Arab News Mada](https://www.arabnews.com/node/2589350/business-economy) · [Apaya](https://www.apaya.io/post/how-top-mena-merchants-improve-approval-rates-in-2026)

## Israel
- **Overall:** No public auth rate. Card market $147.7B in 2024 (GlobalData). **Isracard ≈60% of issued cards**; CAL, Max, Amex remainder.
- **Notes:** Israeli market credit-heavy (deferred debit / charge-card dominant). Unique multi-payment installment (Tashlumim) complicates "auth" definition. Isracard/CAL/Max each operate proprietary networks → cross-border issuers can decline domestic-format requests at higher rates.
- **Sources:** [Isracard FY24](https://digital.isracard.co.il/globalassets/isracard/FinancialReports/2025/Isracard_Investors_Deck_2024_eng.pdf)

## Turkey
- **Overall:** No BKM-published auth rate. **435.47M cards in circulation end-2024**; TROY ~20% share by Aug 2025 with 67M+ cards. Card payments hit ₺2.21T in 2024.
- **Notes:** BKM operates Turkey's interbank card center. TROY is domestic scheme. Strict 3DS-everywhere regime since 2021. Heavy domestic FX volatility historically pressures cross-border auth.
- **Sources:** [BKM Annual](https://bkm.com.tr/en/reports-and-publications/annual-reports/) · [P.A. Turkey](https://www.paturkey.com/news/2025/turkeys-card-payments-hit-2-21-trillion-tl-25620/)

## Kuwait
- **Overall:** Not published. **KNET >90% of domestic txns**; debit-dominated (debit issued 6x more than credit, ~85% of txns).
- **Notes:** Tap markets "high acceptance rates" for KNET without disclosing a number. KNET is closed-loop; international cards face cross-border friction.

## Bahrain
- **Overall:** No public data. Domestic scheme **Benefit** routes domestic debit. MyFatoorah, PayTabs dominant PSPs.

## Qatar
- **Overall:** No public data. Qatar Central Bank Authority manages **NAPS** (National ATM/POS Switch). PayTabs + MyFatoorah licensed; Stripe localized.

## Oman
- **Overall:** No public data. **OmanNet** is domestic scheme. Sparse public payments data.

## Egypt
- **Overall:** EBANX reports **~94% approval on Fawry txns** through its rails with smart retries. **For cards (Meeza, Visa/MC domestic): no published rate.** Apaya groups Egypt with UAE/KSA: 12-20% loss without orchestration.
- **Domestic vs cross-border:** Strict capital controls + FX volatility → foreign-issued card declines notoriously high; orchestrators advise local acquiring.
- **Local schemes:** **Meeza** (regulated by CBE / Egyptian Banks Company). >4.2M cards converted to Meeza by 2022; Apple Pay support added Dec 2024 for NBE/Banque Misr/CIB Meeza.
- **Sources:** [Akurateco Fawry](https://akurateco.com/payment-methods/fawry) · [Apaya](https://www.apaya.io/post/how-top-mena-merchants-improve-approval-rates-in-2026) · [Meeza × Apple Pay](https://www.dailynewsegypt.com/2024/12/12/mezza-apple-pay/)

## Jordan / Lebanon
- **Overall:** No public data. Jordan: JoMoPay + CliQ dominate IPS; cards underused. **Lebanon: post-2019 banking crisis severely disrupted cards** — most foreign cards offline at domestic ATMs.

## South Africa
- **Overall:** No SARB-published auth rate. **Ravelin global 3DS ranking 2025: SA 31/37 on 3DS success rate and 34/37 on frictionless rate** — among worst-performing 3DS environments globally. **Mandatory 3DS** amplifies friction.
- **Domestic vs cross-border:** Card payment value **ZAR2.7T (~$149B) in 2024, +10.3% YoY**. Debit = 74% of value (GlobalData). Historical Spreedly (2013-2016): ZAR decline rates dropped from >90% to ~15% in that window.
- **Credit vs debit:** **43% of e-com used credit cards in 2024.** Debit dominant in overall value.
- **Notes:** **Yassir achieved 94% customer success / 84% transaction success** post-optimization (May 2024) — specifically called out **Mastercard debit failures in South Africa** as major drag.
- **Sources:** [Ravelin global 3DS](https://www.ravelin.com/blog/global-3d-secure-rates-country-data-comparison) · [GlobalData SA](https://www.globaldata.com/media/banking/south-africa-card-payments-to-exceed-158-billion-in-2025-amid-digital-surge-and-inclusion-push-forecasts-globaldata/) · [Yassir Medium](https://medium.com/@Yassirtech/how-we-achieved-a-93-success-rate-in-digital-payments-and-what-it-means-for-the-rest-of-africa-d67f7bdc8293)

## Nigeria
- **Overall:** No CBN-published rate (**CBN began requiring banks to report failed txns monthly only April 2026**). Paystack markets "near-100% success" on card txns for major Nigerian bank integrations — marketing claim, treat skeptically. Cards = 36% of Paystack txns 2023; bank transfers = 58%.
- **Domestic vs cross-border:** Foreign-issued cards face higher friction; **NGN volatility + CBN FX controls drove issuer caution 2023-2024**. Domestic Verve auth strong (Interswitch closed-loop); **70M+ Verve cards by Oct 2024**.
- **Notes:** Verve dominant domestic scheme. SCA enforcement variable. **NIBSS Instant Payments crowding out cards.**
- **Sources:** [TC Insights NG](https://insights.techcabal.com/nigerian-payments-report-2024-online-transfers-dominate-atm-transactions-decline/) · [Interswitch Verve](https://interswitchgroup.com/news/newsletters/details/interswitchs-verve-cards-gain-rapid-adoption/) · [CBN directive](https://businesspost.ng/banking/banks-to-submit-reports-on-failed-digital-transactions-monthly/)

## Kenya
- **Overall:** No public data. **M-PESA dominates and displaces cards** — 89% of adults made/received digital payments 2024, but mobile money is the rail. **Mobile money 79% of payments** per Paystack 2023.
- **Notes:** Mastercard × Safaricom (Sep 2024) expanded card acceptance to **636,000 M-PESA merchants** — but acceptance footprint, not auth rate.
- **Sources:** [MC × Safaricom](https://www.mastercard.com/news/eemea/en/newsroom/press-releases/en/2024/september/safaricom-and-mastercard-partner-to-expand-remittances-and-payment-acceptance-to-over-636-000-merchants-in-kenya/)

## Morocco
- **Overall:** No CMI- or Bank Al-Maghrib-published rate. **CMI processes ~95% of local card payments; >200M txns in 2024 (75% contactless); projected 240M in 2025.**
- **Notes:** CMI lowered domestic interchange to 0.65% (Sept 2024 directive) — should incentivize domestic routing + lift domestic auth. Multi-acquirer opened only recently → competitive pressure on auth transparency coming.
- **Sources:** [CMI fees](https://en.7news.ma/cmi-lowers-transaction-fees-to-boost-electronic-payments/) · [NA Post multi-acquirer](https://northafricapost.com/93183-moroccos-payment-infrastructure-provider-ensures-seamless-multi-acquirer-transition.html)

## Ghana
- **Overall:** No public data. **Mobile money 98% of payments** (Paystack 2023). Cards marginal.
- **Notes:** GhIPSS-operated Gh-link card scheme exists but small.

## Côte d'Ivoire
- **Overall:** No public data. Mobile money (Orange Money, MTN MoMo) dominates. Paystack opened private beta 2024.

## Tanzania
- **Overall:** No public data. Mobile money dominant (M-Pesa Tanzania, Airtel Money, Tigo Pesa).

## Algeria
- **Overall:** **Yassir is the closest proxy — 84% transaction success / 94% per-user success** post-optimization (May 2024). Baseline pre-optimization not disclosed.
- **Notes:** **SATIM** is national card scheme; very low card penetration; **CIB cards are debit-only**.
- **Sources:** [Yassir Medium](https://medium.com/@Yassirtech/how-we-achieved-a-93-success-rate-in-digital-payments-and-what-it-means-for-the-rest-of-africa-d67f7bdc8293)

## Tunisia
- **Overall:** No public data. **Société Monétique Tunisie** operates domestic switch. Very cash-heavy.

## Ethiopia
- **Overall:** No public data. Card market nascent; **EthSwitch** is domestic scheme; **Telebirr (mobile money)** and bank-to-bank dominate.

---

# 6. Per-country detail — APAC

## Japan
- **Overall (post Apr-2025 3DS mandate):** **~93-94% on non-3DS attempts; ~75% on 3DS-flagged** (Forter May 2025).
- **Net success after retries:** declined ~0.8pp post-mandate vs ~93% baseline (Adyen Jun 2025).
- **Pre-mandate 2024 baseline:** ~94-95% on non-3DS path.
- **Fraud-related issuer rejections:** **>4% of all 3DS2-initiated txns** (Forter).
- **3DS registration target:** 80% of EC users by March 2025 (JCA mandate).
- **Local scheme:** **JCB** (founded in Japan); JCB+Visa+MC = ~80% of cashless value.
- **Cards vs wallets:** Credit cards ~32.7% of payments value 2024; PayPay claims 60-70% of QR volume but cards dominate value.
- **Notes:** **"G12 issuer error" code heavily used and historically conflates fraud blocks with credit-line issues.** Japan has unique high cart abandonment (~83% vs 70% global). Local acquiring (Adyen, Checkout 2024) meaningfully lifting auth — exact uplift not disclosed.
- **Sources:** [Forter Japan 3DS](https://www.forter.com/blog/japans-3ds-mandate-completion-rates/) · [Adyen Japan](https://www.adyen.com/knowledge-hub/post-3ds-mandate-in-japan) · [Checkout Japan 3DS](https://www.checkout.com/blog/understanding-3d-secure-in-japan-and-its-impact-on-merchants)

## India
- **Overall (Razorpay 2024-2025):** **85-90% domestic credit/debit.** **Razorpay credit success: 91.12%.**
- **International cards on Indian merchants:** **70-80%** (heavy decline penalty).
- **Geographic split (the revealing data):** **Metro 78-82% / Tier-2 62-68% / Tier-3 cities 55-62%** — a **27pp gap**.
- **Industry blended (D2C):** 68-74%; benchmark target 85%+.
- **UPI (non-card, for context):** **99.2% success** (NPCI Nov 2024). 21.6B monthly txns (2025).
- **Net banking:** 90-95%. **UPI Autopay (recurring): only 30-50%.**
- **Local scheme:** **RuPay** ~16% credit card spend; nearly half RuPay credit spend now via UPI.
- **Notes:** Razorpay claims **Dynamic Smart Routing lifts auth 10-15pp**. **Evening peak (7-10 PM) drops PSR 8-12pp** due to bank load. RBI tokenization mandates improved card-on-file success.
- **Sources:** [Razorpay PSR](https://razorpay.com/blog/payment-success-rate-optimization-india) · [Razorpay reliability 2026](https://razorpay.com/blog/payment-gateway-reliability-india-businesses-2026) · [Paytm UPI](https://paytm.com/blog/payments/upi/upi-decline-rate-drops-to-0-8-global-expansion/) · [NPCI UPI](https://www.npci.org.in/what-we-do/upi/upi-ecosystem-statistics)

## China
- **Overall:** No public data.
- **Why cards are a misleading metric:** **UnionPay ~26% of volume but Alipay (~21%) + WeChat Pay (~18%) dominate digital; combined wallets >90% of digital wallet volume, $80T+ processed in 2024.**
- **Foreign card acceptance in China (CNP):** Historically extremely poor — UnionPay is only domestic processor; foreign Visa/MC face high decline. Ravelin: China "much lower acceptance rate" than global 3DS average (77%). **Card share of total payments ~14%.**
- **Local scheme:** **UnionPay** (used internationally in 183 countries; 230M+ cards issued outside mainland).
- **Notes:** Auth rate structurally uninformative in China — measure wallet success. Cross-border merchants serving Chinese should route to Alipay/WeChat, not cards.
- **Sources:** [Ravelin 3DS variance](https://www.ravelin.com/blog/why-do-3d-secure-acceptance-rates-vary-by-country-and-how-can-you-manage-this) · [Daxue](https://daxueconsulting.com/payment-methods-in-china/) · [Fabrick](https://www.fabrick.com/en-gb/insights/blog/digital-payments-in-china/)

## Australia
- **Overall:** No country-specific public auth rate from RBA, processors, or Adyen/Stripe. Mature-market benchmark: **88-92% domestic credit/debit**.
- **Card mix (Oct 2024 RBA):** 44% mobile wallets device-present, 54% contactless cards, 2% card-insert.
- **Local scheme:** **eftpos** (domestic debit); Visa/MC dominate credit. **LCR (Least-Cost Routing) is a regulatory priority.**
- **Notes:** Adyen launched local acquiring early; auth comparable to UK/US. RBA 2024 Issuer Cost Study targets cost transparency, not auth. Stripe submission to RBA acknowledged Adaptive Acceptance, Smart Retries, Network Tokens as material levers.
- **Sources:** [RBA Retail Payments Oct 2024](https://www.rba.gov.au/statistics/frequency/retail-payments/2024/retail-payments-1024.html) · [Stripe RBA submission](https://www.rba.gov.au/payments-and-infrastructure/review-of-retail-payments-regulation/2024/submissions/pdf/stripe-inc.pdf)

## New Zealand
- **Overall:** No public data.
- **Notes:** No local scheme (EFTPOS is debit infra, not scheme); Visa/MC dominate. Adyen local acquiring in NZ (original APAC market). Implied auth similar to AU (high-80s to low-90s).

## Singapore
- **Overall:** No country-specific number. Card-heavy mature; presumed **88-92% domestic** (Checkout.com: SG/HK "very credit card-heavy").
- **Local scheme:** **NETS** (domestic debit); Visa/MC for credit.
- **Cards vs wallets:** Cards dominant for value; PayNow (real-time A2A) growing P2P/small merchant; **SGQR+ launched 2024**.
- **Cross-border:** SGQR supports cross-border QR with CN, ID, MY, TH.
- **Notes:** Adyen, Stripe, Checkout all offer local acquiring → measurable uplift. MAS doesn't publish issuer-level auth.
- **Sources:** [Checkout APAC](https://www.checkout.com/blog/master-payments-asia-pacific) · [NETS](https://www.nets.com.sg/nets/for-business/accept-overseas-wallets-foreign-cards)

## Hong Kong
- **Overall:** No country-specific number. Card-heavy mature — implied **88-92%**.
- **HKMA Q4 2024:** 339.27M credit card txns, HK$271.4B value.
- **Local scheme:** **Octopus** (closed-loop transit/retail); credit cards mostly Visa/MC/UnionPay/JCB/Amex.
- **Notes:** Adyen has local acquiring. HKMA publishes volumes but not auth.
- **Sources:** [HKMA Q4 2024](https://www.hkma.gov.hk/eng/news-and-media/press-releases/2025/03/20250321-9/)

## Taiwan
- **Overall:** No public data.
- **2024 card market value:** $168B.
- **Local scheme:** Smart Pay / Taiwan Pay (A2A QR); cards Visa/MC/JCB. Mature card market; LINE Pay + JKO Pay + Taiwan Pay growing.

## South Korea
- **Overall:** No public data. **Card share of e-com 2024: 58%+. Total card payment value 2024: KRW 1,255.2T (+4.5% YoY).**
- **Local scheme:** **BC Card** (largest processor), plus KB, Shinhan, Samsung Card networks.
- **Cards vs wallets:** Mature card market; Samsung Pay + KakaoPay + Naver Pay growing on top of cards.
- **Notes:** Korea heavily card-based for credit but international card acceptance in some local merchants uneven; foreign cards face surcharges. KFTC publishes volumes not auth.
- **Sources:** [The Asset](https://www.theasset.com/article/55404/south-korea-card-payments-forecast-to-hit-us-1-1-trillion-by-2029)

## Indonesia
- **Overall:** No public data. **Card penetration only 5-8%.**
- **Local scheme:** **GPN**; QRIS for QR.
- **Cards vs wallets:** **Wallets dominate** — GoPay, OVO, DANA = 70%+ usage each. Cards relevant primarily for premium segments.
- **Notes:** Auth rate is wrong metric — measure wallet+QRIS success. Bank Indonesia 2024 QRIS volumes +175% YoY. Indonesia GMV $62B (largest in ASEAN).

## Thailand
- **Overall:** No public country-specific data.
- **Local scheme:** **TPN**; PromptPay for A2A QR (dominant).
- **Cards vs wallets:** PromptPay + TrueMoney + Rabbit LINE Pay reduce card share; cards still meaningful for travel/luxury/cross-border.
- **Notes:** 2C2P (HQ in BKK) leading SEA processor — IDC 2025 InfoBrief covers TH but doesn't publish country-level auth.

## Vietnam
- **Overall:** No public country-specific data.
- **NAPAS operational reliability 2024: 99.997%** (network uptime, NOT transaction-level auth — distinct metric, easy to misquote).
- **NAPAS volume:** 26M+ txns/day 2024 (+30.8% YoY). **VietQR growth: 2.2x volume, 2.6x value YoY.**
- **Local scheme:** **NAPAS** (domestic switch).
- **Cards vs wallets:** Wallets/QR rising fast; cards still meaningful for premium/travel.
- **Sources:** [xe.today NAPAS](https://xe.today/2024/12/02/the-power-of-napas-facilitating-26-million-transactions-daily-in-2024/)

## Philippines
- **Overall:** No public data. **2024 card market value: PHP 3.4T (~$61B), +17.2% YoY.**
- **Local scheme:** **BancNet** (domestic ATM/debit).
- **Cards vs wallets:** **GCash + Maya dominate** wallets; cards meaningful for premium.
- **Notes:** BSP doesn't publish auth. Market relatively under-banked for credit cards.

## Malaysia
- **Overall:** No public data. **2024 card market value: ~$84.9B (+10.2% YoY)**; credit/charge ~MYR 230.5B (+8.2%).
- **POS density:** 26,228 terminals per 1M people (2023) — higher than China (25,513) and Japan (20,867).
- **Local scheme:** **MyDebit** (domestic debit).
- **Cards vs wallets:** Checkout.com describes Malaysia as **"very debit card and online banking-heavy market"** — debit + FPX (online banking) dominate over credit and wallets.
- **Notes:** Adyen local acquiring. BNM doesn't publish auth.
- **Sources:** [GlobalData MY](https://www.globaldata.com/media/banking/malaysian-credit-charge-card-payments-grow-8-2-2024-forecasts-globaldata/) · [Primer MY](https://www.primer.io/blog/malaysia-payment-methods)

## Pakistan
- **Overall:** No public data.
- **Local scheme:** **PayPak** (domestic, launched 2016 by 1LINK).
- **Cards vs wallets:** Checkout.com describes Pakistan as **"a card-heavy market"** — but most adult population still unbanked; Easypaisa, JazzCash dominate mobile money.
- **Notes:** SBP regulates but doesn't publish auth. International card acceptance constrained by FX controls.

## Bangladesh
- **Overall:** No public data.
- **Local scheme:** **NPSB**.
- **Notes:** **bKash dominates mobile money**; cards low penetration. Stripe/Adyen don't have local acquiring.

## Sri Lanka
- **Overall:** No public data.
- **Local scheme:** **LankaPay**.
- **Notes:** Cards meaningful but small base; LankaQR growing. Limited international processor coverage.

---

# 7. Cross-regional patterns

1. **Cross-border penalty is the largest single auth-rate gap globally.** Worst in Brazil (~55pp domestic vs international cards). Typical: 10-20pp. Local acquiring + Network Tokens are the proven levers.
2. **Mature markets band at 87-92%; emerging markets at 65-82%.** Holds across regions.
3. **Local schemes are an underestimated factor.** Mada, Elo, Cabal, KNET, Verve, Jaywan, RuPay, JCB — when international PSPs route these as generic Visa/MC, auth craters 8-12pp.
4. **3DS impact:** Europe has cleanest data because PSD2 forced it; Japan newest case study (Apr 2025 mandate). Effective auth on 3DS-flagged drops 10-25pp; net impact after retries ~5pp.
5. **Tokenization (Network Tokens) is the most measurable global lever right now:** +3-10pp documented across MENA, LATAM, India.

---

# 8. Strategic implications for Yuno

**Solid public anchors you can cite:**
- Mexico 69% e-com auth (CONDUSEF H1 2024) — regulator-grade
- Brazil ~80% domestic vs ~30% international (Visa Performance Solutions)
- France 94.4% CIT auth (Banque de France 2024)
- Razorpay India 85-90% domestic / 70-80% international
- Japan 94% non-3DS / 75% 3DS (Forter)
- DR 93% NT cross-border (EBANX)
- EBA/ECB: 17x higher fraud on non-EEA cross-border

**Defensible levers to quantify:**
- Network Tokens: +7pp LATAM avg; +10pp Colombia; +8-12pp Mada in KSA; +3-6pp MENA tokenized
- Local acquiring: Brazil cross-border 30% → 60%+ (Worldline); MENA 12-20% loss recovery (Apaya)
- Orchestration / Smart Routing: inDrive 90% via Yuno

**Avoid:**
- Single-country auth-rate quotes for markets without public data (most of Caribbean, MEA, SEA, APAC ex-IN/JP)
- Confusing 3DS success rate with full auth rate (Europe data is mostly the former)
- Treating wallet-dominant markets (China, Indonesia, Kenya) as card-rate stories

---

# 9. Sources (master)

**Regulator-grade:**
- CONDUSEF Mexico — https://www.condusef.gob.mx/
- Banxico Reportes de Sistemas de Pago
- Banque de France OSMP — annual security observatory
- EBA/ECB Joint Fraud Report Dec 2025 — https://www.ecb.europa.eu/press/pr/date/2025/html/ecb.pr251215~e133d9d683.en.html
- SAMA, SARB, HKMA, RBI, BCB, RBA — volume data only

**Processor / PSP:**
- Razorpay India — https://razorpay.com/blog/payment-success-rate-optimization-india
- Forter Japan 3DS — https://www.forter.com/blog/japans-3ds-mandate-completion-rates/
- Forter PSD2 retrospective — https://www.forter.com/blog/the-real-impact-of-psd2/
- Ravelin 3DS 2026 — https://www.ravelin.com/blog/3d-secure-rates-2026
- EBANX Network Tokens LATAM — https://business.ebanx.com/en/press-room/press-releases/ebanx-drives-the-next-phase-of-credit-cards-in-latam-with-network-tokenization-for-cross-border-transactions
- Apaya MENA — https://www.apaya.io/post/how-top-mena-merchants-improve-approval-rates-in-2026
- Checkout.com × Mastercard MENA tokenization May 2026
- Yassir North Africa — https://medium.com/@Yassirtech/how-we-achieved-a-93-success-rate-in-digital-payments-and-what-it-means-for-the-rest-of-africa-d67f7bdc8293
- RankingsLATAM Mexico — https://rankingslatam.com/blogs/industry-news/

**Industry analyst:**
- Worldpay Global Payments Report (annual)
- Adyen Index reports
- Stripe Outlook
- PaymentsCMI by AMI
- dLocal LATAM guides
- Nilson Report
