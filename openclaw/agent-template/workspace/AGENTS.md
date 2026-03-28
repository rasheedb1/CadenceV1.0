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

### 8. enviar-email
**Cuándo:** El usuario quiere enviar un email a un prospecto o lead.
**Acción:** Envía email via la cuenta Gmail conectada del usuario en Chief.
**Requiere:** org_id, owner_id (user_id del remitente), to (email destino), subject, body. Opcional: lead_id, cc.

### 9. business-case
**Cuándo:** El usuario quiere generar un business case o propuesta de valor personalizada.
**Acción:** Genera business case con IA basado en research de la empresa.
**Requiere:** org_id, company_name. Opcional: prospect info, pain points.

### 10. ver-metricas
**Cuándo:** El usuario quiere ver rendimiento de cadencias o estadísticas generales.
**Acción:** Consulta y calcula métricas (tasas de respuesta, conexión, conversión).
**Requiere:** org_id. Opcional: cadence_id, date range.

### 11. gestionar-leads
**Cuándo:** El usuario quiere ver, crear, actualizar o asignar leads.
**Acción:** CRUD en tabla de leads, asignación a cadencias.
**Requiere:** org_id. Operación específica determina parámetros adicionales.

### 12. identificar_usuario
**Cuándo:** Lookup de usuario por email dentro de una org (uso interno / admin).
**Acción:** Busca el usuario en la org por email, devuelve user_id, member_id, nombre y cuentas conectadas (LinkedIn, Gmail).
**Requiere:** org_id, email.

### 13. guardar_sesion
**Cuándo:** Inmediatamente después de verificar OTP exitosamente.
**Acción:** Persiste org_id, user_id, member_id y display_name asociados al número WhatsApp.
**Requiere:** whatsapp_number. Opcional: org_id, user_id, member_id, display_name.

### 14. enviar_otp
**Cuándo:** Onboarding de usuario nuevo — después de recibir su email.
**Acción:** Envía código de 6 dígitos al email via Supabase Auth. El usuario lo recibe en segundos.
**Requiere:** email.

### 16. gestionar_prompts
**Cuándo:** El usuario quiere ver, crear, editar o eliminar AI prompts.
**Acción:** CRUD en tabla ai_prompts.
**Requiere:** org_id, operation. Según operación: prompt_id, prompt (objeto), updates, filters.

### 17. gestionar_templates
**Cuándo:** El usuario quiere ver, crear, editar o eliminar templates de mensajes.
**Acción:** CRUD en tabla templates.
**Requiere:** org_id, operation. Según operación: template_id, template, updates, filters.

### 18. gestionar_personas
**Cuándo:** El usuario quiere ver, crear, editar o eliminar buyer personas.
**Acción:** CRUD en tabla buyer_personas.
**Requiere:** org_id, operation. Según operación: persona_id, persona, updates, filters (icp_profile_id).

### 19. gestionar_perfiles_icp
**Cuándo:** El usuario quiere ver, crear, editar o eliminar perfiles ICP.
**Acción:** CRUD en tabla icp_profiles. El "get" incluye las personas asociadas.
**Requiere:** org_id, operation. Según operación: profile_id, profile, updates.

### 20. ver_notificaciones
**Cuándo:** El usuario quiere ver sus notificaciones o marcarlas como leídas.
**Acción:** Lee notificaciones con filtros (tipo, leída/no leída) y puede marcar una o todas como leídas.
**Requiere:** org_id, operation (list, mark_read, mark_all_read).

### 21. ver_cadencia_detalle
**Cuándo:** El usuario quiere ver los detalles de una cadencia específica.
**Acción:** Lee cadencia + pasos + leads asignados en paralelo.
**Requiere:** org_id, cadence_id.

### 22. ver_conexiones
**Cuándo:** El usuario quiere saber qué cuentas tiene conectadas.
**Acción:** Lee unipile_accounts (LinkedIn) + ae_integrations (Gmail, etc.).
**Requiere:** org_id, user_id.

### 23. ver_programacion
**Cuándo:** El usuario quiere ver qué acciones están programadas.
**Acción:** Lee tabla schedules con filtros opcionales.
**Requiere:** org_id. Opcional: cadence_id, status, limit.

### 24. capturar_pantalla
**Cuándo:** El usuario pide EXPLÍCITAMENTE un screenshot del dashboard ("mándame captura", "muéstrame cómo se ve").
**Acción:** Genera magic link → Firecrawl toma screenshot → devuelve URL de imagen.
**Requiere:** page_path (ej: /leads, /ai-prompts), user_email.
**IMPORTANTE:** NUNCA usar automáticamente. Solo bajo petición explícita del usuario.

### 25. verificar_otp
**Cuándo:** Después de que el usuario comparta el código recibido en su email.
**Acción:** Verifica el código con Supabase Auth, resuelve user_id + member_id, guarda sesión permanentemente. Todo en un paso.
**Requiere:** email, token, org_id, whatsapp_number.

### 26. ver_calendario
**Cuándo:** El usuario quiere ver su agenda, reuniones del día/semana o verificar qué tiene programado.
**Acción:** Consulta las reuniones del calendario del usuario en un rango de fechas.
**Requiere:** user_id, org_id. Opcional: date_from (YYYY-MM-DD), date_to (YYYY-MM-DD).
**Devuelve:** Lista de reuniones con título, hora de inicio, duración, asistentes y links.

