# =============================================================
# ALETIS API — Dockerfile multi-stage
# =============================================================
# Stage 1 (deps):     instala dependências do monorepo com pnpm
# Stage 2 (builder):  compila TypeScript com tsc
# Stage 3 (runtime):  imagem final node:alpine sem dev-deps
#
# Build: docker build -f apps/api/Dockerfile -t aletis-api . (a partir da raiz do repo)
# Run:   docker run -p 3011:3011 --env-file .env aletis-api
# =============================================================
ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.4

# ---- deps ----
FROM node:${NODE_VERSION}-alpine AS deps
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --filter @aletis/api...

# ---- builder ----
FROM node:${NODE_VERSION}-alpine AS builder
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/packages ./packages
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api ./apps/api
RUN pnpm --filter @aletis/api build

# ---- runtime ----
FROM node:${NODE_VERSION}-alpine AS runtime
RUN apk add --no-cache tini && addgroup -S aletis && adduser -S aletis -G aletis
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3011 \
    HOST=0.0.0.0
COPY --from=builder --chown=aletis:aletis /app/apps/api/dist ./dist
COPY --from=builder --chown=aletis:aletis /app/apps/api/package.json ./package.json
COPY --from=builder --chown=aletis:aletis /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=aletis:aletis /app/packages ./packages
USER aletis
EXPOSE 3011
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=20s \
  CMD wget -qO- http://127.0.0.1:3011/api/health || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
