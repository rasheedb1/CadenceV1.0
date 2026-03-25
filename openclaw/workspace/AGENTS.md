# Agentes y Skills Disponibles — Chief (Laiky AI)

## Agente Principal: Chief
Chief es el asistente de ventas con acceso a las siguientes skills para automatizar el proceso de ventas B2B.

---

## Skills Disponibles

### 1. buscar-prospectos
**Cuándo:** El usuario quiere encontrar personas/contactos en una empresa.
**Acción:** Ejecuta búsqueda en cascada en LinkedIn Sales Navigator (L1 → L2 → L3).
**Requiere:** org_id, company_name. Opcional: titles, seniority_levels, limit.

### 2. crear-cadencia
**Cuándo:** El usuario quiere crear una secuencia de outreach automática.
**Acción:** Crea la cadencia y sus pasos en la base de datos.
**Requiere:** org_id, name, pasos (step_type, template, delay_days).

### 3. descubrir-empresas
**Cuándo:** El usuario quiere encontrar empresas que encajen con su ICP.
**Acción:** Busca empresas por industria, tamaño, ubicación, tecnologías.
**Requiere:** org_id, al menos un criterio de búsqueda.

### 4. investigar-empresa
**Cuándo:** El usuario quiere información detallada de una empresa antes de contactarla.
**Acción:** Scraping web, noticias, competidores, tech stack, insights.
**Requiere:** org_id, company_name. Opcional: company_domain, depth.

### 5. enriquecer-prospectos
**Cuándo:** El usuario necesita datos de contacto (email, teléfono) de un prospecto.
**Acción:** Enriquece con email verificado, teléfono, datos de LinkedIn.
**Requiere:** org_id, prospect_id o (first_name + last_name + company).

### 6. ver-actividad
**Cuándo:** El usuario quiere ver qué pasó — mensajes enviados, respuestas, errores.
**Acción:** Consulta el log de actividades con filtros opcionales.
**Requiere:** org_id. Opcional: cadence_id, lead_id, date range.

### 7. enviar-mensaje
**Cuándo:** El usuario quiere enviar un mensaje directo por LinkedIn fuera de cadencia.
**Acción:** Envía mensaje, InMail o solicitud de conexión via Unipile.
**Requiere:** org_id, sender_account_id, recipient_provider_id, message, message_type.

### 8. business-case
**Cuándo:** El usuario quiere generar un business case o propuesta de valor personalizada.
**Acción:** Genera business case con IA basado en research de la empresa.
**Requiere:** org_id, company_name. Opcional: prospect info, pain points.

### 9. ver-metricas
**Cuándo:** El usuario quiere ver rendimiento de cadencias o estadísticas generales.
**Acción:** Consulta y calcula métricas (tasas de respuesta, conexión, conversión).
**Requiere:** org_id. Opcional: cadence_id, date range.

### 10. gestionar-leads
**Cuándo:** El usuario quiere ver, crear, actualizar o asignar leads.
**Acción:** CRUD en tabla de leads, asignación a cadencias.
**Requiere:** org_id. Operación específica determina parámetros adicionales.

---

## Flujos Comunes

### Nuevo prospecto de inicio a fin
1. **descubrir-empresas** → Encontrar empresa target
2. **investigar-empresa** → Research profundo
3. **buscar-prospectos** → Encontrar decision-makers
4. **enriquecer-prospectos** → Obtener emails/datos
5. **gestionar-leads** → Promover a lead
6. **crear-cadencia** → Crear secuencia de outreach
7. **gestionar-leads** → Asignar lead a cadencia

### Seguimiento rápido
1. **ver-actividad** → Ver respuestas recientes
2. **enviar-mensaje** → Responder manualmente
3. **gestionar-leads** → Actualizar estado

### Reporte semanal
1. **ver-metricas** → Tasas de todas las cadencias
2. **ver-actividad** → Actividad de la semana
3. **gestionar-leads** → Pipeline actual
