# Fantasy Football Front Office — production image.
#
# Multi-stage so the runtime image carries only the standalone server bundle, not the
# build toolchain or the full node_modules tree.

# ---- deps -------------------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ------------------------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma's client is generated, not committed. Skipped when there is no schema change.
RUN npx prisma generate --schema=./prisma/schema.prisma || true
RUN npm run build

# ---- runtime ----------------------------------------------------------------
FROM node:22-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user. The app never writes to disk, so nothing needs to be writable.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# No credentials are baked into the image. ESPN cookies and the Anthropic key are
# supplied at runtime as environment variables.
CMD ["node", "server.js"]
