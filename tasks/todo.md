# TODO: Expandir Integraciones de Agentes

## Resumen
Expandir las 11 integraciones existentes para que los agentes puedan hacer todo lo que las APIs permiten — no solo leer, sino crear, actualizar, y gestionar.

## Prioridad 1 — Salesforce (CRM completo)
- [ ] `sf_update_opportunity` — cambiar stage, amount, close_date, probability, NextStep, Description
- [ ] `sf_get_stage_requirements` — cuando un cambio de stage falla por campos faltantes, retornar cuáles son
- [ ] `sf_create_opportunity` — crear oportunidad nueva con Account, Stage, Amount
- [ ] `sf_get_contacts` — buscar contactos por account o nombre
- [ ] `sf_log_activity` — crear Task/Event (llamadas, emails, reuniones)

## Prioridad 2 — Calendar (gestión completa)
- [ ] `update_calendar_event` — cambiar título, hora, descripción, attendees
- [ ] `delete_calendar_event` — cancelar evento
- [ ] `list_other_calendars` — ver calendarios de compañeros (free/busy)
- [ ] `create_recurring_event` — reuniones semanales/mensuales

## Prioridad 3 — Gmail (flujo completo)
- [ ] `send_email` — enviar correo directo (no solo draft)
- [ ] `forward_email` — reenviar correo existente

## Prioridad 4 — Gong (análisis de llamadas)
- [ ] `gong_get_call_summary` — resumen ejecutivo de una llamada (vía LLM sobre transcript)
- [ ] `gong_search_calls_by_deal` — buscar llamadas asociadas a una oportunidad/cuenta
- [ ] `gong_get_action_items` — extraer next steps/action items de transcripts

## Prioridad 5 — Apollo (prospección completa)
- [ ] `apollo_get_email` — obtener email verificado de un prospecto
- [ ] `apollo_get_phone` — obtener teléfono directo/móvil

## Prioridad 6 — Firecrawl (web completo)
- [ ] Verificar que `screenshot_page`, `scrape_url`, `web_search_firecrawl` funcionen
- [ ] `firecrawl_crawl_site` — crawlear un sitio completo (múltiples páginas)

## Review
- [ ] Testear cada tool nuevo con un agente real
- [ ] Verificar rate limits y error handling
