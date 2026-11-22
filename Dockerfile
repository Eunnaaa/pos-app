# ==============================================================================
# Production-Grade Multi-Stage Dockerfile for Next.js Fullstack POS Application
# ==============================================================================

# 1. Base Image
FROM node:22-alpine AS base
RUN apk add --no-cache libc6-compat
WORKDIR /app

# 2. Dependencies Cache Layer
FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

# 3. Builder Layer
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry during build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Public browser settings are embedded by Next.js at build time.
ARG NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3000
ARG NEXT_PUBLIC_SUPABASE_URL=
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN

# Build with inert values; real server credentials are supplied only at runtime.
# Migrations are committed in drizzle/ and run as a separate deployment step.
RUN DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres \
    DATABASE_SSL=disable \
    BETTER_AUTH_SECRET=build-only-auth-secret-with-at-least-32-chars \
    UPSTASH_REDIS_REST_URL=https://build.invalid \
    UPSTASH_REDIS_REST_TOKEN=build-only \
    npm run build

# 4. Production Runner Layer (Minimal & Secure)
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Non-root user for enhanced security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets and public directory
COPY --from=builder /app/public ./public

# Setup .next directory permissions
RUN mkdir .next && chown nextjs:nodejs .next

# Copy standalone output bundle
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Switch to non-root user
USER nextjs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/v1/health || exit 1

# Start the Next.js standalone server
CMD ["node", "server.js"]
