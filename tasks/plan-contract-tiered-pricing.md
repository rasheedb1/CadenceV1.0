# Plan — Tabla de pricing por tiers en el draft del contrato

**Objetivo:** Cuando el BC (o el usuario) tenga pricing por tiers/tranches, el draft del Yuno Order Form debe renderizar una tabla estilo "Table 3: Transaction Pricing" (match del screenshot compartido por el usuario), en lugar de meter un solo string en `{{TX_FEE_PAYMENT}}`. Flat pricing sigue funcionando como caso especial (tabla de 1 fila).

## Decisión de diseño (REVISADA)

**Enfoque elegido: inserción runtime de tabla nativa en el bridge, usando el placeholder existente `{{TX_FEE_PAYMENT}}` como marcador.**

Cero edición manual del template. El bridge:
1. Copia el template (sin cambios)
2. Corre el `replaceAllText` normal para las demás variables
3. Localiza el párrafo con `{{TX_FEE_PAYMENT}}` via `documents.get`
4. Borra ese párrafo e inserta una tabla nativa Google Docs en su lugar
5. Puebla las celdas con los tiers (o 1 fila flat "ALL TRANSACTIONS" si el BC tiene ratePerTx)

Si no hay info estructurada de pricing en el BC y el caller pasa `overrides.TX_FEE_PAYMENT` como string, se usa la ruta legacy (replaceAllText directo) — backward compat 100%.

Alternativas descartadas:
- ❌ Pre-built table con 6 filas en el template + row deletion — requiere editar el Google Doc manualmente y walk frágil si alguien retoca estilos.
- ❌ Dos templates (flat vs tiered) — duplica mantenimiento.

Sin cap de tiers (Docs API no tiene límite práctico).

## Tasks

### 1. Template (Google Doc) — manual, fuera del repo
- [ ] Abrir el template (`CONTRACT_TEMPLATE_DOC_ID = 1cyep0RqWAAXAwJV5BeYoLLJ1tFNDaPNXG774zcBI-Ko`) en Drive
- [ ] Justo después del título "Table 3: Transaction Pricing", insertar una tabla nativa de **7 filas × 4 columnas**:
  - Fila 1 (header, fondo azul + texto blanco): `FEE TYPE` | `MONTHLY TRANSACTION VOLUME` | `TIER` | `FEE PER TRANSACTION`
  - Filas 2-7 (tier rows): `{{PRICING_ROW_n_TYPE}}` | `{{PRICING_ROW_n_VOLUME}}` | `{{PRICING_ROW_n_TIER}}` | `{{PRICING_ROW_n_FEE}}` para n=1..6
- [ ] Eliminar cualquier referencia existente a `{{TX_FEE_PAYMENT}}` en el template (ahora vive dentro de la tabla)

### 2. Bridge — [openclaw/bridge/generate_contract.js](openclaw/bridge/generate_contract.js)

- [ ] Agregar helper `buildPricingRows(defaults)` que devuelve array de `{type, volume, tier, fee}`:
  - Si `defaults.rateTiers` tiene entradas con `upToTx` + `ratePerTx` (array no vacío): mapear cada tier. `volume` = `"<prev+1> - <upToTx>"` formateado con punto separador (`50.000`, `100.000`), excepto la última fila (si `upToTx === null`) → `"<prev+1>+"`.
  - Si sólo hay `defaults.ratePerTx > 0` (flat): una sola fila `{type: "TRANSACTION FEES - PAYMENT", volume: "ALL TRANSACTIONS", tier: "Tier 1", fee: "USD X.XXX"}`
  - Primera fila lleva `type: "TRANSACTION FEES - PAYMENT"`; filas 2..N lo dejan vacío (match del screenshot donde FEE TYPE está visualmente "merged").
  - **Truncar a 6** si `rateTiers.length > 6`; emitir `console.warn` con el exceso.

- [ ] Modificar `varsFromBC`:
  - Llamar `buildPricingRows(defaults)` y expandir a `PRICING_ROW_<n>_TYPE/VOLUME/TIER/FEE` por cada fila.
  - **Dejar de setear** `TX_FEE_PAYMENT` (deprecated; el placeholder ya no existe en el template).

- [ ] En `REQUIRED_VARS`:
  - Quitar `TX_FEE_PAYMENT`.
  - Agregar `PRICING_ROW_1_FEE` como centinela (garantiza que al menos una fila está poblada).

- [ ] Nueva función `deleteUnusedPricingRows({ docId, usedRows, accessToken })`:
  - `documents.get` para obtener `body.content`.
  - Walk del árbol hasta encontrar la primera `table` cuyo primer `tableRow` contenga el texto `FEE TYPE` (identificación robusta; no depende de posición).
  - Calcular índices de las filas con n > usedRows (ej. si usedRows=3, borrar filas 4,5,6,7 del body — que son las tier rows 4..6 en 0-indexed table offsets).
  - Emitir un `deleteTableRow` request por cada una, **en reverso** (índice más alto primero) para que los índices anteriores no se invaliden.
  - Batch en un solo `documents.batchUpdate`.

