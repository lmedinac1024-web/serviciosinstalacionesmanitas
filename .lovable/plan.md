# Plan — Importar orden desde imagen en "Nuevo servicio"

Se conserva la app, el formulario actual, Supabase, Vercel y el flujo de creación. Sólo se **añade** un bloque encima del formulario y se **amplían** campos y roles.

## 1. Base de datos (una sola migración)

Añadir a `public.servicios` los campos que faltan (los que ya existen no se tocan):

- `numero text` (número de calle, separado de `direccion`)
- `direccion_completa text`
- `telefonos_extra text` (uno o varios, separados por coma)
- `hora_inicio time` (franja inicio; `hora_programada` sigue siendo la hora principal — se rellena con hora_inicio si viene franja)
- `numero_operacion text`
- `numero_servicio text`
- `imagen_original_url text`
- `texto_ocr_original text`
- `creado_por uuid` (autor de la creación)

Enum de roles: añadir valor `'supervisor'` a `app_role` (mantiene admin, super_admin, empleado).

Ajustes de reglas:
- Los supervisores tienen los mismos permisos que admin para: crear servicios, importar imagen, anular. Se actualizan `guard_servicios_field_tamper`, `guard_anulacion_servicio`, `admin_list_employee_passwords` y las policies afectadas para reconocer `supervisor` como equivalente a admin en esas acciones.
- Los empleados (trabajadores) no ganan permisos nuevos.

Storage: crear bucket **privado** `ordenes-imagenes` con policies para que admin/super_admin/supervisor puedan subir y leer. La URL guardada en `imagen_original_url` será una URL firmada (o el path) creada al subir.

## 2. Server function de OCR + parseo (IA Lovable)

Nuevo archivo `src/lib/ocr-orden.functions.ts`:

- `createServerFn({ method: "POST" })` protegido con `requireSupabaseAuth` + comprobación de rol admin/super_admin/supervisor.
- Recibe `{ imagenBase64, mime }`.
- Llama al AI Gateway con `google/gemini-3-flash-preview` (multimodal: image + prompt) pidiendo un JSON estricto con los campos:
  `nombre_cliente, telefono, telefonos_extra[], direccion, numero, piso, puerta, codigo_postal, ciudad, direccion_completa, fecha_servicio, hora_servicio, hora_inicio, hora_fin, fecha_asignacion, tipo_servicio, observaciones, trabajador_nombre, precio_servicio, precio_llegada, numero_operacion, numero_servicio, texto_ocr_original`.
- El prompt incluye las reglas del usuario (tipos de servicio por keywords, formatos de dirección, fechas, franjas, filtrado de observaciones, dedupe de teléfonos, CP con 0 delante, etc.).
- Devuelve `{ campos, aviso_cp?, texto_ocr }`.

Post-proceso en el servidor:
- Aplicar regla de fecha (servicio > asignación+1 > mañana).
- Buscar `trabajador_id` en `profiles` + `user_roles` por coincidencia (case-insensitive, sin acentos) con `display_name`/`username` de usuarios con rol `empleado`.
- Corregir CP a 5 dígitos.
- Devolver `trabajador_id | null` y `aviso_trabajador` cuando no haya match.

## 3. UI — pantalla "Nuevo servicio" (`src/routes/_authenticated/trabajo.nuevo.tsx`)

Cambios visibles (sin romper lo existente):

- **Bloque nuevo arriba** (visible sólo si rol admin/super_admin/supervisor): "Importar orden desde imagen" con dos botones:
  - "Tomar foto" → `<input type="file" accept="image/*" capture="environment">`
  - "Cargar imagen" → `<input type="file" accept="image/*">`
  - Al elegir imagen: vista previa + botones "Leer orden" y "Cancelar".
  - "Leer orden": sube imagen al bucket, llama a la server fn, y rellena el formulario. Muestra spinner y toasts de avisos (CP corregido, cliente sin nombre, trabajador no encontrado).

- **Formulario existente ampliado**:
  - Nuevo campo "Número" (separado de "Dirección").
  - Textarea "Teléfonos extra" (opcional).
  - Etiqueta del select de empleado cambia a "Asignar trabajador".
  - Etiqueta observaciones cambia a "Observaciones / reparación".
  - Se muestran "Nº operación" y "Nº servicio" (opcionales) sólo cuando vienen rellenados por la importación.
  - Cuando hay franja: se muestran `hora_inicio` y `hora_fin` además de `hora`.

- **Guardado**: mismo submit, se añaden los campos nuevos al insert (`numero`, `direccion_completa`, `telefonos_extra`, `hora_inicio`, `numero_operacion`, `numero_servicio`, `imagen_original_url`, `texto_ocr_original`, `creado_por`). Reglas de obligatoriedad tal como pide el usuario.

- **Guard de acceso**: `me.isAdmin` se sustituye por "admin || super_admin || supervisor" (nuevo helper en `useUserRole`).

## 4. Servicios pendientes del trabajador y estados

Se documenta como **fuera del alcance de este cambio** salvo lo mínimo:
- Se garantiza que la tarjeta actual muestra la franja `hora_inicio - hora_fin` cuando existe.
- El resto (ordenar por distancia GPS actual del trabajador, botones Llegué/Finalizar/Cancelar con motivos, reglas de ganancias) ya existe en la app; no se rehace. Si el usuario detecta que falta alguna pieza concreta, la abordamos en un plan separado.

## 5. Detalles técnicos

- Se usa el AI Gateway existente (`LOVABLE_API_KEY` ya está configurado) con `google/gemini-3-flash-preview` pasando la imagen como `image_url` con data-URL base64.
- El bucket `ordenes-imagenes` es privado; la subida se hace desde el cliente autenticado con el path `{userId}/{uuid}.{ext}`; se guarda el path (no URL pública).
- Roles: se añade `supervisor` al enum y se propaga a policies/triggers/`has_role`. No se toca la lógica de empleado.
- No se toca: `client.ts`, `auth-middleware.ts`, `types.ts` (se regenera solo tras la migración), estructura de rutas, PWA.

## 6. Archivos que se editan o crean

- Migración SQL (una sola).
- `src/lib/ocr-orden.functions.ts` (nuevo).
- `src/routes/_authenticated/trabajo.nuevo.tsx` (edición).
- `src/hooks/useUserRole.ts` (añadir `isSupervisor`, `canManage`).
- `src/lib/jobs.ts` si se necesita ampliar tipos.
- `src/components/JobCard.tsx` para mostrar franja horaria (edición mínima).

¿Apruebas el plan para que lo implemente?
