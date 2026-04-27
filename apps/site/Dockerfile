# =============================================================
# ALETIS Site — Dockerfile multi-stage (Next.js 14 standalone)
# =============================================================
# Build: docker build -f apps/site/Dockerfile -t aletis-site . (a partir da raiz)
# Run:   docker run -p 3000:3000 aletis-site
# =============================================================
ARG NODE_VERSION=22
ARG PNPM_VERSION=9.15.4

# ---- deps ----
FROM node:${NODE_VERSION}-alpine AS deps
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/site/package.json apps/site/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile --filter @aletis/site...

# ---- builder ----
FROM node:${NODE_VERSION}-alpine AS builder
RUN corepack enable && corepack prepare pnpm@${PNPM_VERSION} --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/site/node_modules ./apps/site/node_modules
COPY --from=deps /app/packages ./packages
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/site ./apps/site
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @aletis/site build

# ---- runtime ----
FROM node:${NODE_VERSION}-alpine AS runtime
RUN apk add --no-cache tini && addgroup -S aletis && adduser -S aletis -G aletis
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
# Next.js standalone build cria .next/standalone com tudo necessário
COPY --from=builder --chown=aletis:aletis /app/apps/site/.next ./.next
COPY --from=builder --chown=aletis:aletis /app/apps/site/public ./public
COPY --from=builder --chown=aletis:aletis /app/apps/site/package.json ./package.json
COPY --from=builder --chown=aletis:aletis /app/apps/site/node_modules ./node_modules
COPY --from=builder --chown=aletis:aletis /app/packages ./packages
USER aletis
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 --start-period=15s \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node_modules/.bin/next", "start", "-p", "3000"]
