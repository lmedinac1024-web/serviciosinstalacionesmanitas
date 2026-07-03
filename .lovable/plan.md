
# Panel Admin Profesional en `/admin`

Añado una zona admin nueva bajo `/admin`, optimizada para escritorio, sin modificar la vista actual del empleado. La app sigue funcionando igual para empleados; los admin verán, al entrar, un layout distinto con sidebar y dashboard.

## 1. Rutas nuevas (todas bajo `_authenticated/admin/`)

Layout con sidebar fijo (solo admin) + subrutas:

- `/admin` → **Dashboard** (KPIs y gráficos)
- `/admin/obras` → **Tabla grande de obras** con filtros (fecha, empleado, estado, texto)
- `/admin/obras/nueva` → Crear obra (reutiliza formulario existente, con selector de empleado)
- `/admin/obras/$id` → Editar obra (todos los campos, fotos, historial)
- `/admin/empleados` → Gestión de empleados (reemplaza/absorbe la actual `admin.empleados` con vista tabla + activo/inactivo + ganancias por periodo)
- `/admin/clientes` → mueve la existente
- `/admin/telegram`, `/admin/roles`, `/admin/solicitudes` → se enlazan desde el sidebar (siguen existiendo tal cual)

Gate: layout `/_authenticated/admin/route.tsx` que redirige a `/` si no es admin. Empleados nunca ven `/admin`.

## 2. Vista empleado — sin cambios

No se toca `hoy.tsx`, `pendientes.tsx`, `trabajo.$id.tsx`, `trabajo.nuevo.tsx`, `AppShell`, `JobCard`, etc. El empleado sigue con el shell móvil actual. Solo se añade en su menú (si es admin) un enlace "Panel admin →" a `/admin`.

## 3. Dashboard `/admin`

Tarjetas KPI en grid (4 cols en desktop, 2 en tablet, 1 móvil):

- Obras hoy (total + desglose pendientes/en proceso/realizadas/canceladas)
- Ganancia hoy / semana (lunes-domingo) / mes actual / acumulada
- Total por empleado (tabla compacta: empleado, nº obras, ganancia periodo seleccionable)

Selector de rango arriba (hoy / semana / mes / todo). Cálculos client-side sobre `servicios` (filtrado por `eliminado_logico=false`, usando helpers `jobTotal`/`isPaid` ya existentes).

## 4. Tabla de obras `/admin/obras`

Tabla ancha con columnas: fecha, hora, referencia, cliente, tel, dirección (link maps), empleado, tipo, estado, importe+llegada, total, acciones (ver/editar/eliminar).

Filtros arriba: rango fechas, empleado (select), estado (multi), texto (cliente/dirección/referencia). Ordenable por fecha/importe/estado. Paginación simple.

Acciones por fila: editar → `/admin/obras/$id`, eliminar → soft delete (`eliminado_logico=true`) con motivo obligatorio (usa el trigger existente `guard_anulacion_servicio`).

Botón "Nueva obra" arriba → `/admin/obras/nueva`.

## 5. Editar obra `/admin/obras/$id`

Form con TODOS los campos (admin puede tocar precios, dirección, empleado, fecha/hora, estado, notas, motivo). Sección de fotos: muestra fotos de inicio/durante/final desde bucket `job-photos` (URLs firmadas). Historial de cambios de estado si existen columnas de auditoría.

Cambios de estado desde el admin: cualquier transición permitida (los triggers `guard_servicios_field_tamper` solo aplican a no-admin).

## 6. Gestión de empleados `/admin/empleados`

Rehago la actual como tabla desktop-friendly:

- Columnas: usuario, nombre, roles (badges), contraseña (ojo mostrar/ocultar, ya existe), obras asignadas (count), ganancia mes, activo/inactivo, acciones (reset pw, editar, borrar).
- **Activar/desactivar**: nuevo campo `profiles.activo` (boolean, default true). Empleado inactivo no puede iniciar sesión (lo bloqueamos en `_authenticated/route.tsx` sin tocar el flujo actual: solo si `activo=false` → signOut + redirect). Migración añade columna.
- Vista detalle empleado (modal o `/admin/empleados/$id`): lista de obras asignadas + ganancias por día/semana/mes.

## 7. Permisos (ya casi todo cubierto)

- Layout `/admin` gate con `useUserRole().isAdmin`, redirect a `/` si no.
- RLS actual ya impide a empleados borrar/cambiar precios (trigger `guard_servicios_field_tamper`). No hace falta tocar SQL de servicios.
- Empleados: se les quita del menú cualquier enlace admin (ya está así) y no aparece "Panel admin".

## 8. Logo roto arriba a la izquierda

Reviso `AppShell` — el import de `@/assets/logo-manitas.png` probablemente falla por el `.asset.json` sin binario. Lo sustituyo por texto/marca o regenero un logo con `imagegen`. Aplica a AppShell (empleado) y nuevo AdminShell.

## 9. Cambios de BD (una sola migración)

```sql
ALTER TABLE public.profiles ADD COLUMN activo boolean NOT NULL DEFAULT true;
```

Sin cambios de RLS/policies. Nada más.

## Detalles técnicos

- **Componentes nuevos**: `AdminShell` (sidebar shadcn colapsable + header), `KpiCard`, `ObrasTable`, `EmpleadosTable`, `RangoSelector`, `AsignarEmpleadoSelect`.
- **Sidebar** con enlaces: Dashboard, Obras, Empleados, Clientes, Telegram, Roles, Solicitudes. Usa el patrón shadcn-sidebar con `collapsible="icon"` y `SidebarTrigger` en header.
- **Queries**: TanStack Query, keys `["admin","obras",filtros]`, `["admin","dashboard",rango]`, `["admin","empleados"]`.
- **Server fns nuevos** en `src/lib/admin.functions.ts`:
  - `adminListObras(filters)` — usa `requireSupabaseAuth`, valida admin, devuelve servicios + join empleado/cliente.
  - `adminUpsertObra(data)` — crear/editar completo.
  - `adminSoftDeleteObra({id, motivo})` — set `eliminado_logico=true`.
  - `adminToggleEmpleadoActivo({userId, activo})`.
  - `adminEmpleadoStats({userId, desde, hasta})`.
- **Reutilización**: `jobTotal`, `isPaid`, `STATUS_LABELS`, `CANCEL_REASONS`, `formatEUR` ya existen en `src/lib/jobs.ts`.
- **Empleado desactivado**: check en `_authenticated/route.tsx` — si `profiles.activo === false`, `supabase.auth.signOut()` + redirect a `/auth?blocked=1`.

## Fuera de alcance (no incluido)

- Gráficos avanzados (solo KPIs numéricos). Puedo añadir después con recharts si se pide.
- Exportar CSV/Excel.
- Auditoría/historial completo de cambios (solo lo que ya guarda la BD).
