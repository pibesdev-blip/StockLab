#!/usr/bin/env bash
# Despliegue de la app en el servidor TEST de PibesDev.
# Uso: ./deploy/deploy.sh {preflight|install|update|rollback|status|logs}
# Guía completa: deploy/README-DEPLOY.md
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SERVER_ENV="deploy/server.env"
APP_ENV="deploy/app.env"
COMPOSE_FILE="deploy/compose.test.yaml"
STATE_DIR="deploy/.state"
DB_BACKUP_DIR="$STATE_DIR/db"
CADDY_FILE="/etc/caddy/Caddyfile"
NODE_IMAGE="node:24-bookworm-slim"
PG_IMAGE="postgres:18"

# ----------------------------------------------------------------------------
# Utilidades
# ----------------------------------------------------------------------------
info() { printf '\n==> %s\n' "$*"; }
warn() { printf 'AVISO: %s\n' "$*" >&2; }
die() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

load_env() {
  if [[ ! -f "$SERVER_ENV" ]]; then
    die "No existe $SERVER_ENV. Crealo desde la plantilla:
    cp deploy/server.env.example deploy/server.env
    chmod 600 deploy/server.env
y revisá que los valores coincidan con lo confirmado por el admin."
  fi
  set -a
  # shellcheck source=/dev/null
  source "$SERVER_ENV"
  set +a
  SLUG="${SLUG:-}" APP_TYPE="${APP_TYPE:-}" PORT_WEB="${PORT_WEB:-}" PORT_API="${PORT_API:-}"
  WEB_ROOT="${WEB_ROOT:-}" DATA_DIR="${DATA_DIR:-}" DB_NAME="${DB_NAME:-}"
  SECRETS_FILE="${SECRETS_FILE:-}" APP_SUBNET="${APP_SUBNET:-}" APP_GATEWAY="${APP_GATEWAY:-}"
  TS_HOST="${TS_HOST:-}" TS_IP="${TS_IP:-}"
  case "$APP_TYPE" in
    A|B|C|API) ;;
    *) die "APP_TYPE='$APP_TYPE' no es válido en $SERVER_ENV (A, B, C o API)." ;;
  esac
}

has_backend() { [[ "$APP_TYPE" != "A" ]]; }
has_frontend() { [[ "$APP_TYPE" != "API" ]]; }
has_db() { [[ "$APP_TYPE" == "C" ]]; }

dc() {
  docker compose -p "${SLUG}-test" -f "$COMPOSE_FILE" --env-file "$SERVER_ENV" "$@"
}

read_state() { if [[ -f "$STATE_DIR/$1" ]]; then cat "$STATE_DIR/$1"; fi; }
write_state() { mkdir -p "$STATE_DIR"; printf '%s\n' "$2" > "$STATE_DIR/$1"; }

app_url() { printf 'https://%s:%s' "$TS_HOST" "$PORT_WEB"; }

confirm() {
  # Pide confirmación solo si hay terminal; sin terminal no se continúa.
  local answer
  [[ -t 0 ]] || return 1
  read -r -p "$1 [s/N] " answer
  [[ "$answer" =~ ^[sS]$ ]]
}

health_check() {
  # Reintenta /api/health durante ~60 s.
  local _
  for _ in $(seq 1 20); do
    if curl -fsS --max-time 5 "http://127.0.0.1:${PORT_API}/api/health" > /dev/null 2>&1; then
      return 0
    fi
    sleep 3
  done
  return 1
}

# ----------------------------------------------------------------------------
# preflight
# ----------------------------------------------------------------------------
PF_ERRORS=0
pf_ok() { printf '  [OK]    %s\n' "$1"; }
pf_warn() { printf '  [AVISO] %s\n          -> %s\n' "$1" "$2"; }
pf_error() { printf '  [ERROR] %s\n          -> %s\n' "$1" "$2"; PF_ERRORS=$((PF_ERRORS + 1)); }

