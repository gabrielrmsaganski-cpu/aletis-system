#!/usr/bin/env bash
# Wrapper do cron para refresh-sicar — garante PATH + logging.
#
# O .env NÃO é sourced aqui (valores com espaços quebram) — `tsx --env-file`
# dentro do script TS resolve isso. Aqui só garantimos pnpm no PATH.
#
# Instalação (já está via `crontab -l`):
#   17 3 * * * /home/azureai/ALETIS/aletis-system/apps/api/scripts/refresh-sicar.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPT_DIR")"

LOG_DIR="/var/log/aletis"
[[ -w "$LOG_DIR" ]] || LOG_DIR="/tmp"
LOG_FILE="$LOG_DIR/aletis-refresh-sicar-$(date +%Y%m%d).log"

# Cron roda com PATH mínimo — garantimos pnpm + node via locais conhecidos.
# Inclui mise (gerenciador usado nesta VM), pnpm global e nvm — o primeiro
# diretório existente define node/pnpm.
for dir in \
    "$HOME/.local/share/mise/shims" \
    "$HOME/.local/share/mise/installs/node/22/bin" \
    "$HOME/.local/share/mise/installs/node/20/bin" \
    "$HOME/.local/share/pnpm" \
    "$HOME/.nvm/versions/node/v22.11.0/bin" \
    "$HOME/.nvm/versions/node/v20.18.0/bin" \
    /usr/local/bin /usr/bin /bin; do
  [[ -d "$dir" ]] && PATH="$dir:$PATH"
done
export PATH

{
  echo "───────────────────────────────────────────────"
  echo "refresh-sicar iniciado em $(date -Iseconds)"
  echo "node: $(command -v node >/dev/null && node --version || echo 'NÃO ENCONTRADO')"
  echo "pnpm: $(command -v pnpm >/dev/null && pnpm --version || echo 'NÃO ENCONTRADO')"
  echo "───────────────────────────────────────────────"

  cd "$APP_DIR" || { echo "APP_DIR inexistente: $APP_DIR"; exit 2; }
  pnpm exec tsx --env-file=../../.env scripts/refresh-sicar.ts
  RC=$?
  echo "refresh-sicar exit=$RC em $(date -Iseconds)"

  # exit 10 = SICAR offline (aviso Dataprev) — é esperado durante manutenção,
  # não queremos alertar o operador disso.
  [[ "$RC" == "10" ]] && exit 0
  exit "$RC"
} >> "$LOG_FILE" 2>&1
