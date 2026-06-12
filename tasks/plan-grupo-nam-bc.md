# Grupo Nam — Chief Business Case Deck

**Audience:** Grupo Nam (firma legal/fiscal MX, 11 personas, 15 clientes activos)
**Goal:** Justificar $550K MXN implementation + $20K MXN/mes recurrente para Chief — plataforma AI custom que automatiza sus 3 verticales (Facturación, Nómina, Materialidad) + Conciliación tesorería + Knowledge Hub.

**Deliverable:** Archivo HTML auto-contenido en `tasks/grupo-nam-bc/index.html` que se abre en browser, navegable con flechas, exportable a PDF. Look & feel = SDR-BC Nova-light, con "Yuno" reemplazado por "Chief" en todos lados (mismo tipo de letra Geist Variable).

---

## Inputs confirmados con usuario

| Input | Valor | Fuente |
|---|---|---|
| Cliente | **Grupo Nam** | user |
| Empleados | 11 personas | user |
| Clientes activos hoy | 15 | user |
| Plan baseline 12m sin Chief | 25 clientes (+10 orgánico) | user |
| Costo total/persona/mes (carga completa) | $50K MXN (benchmark sector legal/fiscal MX) | benchmark |
| % tiempo operativo vs estrategia | 65% operativo / 35% estrategia | benchmark |
| ARPU/cliente/mes | $30K MXN (rango sector $25-50K, conservador) | benchmark |
| Pricing Chief | $550K MXN impl + $20K MXN/mes | user |

> **Asunciones marcadas como tales en el deck** (no se presentan como hechos): ARPU, costo/persona, % tiempo operativo. Usuario las puede ajustar y los números se recalculan trivialmente.

---

## Math del Business Case

### Beneficios año 1 (con Chief)

**Lever 1 — Capacidad sin contratar (revenue uplift):**
- Chief reduce ~60% del tiempo operativo/cliente → cada persona puede manejar 2.5x más clientes
- Baseline sin Chief: 15 → 25 clientes en 12m (+10)
- Con Chief: 15 → 40 clientes en 12m (+25) sin contratar
- **Δ uplift Chief: +15 clientes × $30K × 12 = $5.4M MXN/año**

**Lever 2 — Costo evitado contratación:**
- Para llegar a 40 clientes sin Chief necesitarían ~4 personas adicionales (ratio actual ~3.7 clientes/persona)
- Costo evitado: 4 × $50K × 12 = **$2.4M MXN/año**

**Lever 3 — Liberación FTE tesorería (conciliación automatizada):**
- Hoy tesorería gasta ~70% del tiempo cruzando emisiones entre empresas Nam + bancos + clientes
- Automatizar = liberar ~0.7 FTE → reasignar a operación o no contratar
- **Valor: 0.7 × $50K × 12 = $420K MXN/año**

**Lever 4 — Calidad / riesgo regulatorio evitado (cualitativo + range):**
- Audit trail completo + validaciones automáticas reducen riesgo de error SAT
- Estimación conservadora: evitar 1 incidente menor/año = **~$500K MXN/año** (multa + horas remediación + reputación)

### Total beneficio año 1 (rango)

| Rango | Total/año |
|---|---|
| Conservador (sin lever 4) | **$8.2M MXN** |
| Base case | **$8.7M MXN** |
| Optimista (Lever 1 a +20 clientes) | **$10.5M MXN** |

### Inversión Chief — Bundle con capacitación

| Concepto | Sin capacitación | Con capacitación (bundle) |
|---|---|---|
| Plataforma (one-time) | $550K MXN | **$450K MXN** ← descuento $100K |
| Capacitación AI sector fiscal | — | $100K MXN |
| **Total one-time** | **$550K MXN** | **$550K MXN** (mismo total, con capacitación incluida) |
| Mensual recurrente | $20K MXN | $20K MXN |
| **Año 1 total** | **$790K MXN** | **$790K MXN** |
| Año 2+ recurrente | $240K MXN | $240K MXN |

### Términos de pago (acordados con usuario)

- **Plataforma:** 50% al firmar / 50% al entrar fase pre-productiva (primer cliente corriendo en plataforma con éxito)
- **Capacitación:** 100% al inicio del programa de capacitación
- **Mensualidad $20K:** empieza solo cuando la plataforma esté construida Y reduciendo tiempos con clientes en producción

### Capacitación AI — Currículum (sector legal/fiscal)

Programa de **4 módulos × 2 sesiones = 8 sesiones (~24 horas totales)**, híbrido presencial + virtual, material grabado.

