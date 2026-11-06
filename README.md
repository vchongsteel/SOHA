# SOHA · Salud Ocupacional STEEL e IEM

Sistema Angular y Node para personal, catálogo EPP, inventario separado por empresa, capacitaciones y avisos de vencimiento dentro de la aplicación.

## Desarrollo

Node 26. En frontend: `npm ci` y `npm start`. En backend: `npm start`. La interfaz local abre en http://127.0.0.1:4200 y usa el proxy local para la API.

## Railway

El Dockerfile compila Angular y sirve interfaz y API desde el mismo dominio. La base de producción es PostgreSQL, en un servicio separado dentro del proyecto SOHA. El backend conecta por la red privada de Railway. El servicio web conserva su volumen `/data` para imágenes y respaldos y usa una réplica. Variables:

- `DATABASE_URL=${{Postgres.DATABASE_URL}}`
- `BACKUP_DIR=/data/respaldos`
- `APP_URL=https://DOMINIO-DEL-SERVICIO`
- `HOST=0.0.0.0`
- `NODE_ENV=production`

Railway proporciona PORT. La comprobación de disponibilidad es `/api/health`. Las cookies de producción son HttpOnly, SameSite=Strict y Secure. La API limita el origen a APP_URL. La configuración inicial de administrador está deshabilitada en producción: preparar e importar la base con su administrador antes de abrir el sistema al público. No hay contraseñas predeterminadas.

La infraestructura se define en `.railway/railway.ts`, incluyendo GitHub, PostgreSQL y los volúmenes existentes. Desde la raíz: `npm ci`, `npm run infra:plan` y, después de revisar que no hay eliminaciones, `npm run infra:apply`. Las variables permanecen gestionadas en Railway y no se incorporan al archivo. Un push a main despliega el código; los cambios de infraestructura requieren revisar y aplicar el plan. La base puede consultarse en Railway > SOHA > Postgres > Database > Data. No necesita un puerto público para funcionar.

La base, sesiones, contraseñas, archivos de personal, importaciones y respaldos no pertenecen al repositorio. La transferencia inicial utiliza una copia consistente y privada, sin sesiones abiertas. Nunca sustituir una base activa por una copia local durante una actualización.

## Respaldos

Ejecutar `npm run respaldo` dentro de backend, con las variables de producción, para crear una copia lógica comprimida de PostgreSQL. Usa una transacción de lectura consistente y verifica SHA-256. Al arrancar en producción se crea una copia por día, si todavía no existe; esto no equivale a una tarea programada diaria. Conservar también una copia fuera del volumen y el directorio de imágenes. Sin DATABASE_URL, la herramienta sigue respaldando SQLite local. El repositorio y el contenedor no contienen respaldos de personal.

## Migración SQLite a PostgreSQL

En el primer arranque, `MIGRATE_FROM_SQLITE=/data/soha.sqlite` habilita la transferencia desde la base del volumen. Primero crea una copia consistente, verifica integridad y referencias y transfiere todas las tablas en una sola transacción. Compara cantidades y hashes de filas, conservando identificadores, contraseñas scrypt, sesiones, metadatos de importación y orden del historial. No modifica el archivo SQLite. Si el destino contiene datos y no tiene la marca de migración, cancela sin sobrescribirlo. La marca `sqlite-a-postgresql-v1` impide reimportaciones posteriores. Retirar la variable de migración tras verificar el despliegue.

SQLite se conserva como respaldo del momento de migración; no se sincroniza con PostgreSQL. Después de nuevas escrituras en PostgreSQL, volver a SQLite requiere migrar esos cambios para no perderlos. El desarrollo local continúa usando SQLite si no se configura DATABASE_URL.

## Validación

Dentro de backend: `npm ci` y `npm test`. Las pruebas crean bases temporales y no modifican el personal real. Con SOHA_TEST_DATABASE_URL ejecutan las mismas operaciones en esquemas PostgreSQL temporales de nombre aleatorio, eliminados al terminar. `node validar-postgresql.mjs` permite ejecutarlas en Railway usando DATABASE_URL por su red privada; no activa la migración de producción. También verifica migración, respaldos e inventario concurrente. Los saldos pendientes de carga se distinguen de una existencia confirmada de cero. Antes de registrar movimientos de un artículo debe definirse su unidad.

## Registro de usuarios

En Acceso, el enlace Registrate abre una solicitud pública de acceso. No crea una sesión ni permite elegir permisos. Un administrador la atiende desde Usuarios > Solicitudes de registro y asigna el permiso al aprobar. Registrar usuario dentro de Administración sigue permitiendo crear directamente una cuenta. Las contraseñas se guardan con scrypt; nunca se devuelven en las listas de solicitudes.