check_secret_file_perms() {
  local file="$1" example="$2" mode
  if [[ ! -f "$file" ]]; then
    pf_error "Falta $file" "cp $example $file && chmod 600 $file  (y completalo)"
    return
  fi
  mode="$(stat -c '%a' "$file")"
  if [[ "$mode" == "600" ]]; then
    pf_ok "$file existe con permisos 600"
  else
    pf_error "$file tiene permisos $mode" "chmod 600 $file"
  fi
}

# Contenedores de esta misma app (proyecto compose ${SLUG}-test) que publican el puerto.
port_used_by_this_app() {
  docker ps --filter "label=com.docker.compose.project=${SLUG}-test" --format '{{.Ports}}' 2> /dev/null \
    | grep -qE "(^|[ ,])127\.0\.0\.1:$1->"
}

# Imprime el rango "inicio fin" de líneas del bloque de Caddy cuyo sitio usa :PORT_WEB.
caddy_block_range() {
  awk -v port="$PORT_WEB" '
    start == 0 && $0 ~ ":" port "([^0-9]|$)" && $0 ~ /\{[[:space:]]*$/ && $0 !~ /^[[:space:]]*#/ {
      start = NR; depth = 0
    }
    start > 0 {
      line = $0; sub(/#.*/, "", line)
      depth += gsub(/\{/, "{", line) - gsub(/\}/, "}", line)
      if (depth <= 0) { print start, NR; exit }
    }' "$CADDY_FILE"
}

check_caddy_ports() {
  local ports=("$PORT_WEB") matches range start end block ours=1 n
  has_backend && ports+=("$PORT_API")
  if [[ ! -r "$CADDY_FILE" ]]; then
    pf_warn "No se puede leer $CADDY_FILE" "Pedile al admin que confirme que ${ports[*]} no están usados por otra app en Caddy"
    return
  fi
  matches="$(grep -nE ":($(IFS='|'; echo "${ports[*]}"))([^0-9]|\$)" "$CADDY_FILE" | grep -vE '^[0-9]+:[[:space:]]*#' || true)"
  if [[ -z "$matches" ]]; then
    pf_ok "Caddy no tiene reservados ${ports[*]}"
    return
  fi
  range="$(caddy_block_range || true)"
  if [[ -n "$range" ]]; then
    read -r start end <<< "$range"
    block="$(sed -n "${start},${end}p" "$CADDY_FILE")"
    if has_frontend; then
      grep -q "/var/www/${SLUG}/test" <<< "$block" || ours=0
    else
      grep -q "127.0.0.1:${PORT_API}" <<< "$block" || ours=0
    fi
    while IFS=: read -r n _; do
      ((n >= start && n <= end)) || ours=0
    done <<< "$matches"
  else
    ours=0
  fi
  if ((ours)); then
    pf_ok "Los puertos en Caddy pertenecen al bloque de esta app"
  else
    pf_error "Caddy ya usa ${ports[*]} en un bloque que no es de esta app" \
      "Elegí otro par de puertos con el admin. Líneas: $(tr '\n' ' ' <<< "$matches")"
  fi
}

check_port_free() {
  local port="$1" listeners others
  listeners="$(ss -ltnH 2> /dev/null | awk '{print $4}' | grep -E ":${port}\$" || true)"
  others="$(docker ps --format '{{.Label "com.docker.compose.project"}}|{{.Names}}|{{.Ports}}' 2> /dev/null \
    | grep -E "[:]${port}->" | grep -v "^${SLUG}-test|" || true)"
  if [[ -n "$others" ]]; then
    pf_error "El puerto $port lo publica otro contenedor" "$(cut -d'|' -f2 <<< "$others" | tr '\n' ' ')— elegí otro par con el admin"
  elif [[ -z "$listeners" ]]; then
    pf_ok "Puerto $port libre"
  elif [[ "$port" == "$PORT_API" ]] && port_used_by_this_app "$port"; then
    pf_ok "Puerto $port en uso por esta misma app ya desplegada"
  elif [[ "$port" == "$PORT_WEB" ]]; then
    # Lo atiende Caddy: se valida contra el Caddyfile.
    if [[ -r "$CADDY_FILE" ]]; then
      pf_ok "Puerto $port escuchado (se valida contra el Caddyfile)"
    elif [[ -f "$STATE_DIR/current" ]]; then
      pf_warn "Puerto $port en uso, probablemente por el bloque de Caddy de esta app" "Confirmalo con el admin"
    else
      pf_error "Puerto $port en uso" "Elegí otro par de puertos con el admin"
    fi
  else
    pf_error "Puerto $port en uso por otro proceso" "Elegí otro par de puertos con el admin"
  fi
}

ip_to_int() {
  local a b c d
  IFS=. read -r a b c d <<< "$1"
  echo $(((a << 24) + (b << 16) + (c << 8) + d))
}

cidr_bounds() {
  local ip="${1%/*}" bits="${1#*/}" base mask
  base="$(ip_to_int "$ip")"
  mask=$(((0xFFFFFFFF << (32 - bits)) & 0xFFFFFFFF))
  echo "$((base & mask)) $(((base & mask) | (~mask & 0xFFFFFFFF)))"
}

check_subnet() {
  local own="${SLUG}-test_default" s e net subnet ns ne overlaps=""
  if [[ ! "$APP_SUBNET" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}/[0-9]{1,2}$ ]]; then
    pf_error "APP_SUBNET='$APP_SUBNET' no es un CIDR IPv4" "Usá 10.201.NN.0/24"
    return
  fi
  read -r s e <<< "$(cidr_bounds "$APP_SUBNET")"
  while read -r net; do
    [[ -z "$net" || "$net" == "$own" ]] && continue
    for subnet in $(docker network inspect -f '{{range .IPAM.Config}}{{.Subnet}} {{end}}' "$net" 2> /dev/null); do
      [[ "$subnet" == *:* ]] && continue
      read -r ns ne <<< "$(cidr_bounds "$subnet")"
      if ((s <= ne && ns <= e)); then overlaps+="$net ($subnet) "; fi
    done
  done < <(docker network ls --format '{{.Name}}' 2> /dev/null)
  if [[ -n "$overlaps" ]]; then
    pf_error "APP_SUBNET $APP_SUBNET se superpone con: $overlaps" "Elegí otra subred 10.201.NN.0/24 libre"
  else
    pf_ok "APP_SUBNET $APP_SUBNET no se superpone con redes Docker existentes"
  fi
}

