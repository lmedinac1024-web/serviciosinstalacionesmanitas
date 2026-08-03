# Field Job Manager

Quiero crear una aplicación profesional para gestionar mis trabajos diarios.

La app debe servirme para controlar todos los trabajos que realizo cada día, saber dónde tengo que ir, guardar los datos de cada trabajo y llevar el control de lo que estoy ganando.

No quiero una app genérica tipo CRM. Quiero una app sencilla, rápida y práctica para un trabajador que recibe órdenes de trabajo, va a diferentes direcciones, realiza el servicio, guarda fotos y controla sus ganancias.

La app debe funcionar bien en móvil y también en ordenador.

Funciones principales:

Pantalla principal / Dashboard

Quiero ver de forma clara:

Trabajos pendientes de hoy.

Trabajos realizados hoy.

Trabajos cancelados.

Dinero ganado hoy.

Dinero ganado esta semana.

Dinero ganado este mes.

Total acumulado.

Número total de trabajos realizados.

Número de trabajos pendientes.

Gestión de trabajos

Cada trabajo debe tener estos datos:

ID del trabajo.

Fecha.

Hora.

Cliente.

Tipo de trabajo o servicio.

Dirección.

Piso.

Puerta.

Código postal.

Ciudad.

Teléfono.

Estado del trabajo.

Precio / importe.

Cantidad de trabajos, porque algunos trabajos pueden contar por 1 y otros por 2.

Observaciones.

Foto de inicio.

Foto final.

Fecha de creación.

Fecha de finalización.

Estados posibles:

Pendiente.

En proceso.

Realizado.

Cancelado por cliente.

Cancelado porque no estaba en casa.

Cancelado por dirección incorrecta.

Cancelado por otro motivo.

Vista de trabajos pendientes

Quiero una pantalla donde vea solo los trabajos pendientes.

Debe mostrar:

Hora.

Cliente.

Dirección.

Ciudad.

Teléfono.

Estado.

Importe.

Debe estar ordenado por fecha y hora.

Detalle de cada trabajo

Al abrir un trabajo quiero ver toda la información clara:

Cliente.

Dirección completa.

Piso.

Puerta.

Código postal.

Ciudad.

Teléfono.

Tipo de trabajo.

Precio.

Estado.

Observaciones.

Fotos.

Dentro del detalle quiero botones rápidos:

Llamar al cliente.

Abrir WhatsApp.

Abrir Google Maps con la dirección.

Marcar como iniciado.

Subir foto de inicio.

Subir foto final.

Marcar como realizado.

Cancelar trabajo.

Botón de mapa

La app debe tener un botón que abra Google Maps directamente con la dirección del trabajo.

La dirección debe formarse con:

Dirección.

Código postal.

Ciudad.

Si también hay piso y puerta, deben mostrarse en el detalle del trabajo, pero no deben romper la búsqueda del mapa.

Control de ganancias

La app debe calcular automáticamente:

Lo ganado hoy.

Lo ganado esta semana.

Lo ganado este mes.

Lo ganado en total.

Total de trabajos realizados hoy.

Total de trabajos realizados en la semana.

Total de trabajos realizados en el mes.

Importante:

Algunos trabajos pueden contar por 2. Por eso necesito un campo llamado “Cantidad” o “Cuenta_x2”, para que el cálculo pueda sumar correctamente.

Ejemplo:

Si un trabajo vale 30 € y cuenta por 2, debe sumar 60 €.
Si un trabajo vale 30 € y cuenta por 1, debe sumar 30 €.

Historial de trabajos

Quiero una pantalla para ver todos los trabajos realizados.

Debe poder filtrarse por:

Día.

Semana.

Mes.

Cliente.

Ciudad.

Estado.

Tipo de trabajo.

Cancelaciones

Quiero un solo botón de cancelar.

Al pulsarlo debe dejarme elegir el motivo:

Cliente cancela.

No estaba en casa.

Dirección incorrecta.

Otro motivo.

Después debe guardar el trabajo como cancelado y guardar el motivo.

Fotos

Cada trabajo debe permitir guardar:

Foto de inicio.

Foto final.

Las fotos deben quedar guardadas dentro del trabajo correspondiente.

Diseño

Quiero una app muy clara y fácil de usar.

Pantallas necesarias:

Dashboard principal.

Trabajos pendientes.

Trabajos de hoy.

Detalle del trabajo.

Trabajos realizados.

Trabajos cancelados.

Ganancias.

Historial.

Ajustes.

El diseño debe ser limpio, profesional y rápido para usar en el móvil.

Base de datos

Quiero que la app pueda trabajar con Google Sheets, porque actualmente uso una hoja de cálculo.

La tabla principal se puede llamar:

BD_TRABAJOS

Columnas recomendadas:

ID_Trabajo

Fecha

Hora

Cliente

Servicio

Dirección

Piso

Puerta

Código_Postal

Ciudad

Teléfono

Estado

Motivo_Cancelación

Importe

Cantidad

Total

Foto_Inicio

Foto_Final

Observaciones

Fecha_Creación

Fecha_Finalización

El campo Total debe calcularse así:

Importe x Cantidad

Importante

Antes de crear la app, quiero que me propongas:

La estructura de la base de datos.

Las pantallas.

Los botones.

Los cálculos.

El flujo completo desde que recibo un trabajo hasta que lo marco como realizado.

Cómo abrir la dirección en Google Maps.

Cómo calcular las ganancias diarias, semanales, mensuales y totales.

No quiero una demo visual sin funciones. Quiero una app real para trabajar todos los días.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://serviciosinstalacionesmanitas.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/0ed288ed-416c-48b0-bfd3-1470a8e6c7cf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
