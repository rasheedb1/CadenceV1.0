# Plan: Filtrar Prospects con Contactos de Oportunidades Abiertas en Salesforce

## Objetivo
Al hacer cascade search de prospects, filtrar cualquier persona que ya sea contacto
en una cuenta de Salesforce con oportunidad abierta (is_closed = false).
Así evitamos contactar a alguien que ya está en un deal activo.

## Arquitectura

### Por qué un tabla nueva (`salesforce_contacts`):
- Los contactos hoy solo están en `company_registry.metadata.sf_contacts` (JSON, no indexado)
- Necesitamos queries eficientes por nombre normalizado durante cada cascade search
- Una tabla propia con índice permite filtrar en O(1) con un IN query

### Matching strategy:
- Match por nombre completo normalizado: lowercase, sin signos de puntuación
- "Jonathan Smith" (SF) ↔ "Jonathan Smith" (LinkedIn) → match
- Es la única info que tenemos en el momento del search (pre-enrichment, no hay email)

## Checklist

- [ ] **Migration 065**: Crear tabla `salesforce_contacts` con `name_normalized` indexado
- [ ] **`salesforce-sync`**: Poblar `salesforce_contacts` al sincronizar (clear + re-insert)
- [ ] **`cascade-search-company`**: Cargar SF contacts al inicio, filtrar resultados antes de insertar
- [ ] **Deploy**: función `salesforce-sync` + `cascade-search-company` + migration

## Detalle de cambios

### 065_salesforce_contacts.sql
```sql
CREATE TABLE salesforce_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sf_account_id TEXT NOT NULL,
  sf_contact_id TEXT NOT NULL,
  name TEXT NOT NULL,
  name_normalized TEXT NOT NULL,  -- lowercase stripped for matching
  email TEXT,
  title TEXT,
  has_active_opportunity BOOLEAN DEFAULT FALSE,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, sf_contact_id)
);
-- Index for fast lookup during cascade search
CREATE INDEX ON salesforce_contacts(org_id, has_active_opportunity);
```

### salesforce-sync: añadir al final del sync
```
// Clear + insert salesforce_contacts
// has_active_opportunity = account has open opps (is_closed = false)
```

### cascade-search-company: filtrar antes de insertar
```
// Load SF contact names with open opps for this org
// After cascade result → filter out any prospect whose normalized full name is in the set
// Log how many were filtered per persona
// Include sfFilteredCount in personaResults and response
```

## Review
_(se completa al terminar)_