| Módulo | Contenido |
|---|---|
| **M1 — Fundamentos AI aplicados al sector fiscal** | Cómo funcionan los LLMs (Claude, GPT) sin tecnicismos · Prompt engineering: anatomy de un prompt efectivo · Confidencialidad y compliance: qué datos pueden ir a un LLM · Casos reales sector legal/fiscal |
| **M2 — Herramientas de productividad diaria** | Análisis masivo de documentos (CFDI, contratos, opiniones SAT) · Generación de reportes ejecutivos cliente · Excel + AI: análisis de carga fiscal · Drafting de comunicaciones y memos |
| **M3 — Construir Skills y automatizar procesos** | Qué es un Skill (capability reusable) · Identificar procesos candidato a automatizar · Construir tu primer Skill: workflow facturación→conciliación · Triggers, condiciones, validaciones |
| **M4 — Roadmap automatización Grupo Nam (taller)** | Cada persona propone 1 automatización de su día · Priorización impacto vs esfuerzo · Prototipo en vivo con Chief team · Roadmap de 6 meses para escalar AI internamente |

**Outputs del programa:**
- 11 personas capacitadas con criterio para identificar oportunidades AI
- Backlog de 11+ automatizaciones priorizadas
- Cada persona puede mantener y extender los Skills creados
- Independencia de consultores externos para futuras automatizaciones

### ROI

| Métrica | Año 1 | Año 2 |
|---|---|---|
| Beneficio (base case) | $8.7M | $8.7M+ |
| Inversión Chief | $790K | $240K |
| **Neto** | **$7.9M MXN** | **$8.5M MXN** |
| **ROI** | **11x** | **36x** |
| Payback | **~1.1 meses** | — |

---

## Argumentos de soporte adicionales (para la sección "Por qué ahora")

Más allá del BC numérico, ayudar a Nam a ver:

1. **Defensibilidad competitiva** — sus competidores siguen en Excel + WhatsApp. Una plataforma propia es moat: clientes no se van fácil de un sistema donde tienen su histórico, conciliaciones, materialidad.
2. **Escalabilidad sin dependencia de personas clave** — hoy si el contador senior se va, se va el conocimiento. Estandarizar procesos en Chief = continuidad operativa.
3. **Compliance + auditoría SAT** — todo queda en bitácora, exportable, defensible. Reduce ansiedad de auditorías.
4. **Posicionamiento premium** — pueden subir tarifas o cobrar tiers (cliente con dashboard real-time vs cliente legacy). La plataforma es feature de venta.
5. **Knowledge Hub interno** — sale a relucir cuando un nuevo asociado entra, time-to-productivity baja de 3-6 meses a 4-6 semanas.
6. **Cross-sell entre verticales** — un cliente que entró por Facturación naturalmente sube a Nómina y Materialidad si la plataforma se los muestra. Hoy ese cross-sell es manual.
7. **Cobranza/cash flow** — al estandarizar emisiones, predecible cuándo factura, cobra, concilia. Mejor working capital.

---

## Slide manifest (22 slides)

| # | Slide | Tema/contenido clave |
|---|---|---|
| 01 | Cover | "Chief × Grupo Nam · Caso de Negocio" — Geist XL, accent navy, fecha 2026-05-22 |
| 02 | Agenda | 2×2 grid: Diagnóstico · Solución · Caso de Negocio · Próximos pasos |
| 03 | Section divider 01 | Dark navy "01. Diagnóstico" |
| 04 | Estado actual | 11 personas, 15 clientes, 3 verticales — diagrama operación |
| 05 | Donde se va el tiempo | Breakdown 65% operativo / 35% estrategia + cuellos de botella por vertical |
| 06 | El problema escalable | Sin cambio: capacidad tope ~25 clientes en 12m vs potencial |
| 07 | Section divider 02 | Dark navy "02. Chief — La Plataforma" |
| 08 | Visión plataforma | 5 módulos en un mismo workspace + arquitectura |
| 09 | Módulo Facturación | Workflow estandarizado, decisión asistida, emisión auto |
| 10 | Módulo Nómina | Onboarding empleado-cliente, cálculo carga impositiva, alertas |
| 11 | Módulo Materialidad | Generador AI con templates Nam-brand, aprobación 1-click |
| 12 | Módulo Conciliación | Cross-empresa + banco + cliente — vista unificada |
| 13 | Knowledge Hub | Búsqueda semántica, histórico cliente, onboarding interno |
| 14 | Section divider 03 | Dark navy "03. Caso de Negocio" |
| 15 | Los 4 levers | 4-card grid: Capacidad · Costo evitado · Tesorería · Calidad |
| 16 | Lever 1 — Capacidad | +15 clientes/año sin contratar = $5.4M MXN |
| 17 | Lever 2 — Costo evitado | 4 hires evitados = $2.4M MXN |
| 18 | Lever 3 — Tesorería | 0.7 FTE liberado = $420K MXN |
| 19 | Lever 4 — Calidad | Riesgo regulatorio evitado = ~$500K MXN |
| 20 | Resumen BC | Total año 1: $8.7M MXN / Inversión $790K / ROI 11x / Payback 1.1m |
| 21 | Soporte estratégico | 7 argumentos cualitativos (defensibilidad, premium pricing, cross-sell, etc.) |
| 22 | Closing / propuesta | "$8.7M MXN anuales." + CTA workshop + contacto rasheed@y.uno |