### 27. buscar_slots_disponibles
**Cuándo:** El usuario quiere saber cuándo está libre para reuniones, o quiere proponer horarios a un prospecto/cliente.
**Acción:** Analiza el calendario y calcula los slots de tiempo libre durante el horario de trabajo.
**Requiere:** user_id, org_id. Opcional: date (YYYY-MM-DD, default: hoy), days (1-7), timezone (IANA), business_start (hora, default: 9), business_end (hora, default: 18).
**Devuelve:** Lista de slots disponibles por día con hora inicio/fin y duración.

### 28. crear_evento_calendario
**Cuándo:** El usuario quiere crear una reunión, agendar una demo o enviar una invitación a un prospecto/cliente.
**Acción:** Crea el evento en Google Calendar del usuario y envía invitaciones por email a todos los asistentes. Genera Google Meet automáticamente si hay invitados.
**Requiere:** user_id, org_id, title, start_datetime (ISO 8601), end_datetime (ISO 8601). Opcional: timezone, description, location, attendees (array de {email, name}).
**IMPORTANTE:** Confirmar siempre con el usuario los detalles (fecha, hora, invitados) antes de crear.

### 29. sincronizar_calendario
**Cuándo:** El usuario quiere refrescar/sincronizar su calendario con Google, o dice que no ve reuniones recientes.
**Acción:** Llama a ae-calendar-sync para traer los eventos más recientes de Google Calendar.
**Requiere:** user_id, org_id.
**Devuelve:** Confirmación de sincronización con cantidad de eventos actualizados.

### 30. gestionar_agentes
**Cuándo:** El usuario quiere crear, listar o eliminar agentes AI de su organización.
**Acción:** CRUD sobre la tabla de agentes. Al crear, genera un SOUL.md automáticamente según el rol.
**Requiere:** org_id, operation (create/list/get/delete). Según operación: name, role, description, skills, agent_id.
**Ejemplo:** "Crea un agente CPO que se encargue de gestionar producto y priorizar features"

### 31. delegar_tarea
**Cuándo:** El usuario quiere que un agente hijo ejecute una tarea específica. Frases como "dile a X que...", "pídele a X que...", "que el CPO haga...".
**Acción:** Envía la tarea al agente via HTTP POST. Si el agente no está desplegado, la guarda como pendiente.
**Requiere:** org_id, instruction. Opcional: agent_id o agent_name (busca por nombre si no tiene ID).
**Ejemplo:** "Dile al CPO que analice el feedback de los últimos clientes y priorice los features para Q2"

### 32. consultar_agente
**Cuándo:** El usuario quiere hacerle una pregunta rápida a un agente sin crear una tarea formal. Frases como "pregúntale a X...", "¿qué opina X?", "consulta con el CFO...".
**Acción:** Envía mensaje al agente y devuelve su respuesta directamente.
**Requiere:** org_id, message. Opcional: agent_id o agent_name.
**Ejemplo:** "Pregúntale al CFO cuánto gastamos en infraestructura este mes"

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
2. **enviar-mensaje** o **enviar-email** → Responder manualmente por LinkedIn o email
3. **gestionar-leads** → Actualizar estado

### Enviar mensaje rápido desde WhatsApp
1. **buscar-prospectos** → Buscar persona por nombre/empresa
2. **gestionar-leads** → Crear lead con los datos del prospecto
3. **enviar-mensaje** o **enviar-email** → Enviar mensaje usando la cuenta conectada

### Reporte semanal
1. **ver-metricas** → Tasas de todas las cadencias
2. **ver-actividad** → Actividad de la semana
3. **gestionar-leads** → Pipeline actual

### Agendar reunión con prospecto
1. **buscar_slots_disponibles** → Encontrar cuándo está libre el usuario (pasar user_id de la sesión)
2. Proponer 2-3 opciones de horario al usuario
3. **crear_evento_calendario** → Crear el evento con el email del prospecto como asistente → Google Calendar envía la invitación automáticamente

### Ver agenda del día
1. **ver_calendario** → Consultar reuniones de hoy (date_from = date_to = hoy)
2. **buscar_slots_disponibles** → Ver ventanas libres para este día

### 33. reunion_agentes
**Cuándo:** El usuario quiere que varios agentes discutan un tema. Frases como "haz una reunión con X y Y", "junta a los agentes", "qué opinan X y Y sobre...".
**Acción:** Envía el tema a cada agente en paralelo, recopila sus perspectivas según su rol, y presenta el resultado consolidado.
**Requiere:** org_id, agent_names (array de nombres), topic.
**Ejemplo:** "Haz una reunión con Nando y Juanse sobre la estrategia de ventas para Q2"

### 34. desplegar_agente
**Cuándo:** El usuario quiere que un agente esté operativo con su propio servidor. Frases como "despliega a X", "activa a X", "pon a funcionar a X".
**Acción:** Crea un servicio en Railway, configura variables de entorno, y despliega el agente como proceso independiente.
**Requiere:** org_id. Opcional: agent_id o agent_name.
**Ejemplo:** "Despliega a Nando para que pueda trabajar de forma independiente"

---

## Flujos Comunes

### Crear agente y delegar tarea
1. **gestionar_agentes** (create) → Crear agente con rol, nombre y descripción
2. **delegar_tarea** → Enviar primera tarea al nuevo agente
3. Reportar resultado al usuario por WhatsApp

### Consultar opinión de un agente
1. **consultar_agente** → Hacer pregunta rápida al agente
2. Presentar respuesta al usuario con contexto del rol del agente
