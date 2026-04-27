#!/usr/bin/env bash
# =============================================================
# ALETIS — Backup completo (banco + storages)
# =============================================================
# Gera 1 arquivo .tgz com:
#   - dump SQL do Postgres
#   - tar do volume aletis-api-storage   (uploads do portal cliente)
#   - tar do volume aletis-site-storage  (leads.jsonl)
#
# Uso (no servidor antigo):
#   ./scripts/migration/backup.sh
#   # gera ./backups/aletis-backup-YYYY-MM-DD-HHMMSS.tgz
#
# Pré-requisitos: docker compose com os 3 serviços rodando, ou pelo
# menos com os volumes nomeados existentes.
# =============================================================
set -euo pipefail

cd "$(dirname "$0")/../.."

OUT_DIR="${OUT_DIR:-./backups}"
mkdir -p "$OUT_DIR"
TS="$(date +%Y-%m-%d-%H%M%S)"
WORK_DIR="$(mktemp -d)"
trap "rm -rf '$WORK_DIR'" EXIT

echo "📦 ALETIS backup · $TS"
echo "   work: $WORK_DIR"

# ---- 1. Dump Postgres ----
echo "→ dump postgres…"
docker compose exec -T postgres pg_dump \
  -U "${POSTGRES_USER:-aletis}" \
  -d "${POSTGRES_DB:-aletis}" \
  --no-owner --no-privileges --clean --if-exists \
  > "$WORK_DIR/postgres.sql"
echo "   $(wc -l < "$WORK_DIR/postgres.sql") linhas"

# ---- 2. Tar do volume api-storage ----
echo "→ tar volume aletis-api-storage…"
docker run --rm \
  -v aletis-api-storage:/data:ro \
  -v "$WORK_DIR":/backup \
  alpine tar czf /backup/api-storage.tgz -C /data .
echo "   $(du -h "$WORK_DIR/api-storage.tgz" | cut -f1)"

# ---- 3. Tar do volume site-storage ----
echo "→ tar volume aletis-site-storage…"
docker run --rm \
  -v aletis-site-storage:/data:ro \
  -v "$WORK_DIR":/backup \
  alpine tar czf /backup/site-storage.tgz -C /data . 2>/dev/null \
  || echo "   (volume vazio ou ausente — ok)"

# ---- 4. Manifesto + arquivo final ----
cat > "$WORK_DIR/MANIFEST.txt" <<EOF
ALETIS backup
geradoEm: $(date -u +%Y-%m-%dT%H:%M:%SZ)
host: $(hostname)
git: $(git rev-parse --short HEAD 2>/dev/null || echo "n/a")
docker compose ls:
$(docker compose ls 2>/dev/null || true)

Para restaurar:
  ./scripts/migration/restore.sh aletis-backup-${TS}.tgz
EOF

OUT_FILE="$OUT_DIR/aletis-backup-$TS.tgz"
tar czf "$OUT_FILE" -C "$WORK_DIR" .
echo
echo "✅ backup pronto: $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
