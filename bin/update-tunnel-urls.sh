#!/usr/bin/env bash
# Extrai os URLs mais recentes dos túneis nos logs do PM2 e salva em arquivo
LOG_DIR="/root/ALETIS/aletis-system/logs"
mkdir -p "$LOG_DIR"

WEB_URL=$(strings /root/.pm2/logs/aletis-tunnel-web-out.log | grep -oE 'https://[a-z0-9]+\.lhr\.life' | tail -1)
SITE_URL=$(strings /root/.pm2/logs/aletis-tunnel-site-out.log | grep -oE 'https://[a-z0-9]+\.lhr\.life' | tail -1)

OUT="$LOG_DIR/tunnel-urls.md"
echo "# Links atuais dos túneis localhost.run" > "$OUT"
echo "Atualizado: $(date -Iseconds)" >> "$OUT"
echo "" >> "$OUT"
echo "- Sistema Web: ${WEB_URL:-"Não disponível"}" >> "$OUT"
echo "- Site Institucional: ${SITE_URL:-"Não disponível"}" >> "$OUT"
echo "" >> "$OUT"
echo "Para atualizar manualmente, execute: /root/ALETIS/aletis-system/bin/update-tunnel-urls.sh" >> "$OUT"

cat "$OUT"
