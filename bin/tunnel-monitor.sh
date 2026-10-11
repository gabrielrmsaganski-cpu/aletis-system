#!/usr/bin/env bash
# tunnel-monitor.sh — localhost.run auto-reconnect wrapper (persistente via SSH key)
# Usage: tunnel-monitor.sh <local_port> <service_name>
set -euo pipefail

PORT="${1:-}"
NAME="${2:-service}"
SSH_KEY="${HOME}/.ssh/id_ed25519_localhostrun"

if [[ -z "$PORT" ]]; then
  echo "Usage: $0 <local_port> <service_name>"
  exit 1
fi

LOG_DIR="/root/ALETIS/aletis-system/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/tunnel-${NAME}.log"

# Limpa log antigo para não ficar gigante
> "$LOG_FILE"

echo "[$(date -Iseconds)] Tunnel monitor started for ${NAME} on port ${PORT}" | tee -a "$LOG_FILE"

while true; do
  echo "[$(date -Iseconds)] Connecting ${NAME} tunnel to localhost.run ..." | tee -a "$LOG_FILE"

  ssh -o StrictHostKeyChecking=no \
      -o ServerAliveInterval=30 \
      -o ServerAliveCountMax=3 \
      -o ExitOnForwardFailure=yes \
      -o IdentitiesOnly=yes \
      -i "$SSH_KEY" \
      -R "80:localhost:${PORT}" \
      localhost.run 2>&1 | tee -a "$LOG_FILE" || true

  echo "[$(date -Iseconds)] ${NAME} ssh disconnected. Restarting in 5s..." | tee -a "$LOG_FILE"
  sleep 5
done
