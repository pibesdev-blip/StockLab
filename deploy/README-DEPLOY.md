# Despliegue de StockLab en TEST (PibesDev)

## Datos de la app

| Dato | Valor |
|---|---|
| Tipo | C (frontend + backend + PostgreSQL) |
| Slug | `stocklab` |
| URL | https://server-dev.tail7a3e12.ts.net:9102 (solo por Tailscale) |
| PORT_WEB (Caddy, HTTPS) | `9102` |
| PORT_API (backend, solo `127.0.0.1`) | `5102` |
| Red propia | `10.201.2.0/24`, gateway `10.201.2.1` |
| Base y usuario | `stocklab_test` en `infrastructure-postgres-1` (red `infrastructure-db`) |
| Secretos de la base | `/srv/infrastructure/secrets/stocklab_test.env` (`DATABASE_URL`) |
| Código | `/srv/apps/stocklab/test` |
| Frontend publicado | `/var/www/stocklab/test/dist` |
| Carpeta de datos | no aplica (la app no guarda archivos) |

## Para el admin, antes del primer despliegue

1. **Carpetas y permisos** (reemplazar `<usuario>` por quien despliega):

   ```bash
   sudo mkdir -p /srv/apps/stocklab/test /var/www/stocklab/test
   sudo chown <usuario>:<usuario> /srv/apps/stocklab/test /var/www/stocklab/test
   # Caddy tiene que poder leer el frontend:
   sudo chmod 755 /var/www/stocklab /var/www/stocklab/test
   ```

2. **Base y usuario `stocklab_test`**. El usuario tiene que ser dueño de la base, porque
   `prisma migrate deploy` crea tablas en el esquema `public`:

   ```bash
   docker exec -it infrastructure-postgres-1 psql -U postgres -c "CREATE ROLE stocklab_test LOGIN PASSWORD '<contraseña>';"
   docker exec -it infrastructure-postgres-1 psql -U postgres -c "CREATE DATABASE stocklab_test OWNER stocklab_test;"
   ```

3. **Archivo de secretos** (legible por quien despliega, fuera del repo):

   ```bash
   # /srv/infrastructure/secrets/stocklab_test.env
   DATABASE_URL=postgresql://stocklab_test:<contraseña>@postgres:5432/stocklab_test?schema=public
   ```

   ```bash
   sudo chown root:<usuario> /srv/infrastructure/secrets/stocklab_test.env
   sudo chmod 640 /srv/infrastructure/secrets/stocklab_test.env
   ```

4. **Puertos**: confirmar la reserva de `9102`/`5102` en el documento 01 (Registro de apps),
   que hoy figura como "Solicitada". En la consulta inicial, el grep de `/etc/caddy/Caddyfile`
   no mostró `9101`, aunque Caddy lo escucha: revisar si hay sitios en archivos con `import`.
5. **Quién despliega**: la persona necesita acceso a Docker en el servidor.
6. **Después de la instalación**: agregar a Caddy el bloque que imprime `install`
   (también queda en `deploy/Caddyfile.stocklab.generated`), recargar Caddy y sumar la app
   a Homepage y a los backups.

## Primera instalación

```bash
cd /srv/apps/stocklab/test
git clone <URL-del-repo> .
cp deploy/server.env.example deploy/server.env
cp deploy/app.env.example deploy/app.env
chmod 600 deploy/server.env deploy/app.env
# Revisar deploy/server.env (ya trae los valores confirmados) y completar deploy/app.env.
./deploy/deploy.sh preflight
./deploy/deploy.sh install
```

`install` hace lo siguiente:

1. Construye la imagen `stocklab-api:<commit>`.
2. Revisa las migraciones pendientes y hace una copia de la base en `deploy/.state/db/`.
3. Aplica `prisma migrate deploy`.
4. Levanta la API y verifica `/api/health`.
5. Publica el frontend.
6. Imprime el bloque de Caddy, que hay que entregarle al admin.

**No ejecuta el seed** (`npm run db:seed`), porque borra datos.

Si `deploy.sh` no es ejecutable después de clonar: `chmod +x deploy/deploy.sh`.

## Operación diaria

```bash
cd /srv/apps/stocklab/test
git pull
./deploy/deploy.sh update      # copia de base + migraciones + API + frontend
./deploy/deploy.sh status      # contenedores, health, versiones y URL
./deploy/deploy.sh logs        # logs de la API en vivo (Ctrl+C para salir)
./deploy/deploy.sh rollback    # vuelve a la versión anterior
```

**Rollback:** vuelve a la imagen `previous` y a `dist.prev`. **Las migraciones de base NO se
revierten.** Si el esquema cambió de forma incompatible, la versión anterior puede fallar.
La copia previa a cada migración está en `deploy/.state/db/` (se guardan las 3 últimas) y la
restaura el admin.

Si `update` falla después de migrar, el script no revierte nada por su cuenta: muestra el
estado, los logs y las opciones (corregir y volver a ejecutar `update`, o `rollback`).

## Qué respaldar

- La base `stocklab_test`.
- `deploy/server.env` y `deploy/app.env`.
- No hay carpeta de datos: la app no guarda archivos.

## Migraciones compatibles

- Se crean en desarrollo con `npm run db:migrate` y se commitean en `server/prisma/migrations/`.
- En el servidor solo se aplica `prisma migrate deploy`. Nunca `migrate reset`, `db push` ni el seed.
- Para quitar o renombrar algo: **primero agregar** (columna nueva, código que use las dos),
  desplegar y **quitar en una versión posterior**. Así el rollback sigue funcionando.
- Si hay migraciones pendientes con `DROP TABLE/COLUMN`, `RENAME`, `TRUNCATE`, `DELETE FROM` o
  cambios de tipo, `deploy.sh` se detiene y pide confirmación. Sin terminal, se continúa con
  `ALLOW_DESTRUCTIVE_MIGRATIONS=si ./deploy/deploy.sh update` (solo después de revisarlas).

## Problemas comunes

| Síntoma | Solución |
|---|---|
| `Tu usuario no puede usar Docker` | Desplegar requiere autorización: pedíselo al admin. |
| `deploy/server.env tiene permisos 644` | `chmod 600 deploy/server.env deploy/app.env` |
| Un puerto aparece en uso o reservado en Caddy | Elegir otro par 91NN/51NN con el admin y actualizar `server.env`. |
| `SECRETS_FILE ... no es legible` | Pedile al admin que te dé permiso de lectura. |
| `/api/health` responde 503 | La base no responde: revisar `DATABASE_URL` y que `infrastructure-postgres-1` esté arriba. |
| La migración falla por permisos | El usuario `stocklab_test` tiene que ser dueño de la base (ver paso 2 del admin). |
| La web muestra un error de Caddy | El admin todavía no aplicó el bloque generado por `install`. |
| `install` dice que ya está instalado | Usar `./deploy/deploy.sh update`. |