- [ ] En `generateContract`, orquestar:
  1. `driveCopy` (igual que hoy)
  2. `docsBatchReplace` con todas las vars (incluyendo `PRICING_ROW_<n>_*` para n=1..6; filas no usadas quedan con texto literal `{{...}}` que luego se borra con la fila)
  3. `deleteUnusedPricingRows` sólo si `rows.length < 6`

- [ ] Calcular `rows.length` antes del batchReplace para saber cuántas borrar; exponerlo en el response como `pricing_rows_rendered`.

### 3. Skill — [.claude/skills/draft-contrato/SKILL.md](.claude/skills/draft-contrato/SKILL.md)

- [ ] En step 3 (BC lookup): parsear y mostrar `rateTiers` completos al usuario en el resumen Phase A (formateados como el screenshot).
- [ ] En Phase A, reemplazar la pregunta única de `TX_FEE_PAYMENT`:
  - Si BC tiene `rateTiers`: "Detecté estos tiers en el BC, ¿los confirmas o editas?" + listar.
  - Si BC tiene `ratePerTx` flat > 0: "Pricing flat detectado en el BC: USD X.XXX. ¿Confirmas?"
  - Si no hay BC: "¿Pricing flat o tiered? Dame los tiers si es tiered (volumen y fee por tier)."
- [ ] En la sección "Variables reference": quitar `TX_FEE_PAYMENT`, agregar `PRICING_ROW_<n>_*` con explicación.
- [ ] En "Common mistakes": agregar "no mezclar tiers con flat rate — el bridge elige uno u otro según lo que traiga el BC o el usuario".

### 4. Registry — [supabase/migrations/099_contract_draft_skill.sql](supabase/migrations/099_contract_draft_skill.sql)

- [ ] Actualizar `skill_definition`:
  - Quitar `TX_FEE_PAYMENT` de required vars.
  - Agregar mención del nuevo set `PRICING_ROW_<n>_*` (n=1..6) y la lógica de tiers vs flat.
- [ ] Push con `ON CONFLICT DO UPDATE` (ya tiene la cláusula; basta re-ejecutar).

### 5. Deploy

- [ ] Commit + push → Railway auto-redeploya el bridge (service `866a62fd-0e0e-4d38-944a-0a17efe6067b`)
- [ ] Migration push via Supabase Management API (flujo estándar, mencionado en MEMORY)

### 6. Verificación

- [ ] Generar contrato para Rappi (BC `rappi-9wke9j`, 3 tiers: 0.05/0.04/0.03) → abrir el Doc y confirmar: tabla con 3 filas pobladas, 3 filas borradas, headers correctos, formato de volumen correcto (`0 - 5.000.000`, etc.)
- [ ] Crear BC de prueba con `ratePerTx: 0.04` flat (no `rateTiers`) → confirmar tabla de 1 fila "ALL TRANSACTIONS — Tier 1 — USD 0.040"
- [ ] Llamar el endpoint sin BC y con `overrides.PRICING_ROW_1_*` manual → confirma path manual funcional
- [ ] Probar caso degenerate: BC con `rateTiers: []` pero `ratePerTx: 0` → debe fallar con `missing: ["PRICING_ROW_1_FEE"]` y mensaje claro

## Fuera de scope

- Refactor de `TX_FEE_FRAUD` / `TX_FEE_3DS` a tabla (hoy líneas sueltas; si los queremos tiered en el futuro se hace aparte).
- UI en Chief para editar tiers post-generación (el usuario edita el Doc a mano).
- Migrar contratos ya firmados al nuevo formato.

## Riesgos

- **Template mal configurado**: si la tabla no existe o los placeholders están mal escritos, el contrato sale con `{{PRICING_ROW_1_FEE}}` visible. Mitigación: la task opcional de "validación post-generación" (abajo) lo detecta.
- **Parse del árbol de Docs**: `documents.get` devuelve contenido recursivo (`table → tableRows → tableCells → content`). Si el walk identifica mal la tabla, se borran filas que no debían. Mitigación: identificar por contenido del header ("FEE TYPE") no por posición; test manual con Doc conocido antes de push.
- **Concurrencia BatchReplace + deleteTableRow**: hay que hacer dos llamadas `batchUpdate` separadas (no se pueden mezclar en la misma request sin re-get). Entre la primera y la segunda, el doc está "dirty" con placeholders literales en las filas que se van a borrar — si algo falla entre las dos, el usuario ve un draft feo. Mitigación: si el segundo batchUpdate falla, log + devolver success con warning; el Doc queda creado, sólo con filas sobrantes.

## Tasks opcionales (después de que la base funcione)

- [ ] Validación post-generación: `documents.get` después del replace, regex `/\{\{[A-Z_0-9]+\}\}/` sobre todo el body, devolver `{ success: false, unresolved: [...] }` si queda algo. Útil en general, no sólo para esta feature.
- [ ] Soporte para tiers en `TX_FEE_FRAUD` y `TX_FEE_3DS` (misma mecánica, tablas aparte).
- [ ] `pricing_rows_rendered` en el response para que el skill pueda mostrarlo al usuario en el sanity check.
