# Rediseño: Órdenes de trabajo con servicio (categoría) + validación GPS

## Modelo conceptual

**Orden de trabajo** (lo que hoy es `jobs`) contiene:
- Datos del cliente: nombre, teléfono, dirección, CP, ciudad
- **Servicio** (categoría): desplegable con Manitas, Fontanería, Instalación de Ventilador… (gestionable en admin)
- **Observaciones**: texto libre con lo que pide el cliente
- Empleado asignado
- Fecha + hora
- **Precio completo** (si se realiza)
- **Precio por llegada** (si valida GPS pero se cancela)

## Panel admin (simplificado)

Menú lateral queda con:
- Dashboard
- **Servicios** (=lista de órdenes, crear/editar) ← reemplaza "trabajo/nuevo" y "clientes"
- **Categorías** (renombrado del actual "servicios"; solo Manitas/Fontanería/etc.)
- Empleados
- Destinos Telegram

Se **quita del menú** la pestaña "Clientes" (los datos del cliente se rellenan en la propia orden). También se retira "tarifas por empleado" — el precio lo fija el admin en cada orden. Archivos existentes quedan sin enlazar por si quieres recuperarlos más tarde.

## Formulario "Nueva orden" (admin)

Campos, en este orden:
1. Fecha + hora
2. Empleado (select)
3. Servicio/Categoría (select: Manitas, Fontanería, Ventilador…)
4. Cliente: nombre, teléfono
5. Dirección + CP + ciudad → al guardar geocodifico con Google Maps
6. Observaciones (textarea grande)
7. Precio completo (€)
8. Precio por llegada (€, opcional; default 0)

## Empleado en calle (`/hoy`)

- Lista **ordenada por hora asc** del día del empleado logueado.
- Tarjeta muestra: hora, nombre cliente, categoría, dirección.
- Toco la tarjeta → detalle con acciones:
  - **Mapa** (Google Maps con la dirección)
  - **Llamar**
  - **WhatsApp**
  - **Cancelar** (con motivo)
  - **Llegué** → valida GPS 100m → pide foto → envía Telegram
  - **Finalizar** → foto final → envía Telegram

## Validación GPS 100m

- Al crear/editar orden en admin: geocodifico `dirección, CP, ciudad` con Google Maps y guardo `lat/lng` en la orden. Si falla, aviso pero permito guardar (esa orden no validará distancia).
- Al pulsar **Llegué**:
  1. `navigator.geolocation.getCurrentPosition`
  2. Distancia haversine al `lat/lng` de la orden
  3. ≤100m → `llegada_validada=true`, sigo con foto+Telegram
  4. >100m → alerta con distancia real, bloqueo hasta acercarse
  5. Sin GPS guardado → acepta sin validar

## Cálculo de ganancias por empleado

Para cada orden:
- `realizado` → cobra `precio_completo`
- `cancelado_*` con `llegada_validada=true` → cobra `precio_llegada`
- resto → 0

Pantalla "Ganancias" (ya existe) usa esta lógica y agrupa por día/empleado.

## Cambios técnicos

### DB (una sola migración)
Añadir a `jobs`:
- `lat numeric(10,7)`, `lng numeric(10,7)` — coordenadas de la dirección
- `precio_llegada numeric(10,2) DEFAULT 0`
- `llegada_validada boolean DEFAULT false`
- `llegada_lat`, `llegada_lng`, `llegada_distancia_m` — registro real del móvil
- `servicio_id uuid REFERENCES servicios(id)` — categoría
- `observaciones text`

### Google Maps
- Conectar el connector **Google Maps Platform** (te abro el diálogo al aprobar).
- Server fn `geocodeAddress(direccion, cp, ciudad)` que llama al gateway `/maps/api/geocode/json`.

### Frontend
- **Nuevo**: `src/routes/_authenticated/admin.ordenes.tsx` (lista + botón nueva) y `admin.ordenes.nueva.tsx` (formulario unificado).
- **Modificar**: `hoy.tsx` ordenar por hora asc y mostrar categoría.
- **Modificar**: `trabajo.$id.tsx` — botón Llegué con validación GPS.
- **Modificar**: `AppShell.tsx` — nuevo menú admin.
- **Modificar**: `ganancias.tsx` — lógica de cobro por llegada.
- **Renombrar en UI**: pestaña "Servicios" del admin actual pasa a llamarse "Categorías" (mismo archivo, solo texto).

### Lo que NO cambia
- Fotos + Telegram al llegar/finalizar (ya funciona).
- PWA/offline.
- Auth y roles.

## Qué necesito al aprobar
1. Aprobar la migración de base de datos.
2. Conectar el connector Google Maps Platform (te abro el diálogo).
