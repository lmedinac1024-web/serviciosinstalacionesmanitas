
# Plan: App de Gestión de Trabajos Diarios

## 1. Backend — Lovable Cloud

- Base de datos PostgreSQL + storage de fotos + auth, todo integrado.
- Si quieres seguir usando Google Sheets en paralelo, se puede añadir un botón de exportar a CSV/Sheets, pero la fuente de datos en vivo es Cloud (más rápido y fiable en móvil).

### Tabla `jobs`

| Campo | Tipo | Notas |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK auth.users |
| fecha | date | |
| hora | time | |
| cliente | text | |
| servicio | text | |
| direccion | text | |
| piso, puerta | text | |
| codigo_postal, ciudad | text | |
| telefono | text | |
| estado | enum | pendiente, en_proceso, realizado, cancelado_cliente, cancelado_no_estaba, cancelado_direccion, cancelado_otro |
| motivo_cancelacion | text | |
| importe | numeric(10,2) | |
| cantidad | int default 1 | para el ×2 |
| total | generated | `importe * cantidad` |
| foto_inicio | text | URL en storage (obligatoria al iniciar) |
| foto_final | text | URL en storage (obligatoria al finalizar) |
| observaciones | text | |
| created_at, finalizado_at | timestamptz | |
| telegram_inicio_msg_id | text | id del mensaje enviado |
| telegram_final_msg_id | text | id del mensaje enviado |

RLS por `user_id`. Bucket privado `job-photos` con políticas por usuario.

## 2. Pantallas

- `/` Dashboard
- `/pendientes`
- `/hoy`
- `/trabajo/$id` Detalle
- `/trabajo/nuevo`
- `/realizados`
- `/cancelados`
- `/ganancias`
- `/historial` (filtros: día/semana/mes/cliente/ciudad/estado/tipo)
- `/ajustes` (Telegram chat_id, exportar CSV, cerrar sesión)
- `/auth`

Nav inferior en móvil, sidebar en desktop.

## 3. Dashboard — KPIs

Pendientes hoy · Realizados hoy · Cancelados hoy · Ganado hoy/semana/mes/total · Total trabajos realizados · Total pendientes.

## 4. Cálculo de ganancias

`SUM(importe * cantidad)` filtrando `estado = 'realizado'`:
- Hoy: `finalizado_at::date = CURRENT_DATE`
- Semana: `>= date_trunc('week', now())`
- Mes: `>= date_trunc('month', now())`
- Total: sin filtro

Ej.: 30 € × 2 = 60 €. ✅

## 5. Detalle del trabajo — botones

- 📞 Llamar (`tel:`)
- 💬 WhatsApp (`https://wa.me/...`)
- 🗺️ Google Maps con `direccion + codigo_postal + ciudad` (piso/puerta se muestran pero NO entran en la búsqueda)
- ▶️ **Iniciar / Llegué** → ver flujo abajo
- ✅ **Finalizar** → ver flujo abajo
- ❌ Cancelar (modal con 4 motivos)

## 6. Flujo "Llegué" (con foto obligatoria + Telegram)

1. Usuario pulsa **Llegué / Iniciar**.
2. La app abre **directamente la cámara** para subir la **foto de inicio**.
   - No se puede continuar sin foto. Si cancela la cámara, el estado NO cambia.
3. Al subir la foto:
   - Se guarda en `job-photos/{user_id}/{job_id}/inicio.jpg` → URL en `foto_inicio`.
   - Estado → `en_proceso`.
   - **Se envía automáticamente a Telegram** un mensaje con:
     - Cliente, dirección, hora de llegada, importe.
     - La foto de inicio adjunta (`sendPhoto`).
   - Se guarda `telegram_inicio_msg_id`.
4. Si el envío a Telegram falla: el trabajo queda iniciado igual, se muestra aviso "no se pudo enviar a Telegram" con botón reintentar.

## 7. Flujo "Finalizar" (con foto obligatoria + Telegram)

1. Usuario pulsa **Finalizar**.
2. La app abre **directamente la cámara** para la **foto final**.
   - No se puede marcar como realizado sin foto final.
3. Al subir la foto:
   - Se guarda en `job-photos/{user_id}/{job_id}/final.jpg` → URL en `foto_final`.
   - Estado → `realizado`, `finalizado_at = now()`.
   - **Se envía automáticamente a Telegram** un mensaje con:
     - Cliente, dirección, hora de fin, importe, total (importe × cantidad).
     - La foto final adjunta.
   - Suma a ganancias del día/semana/mes.

## 8. Integración Telegram

- Se usa el conector Telegram de Lovable (no hay que pegar token de bot, solo conectarlo).
- En **Ajustes** pides una vez el **chat_id de destino** (el chat personal o grupo donde quieres recibir los avisos). Se guarda por usuario.
- Server function `sendJobUpdateToTelegram(jobId, fase: 'inicio' | 'final')`:
  - Lee el trabajo (RLS).
  - Descarga la foto del storage.
  - Llama al gateway de Telegram → `sendPhoto` con caption formateado.
- Mensajes en español, claros:

  **Inicio:**
  ```
  🟦 LLEGADA
  Cliente: Juan Pérez
  Dirección: Calle Mayor 12, 28013 Madrid
  Hora: 10:42
  Importe: 30 €
  ```

  **Final:**
  ```
  ✅ TRABAJO REALIZADO
  Cliente: Juan Pérez
  Dirección: Calle Mayor 12, 28013 Madrid
  Hora fin: 11:15
  Importe: 30 € × 2 = 60 €
  ```

## 9. Cancelaciones

Un solo botón **Cancelar** → modal con 4 motivos → guarda estado + motivo. (No requiere foto ni Telegram, salvo que lo quieras añadir.)

## 10. Historial y filtros

Día / semana / mes / cliente / ciudad / estado / tipo de servicio.

## 11. Diseño

Mobile-first, tarjetas grandes, colores por estado (verde realizado, ámbar pendiente, azul en proceso, rojo cancelado). Tokens en `src/styles.css`.

## 12. Stack técnico

- TanStack Start + React + Tailwind + shadcn/ui.
- TanStack Query + `createServerFn` con `requireSupabaseAuth`.
- Subida de fotos al bucket `job-photos` desde el cliente.
- Telegram vía connector gateway en server function.
- Estado enum en PostgreSQL, columna `total` generada.

---

### Lo que necesito para empezar a construir

1. **Confirmas Lovable Cloud + Telegram** como integraciones (te pediré conectar el Telegram cuando llegue el momento).
2. Después, en Ajustes pegarás el **chat_id** donde quieres recibir las fotos/avisos (te explico cómo obtenerlo).

¿Confirmas y empiezo?