cmd_preflight() {
  PF_ERRORS=0
  info "Preflight de ${SLUG:-?} (tipo $APP_TYPE) en $(hostname)"

  check_secret_file_perms "$SERVER_ENV" "deploy/server.env.example"
  has_backend && check_secret_file_perms "$APP_ENV" "deploy/app.env.example"

  if [[ "$SLUG" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
    pf_ok "SLUG '$SLUG' válido"
  else
    pf_error "SLUG '$SLUG' inválido" "Solo minúsculas, números y guiones (ej. mi-sistema)"
  fi
  if has_db; then
    local expected_db="${SLUG//-/_}_test"
    if [[ "$DB_NAME" == "$expected_db" ]]; then
      pf_ok "DB_NAME '$DB_NAME' coincide con el slug"
    else
      pf_error "DB_NAME '$DB_NAME' no coincide con el slug" "Debe ser '$expected_db'"
    fi
  fi

  local docker_ok=0
  if ! command -v docker > /dev/null 2>&1; then
    pf_error "docker no está instalado o no está en el PATH" "Desplegar requiere autorización; pedíselo al admin"
  elif ! docker info > /dev/null 2>&1; then
    pf_error "Tu usuario no puede usar Docker" "Desplegar requiere autorización; pedíselo al admin"
  elif ! docker compose version > /dev/null 2>&1; then
    pf_error "docker compose v2 no disponible" "Pedile al admin que instale el plugin de Docker Compose"
  else
    pf_ok "docker y docker compose disponibles"
    docker_ok=1
  fi

  local ports_ok=1
  if [[ ! "$PORT_WEB" =~ ^91(0[1-9]|[1-9][0-9])$ ]]; then
    pf_error "PORT_WEB=$PORT_WEB fuera de rango" "Debe estar entre 9101 y 9199"
    ports_ok=0
  fi
  if has_backend && [[ ! "$PORT_API" =~ ^51(0[1-9]|[1-9][0-9])$ ]]; then
    pf_error "PORT_API=$PORT_API fuera de rango" "Debe estar entre 5101 y 5199"
    ports_ok=0
  fi
  if ((ports_ok)) && has_backend && [[ "${PORT_WEB:2}" != "${PORT_API:2}" ]]; then
    pf_error "PORT_WEB y PORT_API no terminan en el mismo número" "Usá el mismo NN (ej. 9104 y 5104)"
    ports_ok=0
  fi
  ((ports_ok)) && pf_ok "Puertos dentro de rango (PORT_WEB=$PORT_WEB${PORT_API:+, PORT_API=$PORT_API})"

  if ((ports_ok && docker_ok)); then
    check_port_free "$PORT_WEB"
    has_backend && check_port_free "$PORT_API"
  fi
  ((ports_ok)) && check_caddy_ports

  if has_backend && ((docker_ok)); then
    check_subnet
  fi

  if [[ -d "$WEB_ROOT" && -w "$WEB_ROOT" ]]; then
    pf_ok "WEB_ROOT $WEB_ROOT existe y es escribible"
  elif has_frontend; then
    pf_error "WEB_ROOT '$WEB_ROOT' no existe o no es escribible por $(id -un)" "Pedile al admin que lo cree y te dé permisos de escritura"
  fi

  if [[ -n "$DATA_DIR" ]] && ((docker_ok)); then
    if [[ -d "$DATA_DIR" ]] && docker run --rm --user 1000:1000 -v "$DATA_DIR":/d "$NODE_IMAGE" \
      sh -c 'touch /d/.w && rm /d/.w' > /dev/null 2>&1; then
      pf_ok "DATA_DIR $DATA_DIR escribible por uid 1000"
    else
      pf_error "DATA_DIR '$DATA_DIR' no existe o el uid 1000 no puede escribir" "Pedile al admin: chown 1000:1000 $DATA_DIR"
    fi
  fi

  if has_db; then
    if ((docker_ok)) && docker network inspect infrastructure-db > /dev/null 2>&1; then
      pf_ok "Red infrastructure-db disponible"
    else
      pf_error "No existe la red Docker infrastructure-db" "Avisale al admin"
    fi
    if [[ ! -r "$SECRETS_FILE" ]]; then
      pf_error "SECRETS_FILE '$SECRETS_FILE' no existe o no es legible" "Pedile al admin que lo cree y te dé permiso de lectura"
    elif grep -qE '^[[:space:]]*(export[[:space:]]+)?DATABASE_URL=.+' "$SECRETS_FILE"; then
      pf_ok "SECRETS_FILE define DATABASE_URL"
    else
      pf_error "SECRETS_FILE no define DATABASE_URL" "Pedile al admin que la agregue"
    fi
  fi

  if has_backend && ((docker_ok)) && [[ -f "$APP_ENV" ]] && { ! has_db || [[ -r "$SECRETS_FILE" ]]; }; then
    if APP_VERSION=preflight dc config -q > /dev/null 2>&1; then
      pf_ok "docker compose config válido"
    else
      pf_error "docker compose config falla" "Ejecutá: APP_VERSION=x docker compose -p ${SLUG}-test -f $COMPOSE_FILE --env-file $SERVER_ENV config"
    fi
  fi

  echo
  if ((PF_ERRORS > 0)); then
    printf 'Preflight: %d error(es). Corregilos y volvé a ejecutar ./deploy/deploy.sh preflight\n' "$PF_ERRORS"
    return 1
  fi
  echo "Preflight: todo OK."
}

# ----------------------------------------------------------------------------
# Pasos comunes de install y update
# ----------------------------------------------------------------------------
compute_version() {
  VERSION="$(git rev-parse --short HEAD)"
  if [[ -n "$(git status --porcelain)" ]]; then
    VERSION="${VERSION}-dirty"
    warn "Hay cambios sin commitear: se despliega como $VERSION. Lo recomendable es desplegar solo commits."
  fi
  export APP_VERSION="$VERSION"
}

backup_db() {
  local file
  mkdir -p "$DB_BACKUP_DIR"
  chmod 700 "$DB_BACKUP_DIR"
  file="$DB_BACKUP_DIR/$(date +%Y%m%d-%H%M%S)-${VERSION}.dump"
  info "Copia de la base antes de migrar → $file"
  # Se quitan los parámetros ?... (pg_dump no los acepta) y comillas que deje --env-file.
  if ! (
    umask 077
    docker run --rm --network infrastructure-db --env-file "$SECRETS_FILE" \
      "$PG_IMAGE" sh -c 'u=${DATABASE_URL%%\?*}; u=${u#\"}; u=${u%\"}; exec pg_dump "$u" -Fc' \
      > "$file"
  ); then
    rm -f "$file"
    die "Falló la copia de la base. No se migró nada. Revisá la conexión y volvé a intentar."
  fi
  chmod 600 "$file"
  # shellcheck disable=SC2012
  ls -1t "$DB_BACKUP_DIR"/*.dump 2> /dev/null | tail -n +4 | xargs -r rm -f --
}

check_pending_migrations() {
  local status names name sql risky=""
  info "Revisando migraciones pendientes"
  status="$(dc run --rm --no-deps -T api node_modules/.bin/prisma migrate status 2>&1 || true)"
  names="$(grep -oE '^[0-9]{14}_[A-Za-z0-9_]+' <<< "$status" || true)"
  if [[ -z "$names" ]]; then
    if grep -q 'Database schema is up to date' <<< "$status"; then
      echo "Sin migraciones pendientes."
      return
    fi
    printf '%s\n' "$status" >&2
    die "No se pudo consultar el estado de las migraciones (ver arriba). No se migró nada."
  fi
  printf 'Pendientes:\n%s\n' "$names"
  for name in $names; do
    sql="server/prisma/migrations/$name/migration.sql"
    if [[ -f "$sql" ]] && grep -qiE 'DROP[[:space:]]+(TABLE|COLUMN|SCHEMA)|RENAME|TRUNCATE|DELETE[[:space:]]+FROM|ALTER[[:space:]]+COLUMN[^;]*TYPE' "$sql"; then
      risky+="$name "
    fi
  done
  if [[ -n "$risky" ]]; then
    warn "Estas migraciones borran, renombran o cambian el tipo de tablas/columnas: $risky"
    warn "Revisalas antes de seguir (server/prisma/migrations/<nombre>/migration.sql)."
    if [[ "${ALLOW_DESTRUCTIVE_MIGRATIONS:-}" != "si" ]] && ! confirm "¿Revisaste las migraciones y querés aplicarlas igual?"; then
      die "Despliegue detenido antes de migrar. Para continuar sin terminal: ALLOW_DESTRUCTIVE_MIGRATIONS=si ./deploy/deploy.sh ${COMMAND}"
    fi
  fi
}

report_failure() {
  local stage="$1"
  echo
  printf '!!! Falló: %s\n' "$stage" >&2
  echo "--- Estado ---"
  dc ps || true
  echo "--- Últimas líneas de log ---"
  dc logs --tail 50 api || true
  echo
  echo "No se revirtió nada automáticamente. Opciones:"
  echo "  1) Corregir el problema, commitear y reintentar: ./deploy/deploy.sh $COMMAND"
  if [[ -n "$(read_state previous)" || -n "$(read_state current)" ]]; then
    echo "  2) Volver a la versión anterior: ./deploy/deploy.sh rollback"
    echo "     ATENCIÓN: las migraciones de base NO se revierten; si el esquema cambió de forma"
    echo "     incompatible, la versión anterior puede fallar. La copia previa está en $DB_BACKUP_DIR/."
  fi
  exit 1
}

deploy_frontend() {
  # Se llama desde un "||": set -e no aplica acá, cada paso corta explícitamente.
  info "Publicando el frontend en $WEB_ROOT/dist"
  rm -rf "$WEB_ROOT/dist.new" || return 1
  docker build -f client/Dockerfile --target frontend \
    --output "type=local,dest=$WEB_ROOT/dist.new" client || return 1
  [[ -f "$WEB_ROOT/dist.new/index.html" ]] || { warn "El build no generó index.html"; return 1; }
  rm -rf "$WEB_ROOT/dist.prev" || return 1
  if [[ -d "$WEB_ROOT/dist" ]]; then mv "$WEB_ROOT/dist" "$WEB_ROOT/dist.prev" || return 1; fi
  mv "$WEB_ROOT/dist.new" "$WEB_ROOT/dist"
}

cleanup_images() {
  local current previous tag
  current="$(read_state current)"
  previous="$(read_state previous)"
  for tag in $(docker image ls "${SLUG}-api" --format '{{.Tag}}'); do
    [[ "$tag" == "$current" || "$tag" == "$previous" ]] && continue
    docker image rm "${SLUG}-api:${tag}" > /dev/null 2>&1 || true
  done
}

release() {
  local current
  compute_version
  current="$(read_state current)"

  if has_backend; then
    info "Construyendo imagen ${SLUG}-api:${VERSION}"
    docker build -t "${SLUG}-api:${VERSION}" server

    if has_db; then
      check_pending_migrations
      backup_db
      info "Aplicando migraciones (prisma migrate deploy)"
      dc run --rm --no-deps -T api node_modules/.bin/prisma migrate deploy || report_failure "migración"
    fi

    if [[ -n "$current" && "$current" != "$VERSION" ]]; then write_state previous "$current"; fi
    info "Levantando la API ${VERSION}"
    dc up -d --wait --wait-timeout 120 || report_failure "arranque del contenedor"
    health_check || report_failure "health check en http://127.0.0.1:${PORT_API}/api/health"
    echo "API sana."
  else
    if [[ -n "$current" && "$current" != "$VERSION" ]]; then write_state previous "$current"; fi
  fi

  if has_frontend; then
    deploy_frontend || report_failure "publicación del frontend"
  fi

  write_state current "$VERSION"
  if has_backend; then cleanup_images; fi
}

generate_caddy_block() {
  local out="deploy/Caddyfile.${SLUG}.generated"
  sed -e "s|{{SLUG}}|${SLUG}|g" -e "s|{{PORT_WEB}}|${PORT_WEB}|g" -e "s|{{PORT_API}}|${PORT_API}|g" \
    -e "s|{{TS_HOST}}|${TS_HOST}|g" -e "s|{{TS_IP}}|${TS_IP}|g" deploy/Caddyfile.test.example > "$out"
  echo
  echo "------------------------------------------------------------------"
  echo "Bloque de Caddy generado ($out):"
  echo "------------------------------------------------------------------"
  cat "$out"
  echo "------------------------------------------------------------------"
  echo "Para el admin: agregar este bloque a Caddy y sumar la app a Homepage y backups"
}

# ----------------------------------------------------------------------------
# Subcomandos
# ----------------------------------------------------------------------------
cmd_install() {
  if [[ -f "$STATE_DIR/current" ]]; then
    echo "La app ya está instalada (versión $(read_state current)). Para desplegar cambios usá:"
    echo "  ./deploy/deploy.sh update"
    exit 0
  fi
  cmd_preflight || die "Preflight con errores: no se instaló nada."
  release
  generate_caddy_block
  echo
  echo "Instalación completa: versión $VERSION"
  echo "URL final (cuando el admin aplique el bloque de Caddy): $(app_url)"
}

cmd_update() {
  if [[ ! -f "$STATE_DIR/current" ]]; then
    die "La app todavía no está instalada. Usá: ./deploy/deploy.sh install"
  fi
  cmd_preflight || die "Preflight con errores: no se actualizó nada."
  release
  echo
  echo "Actualización completa: versión $VERSION (anterior: $(read_state previous))"
  echo "URL: $(app_url)"
}

cmd_rollback() {
  local current previous tmp
  current="$(read_state current)"
  previous="$(read_state previous)"
  [[ -n "$previous" ]] || die "No hay una versión anterior registrada en $STATE_DIR/previous."

  cat << EOF

##########################################################################
#  ROLLBACK a la versión $previous (actual: ${current:-?})
#
#  ATENCIÓN: las migraciones de base NO se revierten; si el esquema
#  cambió de forma incompatible, la versión anterior puede fallar;
#  la copia previa a la migración está en $DB_BACKUP_DIR/
#  y la restaura el admin.
##########################################################################

EOF
  if [[ -t 0 ]] && ! confirm "¿Continuar con el rollback?"; then
    die "Rollback cancelado."
  fi

  if has_backend; then
    docker image inspect "${SLUG}-api:${previous}" > /dev/null 2>&1 \
      || die "No existe la imagen ${SLUG}-api:${previous}; no se puede volver atrás."
    export APP_VERSION="$previous"
    info "Levantando la API ${previous}"
    dc up -d --wait --wait-timeout 120 || report_failure "arranque del contenedor en rollback"
    health_check || report_failure "health check en rollback"
  fi

  if has_frontend; then
    if [[ -d "$WEB_ROOT/dist.prev" && -d "$WEB_ROOT/dist" ]]; then
      info "Restaurando el frontend anterior (dist.prev)"
      tmp="$WEB_ROOT/dist.rollback.$$"
      mv "$WEB_ROOT/dist" "$tmp"
      mv "$WEB_ROOT/dist.prev" "$WEB_ROOT/dist"
      mv "$tmp" "$WEB_ROOT/dist.prev"
    else
      warn "No existe $WEB_ROOT/dist.prev: el frontend queda como está."
    fi
  fi

  write_state current "$previous"
  if [[ -n "$current" ]]; then write_state previous "$current"; fi
  echo
  echo "Rollback completo: versión actual $previous. URL: $(app_url)"
}

cmd_status() {
  APP_VERSION="$(read_state current)"
  export APP_VERSION="${APP_VERSION:-none}"
  if has_backend; then
    info "Contenedores"
    dc ps
    info "Health"
    curl -sS --max-time 5 -w ' (HTTP %{http_code})\n' "http://127.0.0.1:${PORT_API}/api/health" || echo "Sin respuesta"
  fi
  info "Versiones"
  echo "current:  $(read_state current)"
  echo "previous: $(read_state previous)"
  echo "URL:      $(app_url)"
}

cmd_logs() {
  has_backend || die "Esta app (tipo A) no tiene backend."
  APP_VERSION="$(read_state current)"
  export APP_VERSION="${APP_VERSION:-none}"
  dc logs -f --tail 200 api
}

usage() {
  cat << 'EOF'
Uso: ./deploy/deploy.sh <comando>

  preflight  Comprueba en el servidor que todo esté listo (no cambia nada)
  install    Primera instalación
  update     Despliega el commit actual (copia de base + migraciones)
  rollback   Vuelve a la versión anterior (las migraciones NO se revierten)
  status     Estado, health, versiones y URL
  logs       Logs de la API en vivo
EOF
}

COMMAND="${1:-}"
case "$COMMAND" in
  preflight) load_env; cmd_preflight ;;
  install) load_env; cmd_install ;;
  update) load_env; cmd_update ;;
  rollback) load_env; cmd_rollback ;;
  status) load_env; cmd_status ;;
  logs) load_env; cmd_logs ;;
  -h|--help|help|"") usage ;;
  *) usage; exit 1 ;;
esac
