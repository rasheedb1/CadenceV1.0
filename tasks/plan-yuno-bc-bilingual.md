# Plan: Yuno BC deck bilingüe (es | en)

**Goal:** soportar generación del business case en español o inglés sin romper los decks ya creados.

**Architecture:** dos templates (forks de slides JSX) + un skill bilingüe.
- Default `locale = 'en'` → todos los decks viejos (incluido `experian-93x4kr`) renderizan idénticos.
- Nuevo `locale = 'es'` → renderer carga `bc-slides-es-*.jsx`.
- Skill pregunta idioma en Phase A o lo acepta como flag.

---

## Tasks

- [ ] **1. Migración:** `ALTER TABLE presentations ADD COLUMN locale text DEFAULT 'en'` (idempotente, IF NOT EXISTS).
- [ ] **2. Endpoint create:** aceptar `locale` opcional en `presentation-create`, validar `∈ {'en','es'}`, persistir en la fila.
- [ ] **3. Fork slides 01:** copiar `public/bc-assets/bc-slides-01.jsx` → `bc-slides-es-01.jsx`, traducir copy. Lógica/cálculos intactos.
- [ ] **4. Fork slides 02:** copiar `public/bc-assets/bc-slides-02.jsx` → `bc-slides-es-02.jsx`, traducir copy.
- [ ] **5. Render branch:** en `presentation-render/index.ts`, decidir qué scripts inyectar según `row.locale`. Cambio mínimo (1 condicional).
- [ ] **6. Páginas auxiliares:** localizar `expiredHtml` y `notFoundHtml` para `locale='es'`.
- [ ] **7. Skill bilingüe:** añadir pregunta `idioma (es|en)` al inicio de Phase A. Texto de Phase A y sanity-check final en el idioma seleccionado.
- [ ] **8. Memoria de feedback:** registrar que el skill siempre debe preguntar idioma antes de Phase A.
- [ ] **9. Deploy:** `presentation-create` + `presentation-render` con `--no-verify-jwt`.
- [ ] **10. Smoke test:**
  - Regenerar Experian con `locale='es'` → slug nuevo, deck en español.
  - Abrir `https://chief.yuno.tools/bc/experian-93x4kr` (sin locale, default `en`) → confirmar idéntico al original.

---

## Constraints

- **No tocar** los archivos `bc-slides-01.jsx` ni `bc-slides-02.jsx` originales.
- Migración debe correr sin downtime (default value llena filas existentes con `'en'`).
- Sólo copy textual cambia en los forks — números, layout, cálculos, lever logic permanecen idénticos.

## Riesgos

- Drift entre los dos templates con el tiempo. Mitigación: cualquier cambio futuro al deck inglés se replica al español en el mismo PR (regla en lessons.md).
- Strings olvidados en español (ej. labels de tabla, pie de página). Mitigación: smoke test compara los dos decks visualmente.

## Review (post-impl)

_Pendiente._
