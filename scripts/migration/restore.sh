#!/usr/bin/env bash
# =============================================================
# ALETIS — Restore completo (banco + storages)
# =============================================================
# Aplica um backup .tgz gerado por backup.sh em um ambiente novo.
#
# Uso (no servidor novo, após `docker compose up -d`):
#   ./scripts/migration/restore.sh ./backups/aletis-backup-YYYY-MM-DD-HHMMSS.tgz
#
# IMPORTANTE: roda DEPOIS de subir os serviços. Os volumes nomeados
# precisam existir (mesmo que vazios). O dump usa --clean --if-exists
# então sobrescreve dados existentes — backup local antes se duvidar.
# =============================================================
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Uso: $0 <backup.tgz>"
  echo "Ex:  $0 ./backups/aletis-backup-2026-04-27-120000.tgz"
  exit 2
fi

BACKUP_FILE="$1"
if [ ! -f "$BACKUP_FILE" ]; then
  echo "❌ arquivo não encontrado: $BACKUP_FILE"
  exit 2
fi

cd "$(dirname "$0")/../.."

WORK_DIR="$(mktemp -d)"
trap "rm -rf '$WORK_DIR'" EXIT

echo "📥 ALETIS restore"
echo "   from: $BACKUP_FILE"
echo "   work: $WORK_DIR"

# ---- 1. Extrai backup ----
echo "→ extraindo…"
tar xzf "$BACKUP_FILE" -C "$WORK_DIR"
ls -la "$WORK_DIR"

# ---- 2. Verifica serviços ----
if ! docker compose ps postgres --format json | grep -q '"State":"running"'; then
  echo "❌ postgres não está rodando. Suba primeiro: docker compose up -d postgres"
  exit 3
fi

# ---- 3. Restore Postgres ----
if [ -f "$WORK_DIR/postgres.sql" ]; then
  echo "→ restaurando postgres ($(wc -l < "$WORK_DIR/postgres.sql") linhas)…"
  docker compose exec -T postgres psql \
    -U "${POSTGRES_USER:-aletis}" \
    -d "${POSTGRES_DB:-aletis}" \
    --quiet < "$WORK_DIR/postgres.sql"
  echo "   ✓ postgres restaurado"
else
  echo "   (sem dump postgres no backup — pulando)"
fi

# ---- 4. Restore api-storage ----
if [ -f "$WORK_DIR/api-storage.tgz" ]; then
  echo "→ restaurando volume aletis-api-storage…"
  docker run --rm \
    -v aletis-api-storage:/data \
    -v "$WORK_DIR":/backup:ro \
    alpine sh -c "rm -rf /data/* && tar xzf /backup/api-storage.tgz -C /data"
  echo "   ✓ api-storage restaurado"
fi

# ---- 5. Restore site-storage ----
if [ -f "$WORK_DIR/site-storage.tgz" ] && [ -s "$WORK_DIR/site-storage.tgz" ]; then
  echo "→ restaurando volume aletis-site-storage…"
  docker run --rm \
    -v aletis-site-storage:/data \
    -v "$WORK_DIR":/backup:ro \
    alpine sh -c "rm -rf /data/* && tar xzf /backup/site-storage.tgz -C /data"
  echo "   ✓ site-storage restaurado"
fi

# ---- 6. Restart api e site para hidratar memória do PG ----
echo "→ reiniciando api e site para re-hidratar Maps em memória…"
docker compose restart api site
sleep 3
docker compose ps

echo
echo "✅ restore concluído. Validar com:"
echo "   curl http://localhost:${API_PORT:-3011}/api/health/deep"
