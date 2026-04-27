# =============================================================
# ALETIS Web — Dockerfile multi-stage (Vite + Nginx)
# =============================================================
# Build: docker build -f apps/web/Dockerfile -t aletis-web . (a partir da raiz)
# Run:   docker run -p 8080:80 aletis-web
# =============================================================
ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.4

# ---- builder ----
FROM node:${NODE_VERSION}-alpine AS builder
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --filter @aletis/web...
COPY apps/web ./apps/web
RUN pnpm --filter @aletis/web build

# ---- runtime: nginx servindo dist/ ----
FROM nginx:1.27-alpine AS runtime
RUN rm -rf /usr/share/nginx/html/*
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html
RUN cat > /etc/nginx/conf.d/default.conf <<'NGINX'
server {
  listen 80;
  server_name _;
  root /usr/share/nginx/html;
  index index.html;

  # SPA fallback — qualquer rota não encontrada cai no index.html
  location / {
    try_files $uri $uri/ /index.html;
  }

  # Assets imutáveis (Vite hash) — cache 1 ano
  location /assets/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }

  # Fontes brand
  location /fonts/ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }

  # Service worker — sem cache
  location = /sw.js {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    try_files $uri =404;
  }

  # Health
  location = /healthz {
    access_log off;
    return 200 'ok';
    add_header Content-Type text/plain;
  }
}
NGINX
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/healthz || exit 1
