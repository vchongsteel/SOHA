# SOHA · Salud Ocupacional STEEL e IEM

Sistema Angular y Node para personal, catálogo EPP, inventario separado por empresa, capacitaciones y avisos de vencimiento dentro de la aplicación.

## Desarrollo

Node 26. En frontend: `npm ci` y `npm start`. En backend: `npm start`. La interfaz local abre en http://127.0.0.1:4200 y usa el proxy local para la API.

## Railway

El Dockerfile compila Angular y sirve interfaz y API desde el mismo dominio. Configurar un único servicio con volumen persistente montado en `/data`, una réplica y estas variables:

- `DB_PATH=/data/soha.sqlite`
- `BACKUP_DIR=/data/respaldos`
- `APP_URL=https://DOMINIO-DEL-SERVICIO`
- `HOST=0.0.0.0`
- `NODE_ENV=production`

Railway proporciona PORT. La comprobación de disponibilidad es `/api/health`. Las cookies de producción son HttpOnly, SameSite=Strict y Secure. La API limita el origen a APP_URL. La configuración inicial de administrador está deshabilitada en producción: preparar e importar la base con su administrador antes de abrir el sistema al público. No hay contraseñas predeterminadas.

La infraestructura se define en `.railway/railway.ts`, incluyendo el origen GitHub y el volumen existente. Desde la raíz: `npm ci`, `npm run infra:plan` y, después de revisar que no hay eliminaciones, `npm run infra:apply`. Las variables permanecen gestionadas en Railway y no se incorporan al archivo. Un push a main despliega el código; los cambios de infraestructura requieren revisar y aplicar el plan.

La base, sesiones, contraseñas, archivos de personal, importaciones y respaldos no pertenecen al repositorio. La transferencia inicial utiliza una copia consistente y privada, sin sesiones abiertas. Nunca sustituir una base activa por una copia local durante una actualización.

## Respaldos

Ejecutar `npm run respaldo` dentro de backend. La copia se valida con SQLite. Conservar también una copia fuera del volumen y el directorio de imágenes. El repositorio y el contenedor no contienen respaldos de personal.

## Validación

Dentro de backend: `npm test`. Las pruebas crean bases temporales y no modifican el personal real. Los saldos pendientes de carga se distinguen de una existencia confirmada de cero. Antes de registrar movimientos de un artículo debe definirse su unidad.
