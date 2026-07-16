# ---- Base ----
FROM node:20-alpine AS base
WORKDIR /app

# ---- Dependencies ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ---- Dependencies (full, for build + prisma CLI) ----
FROM base AS deps-all
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build ----
FROM base AS builder
COPY --from=deps-all /app/node_modules ./node_modules
COPY . .

# Prisma: generate client
RUN npx prisma generate --schema=prisma/schema.prisma

# Next.js build (standalone output for smaller image)
# Dummy env vars for build-time page data collection (not used at runtime)
ENV NEXT_TELEMETRY_DISABLED=1
ENV DATABASE_HOST=build-placeholder
ENV DATABASE_PORT=3306
ENV DATABASE_USER=build-placeholder
ENV DATABASE_PASSWORD=build-placeholder
ENV DATABASE_NAME=build-placeholder
RUN npm run build

# ---- Production ----
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# netcat for DB connection check in entrypoint
RUN apk add --no-cache netcat-openbsd

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/prisma ./prisma

# Copy Prisma generated client (Prisma 7.x outputs to src/generated/)
COPY --from=builder /app/src/generated ./src/generated

# Full node_modules for Prisma CLI (migrate deploy)
COPY --from=deps-all /app/node_modules ./node_modules

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts

# Entrypoint script
COPY docker-entrypoint.sh ./docker-entrypoint.sh

# Uploaded files live under /app/private/uploads (server-only path used by the
# attachments API). Persisted via a Docker volume in docker-compose.
RUN mkdir -p /app/private/uploads /app/private/templates \
    && chown -R nextjs:nodejs /app/private
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["sh", "./docker-entrypoint.sh"]