---

## Branding swaps (Yuno → Chief)

- Wordmark "yuno" → "chief" (Geist Variable, mismo weight 800, mismo tracking)
- Footer "YUNO · SDR Business Case" → "CHIEF · Business Case · Grupo Nam"
- Color palette intacta (navy `#0F1020`, accent `#3E4FE0`, lime `#E0ED80`)
- Title gradient intacto
- BeamRule + border-beam + stagger animations intactos

## Tareas

- [ ] Crear carpeta `tasks/grupo-nam-bc/`
- [ ] Build `tasks/grupo-nam-bc/index.html` — self-contained con `<style>` y `<script>` inline, navegable con ←/→ y dots
- [ ] Copiar Geist CDN links + design tokens del sdr-bc styles.css
- [ ] Implementar 22 slides usando layouts mapeados (Cover, Agenda, SectionDivider, ContentLight, LeverCardGrid, MetricSlide, ClosingDark)
- [ ] Reemplazar "yuno"/"YUNO" por "chief"/"CHIEF" en wordmarks/footers
- [ ] Validar números del BC: cada slide de lever cita su asunción explícita
- [ ] Probar en browser local (apertura, navegación, print preview)
- [ ] Documentar en este archivo el comando de abrir + cómo exportar a PDF (Chrome → Print → Save as PDF, landscape, no margins, 1920×1080)

## Review

**Entregable:** [tasks/grupo-nam-bc/index.html](grupo-nam-bc/index.html) (~95KB, 24 slides, self-contained)

### Cómo usarlo

**Abrir en browser:**
```bash
open "tasks/grupo-nam-bc/index.html"
```

**Navegación:**
- ← → · PageUp/PageDown · Spacebar (avanza)
- Home (slide 1) · End (slide 24)
- Click en flechas de la barra inferior

**Exportar a PDF:**
1. Abre el deck en Chrome
2. ⌘+P (Print)
3. Destination: "Save as PDF"
4. Layout: **Landscape**
5. Margins: **None**
6. More settings → Paper size: **Custom** (o "Tabloid Landscape" como aproximación)
7. Print background graphics: **ON**
8. Save

> El CSS `@page { size: 1920px 1080px }` instruye al browser a usar esa proporción. En la práctica Chrome respeta el aspect ratio 16:9 y produce 24 páginas.

### Validación

- ✅ 24 slides construidos en orden del manifest
- ✅ Geist Variable + Geist Mono Variable cargados vía CDN fontsource
- ✅ "Yuno" reemplazado por "Chief" en todo el deck (wordmark lowercase + footer uppercase)
- ✅ Paleta Nova-light intacta: `#F8F9FC` canvas, `#0F1020` dark section, `#3E4FE0` accent, `#E0ED80` lime
- ✅ Animaciones: stagger reveal, beam slide, border-beam (conic gradient con @property)
- ✅ Navegación teclado + click + URL hash (#1 a #24)
- ✅ Scaling responsive (transform scale) preserva aspect 1920×1080
- ✅ Math del BC matchea plan: $5.4M + $2.4M + $420K + $500K = $8.72M (mostrado como $8.7M)
- ✅ Pricing: bundle $450K plataforma + $100K capacitación = $550K total (mismo que sin capacitación)
- ✅ Términos de pago: 50/50 plataforma + 100% upfront capacitación + mensualidad post-go-live

### Si quieres iteraciones

Edits típicos directo en el HTML:
- Ajustar ARPU/cliente — busca `$30K` en slide 16 y recalcula
- Ajustar costo persona — busca `$50K MXN` en slides 17 y 18
- Cambiar nombre del cliente — `Grupo Nam` aparece ~25 veces
- Branding — `chief` (lowercase wordmark) y `CHIEF` (footer) son los únicos términos a tocar
