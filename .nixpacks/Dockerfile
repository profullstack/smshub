# syntax=docker/dockerfile:1
#
# smshub.dev, run on Bun.
#
# This file lives at .nixpacks/Dockerfile because that is the path dev2's compose
# stack builds (cli-tools dev2/dev2-site provision records it per site). It used to
# be nixpacks output (Node + pnpm); it is now a hand-written Bun image, so do not
# regenerate it with nixpacks.
#
# Not a standalone build: with the unwired src/proxy.ts beside the root
# middleware.ts, `output: "standalone"` fails in Next 16.2 (missing
# .next/server/middleware.js.nft.json, under Node too). So the tree ships with
# production node_modules and `next start` serves it, as before.
#
# Contract with /home/anthony/www/smshub.dev on dev2, unchanged: listens on 3000
# inside the container, answers /api/health, reads its secrets from app.env at run
# time. The NEXT_PUBLIC_* values arrive as compose build args.

FROM oven/bun:1.4.0-slim AS base
WORKDIR /app
RUN chown bun:bun /app
USER bun

# Production dependencies only, for the runtime image.
FROM base AS prod-deps
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

FROM base AS build
COPY --chown=bun:bun package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY --chown=bun:bun . .
ARG NEXT_PUBLIC_SUPABASE_URL=https://sytajbytcdlsbnbkqpyo.supabase.co
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_McsKXzSA1weUTMUddMDgEQ_74LRMQ-4
ARG NEXT_PUBLIC_APP_URL=https://smshub.dev
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_TELEMETRY_DISABLED=1
# `bun --bun next build`: Next builds on Bun, not Node.
RUN bun run build

FROM base AS runtime
COPY --chown=bun:bun . .
COPY --from=prod-deps --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/.next ./.next
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000
# 127.0.0.1, not localhost: localhost resolves ::1 first and Next binds IPv4 only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"
# `bun --bun next start`: Next serves on Bun.
CMD ["bun", "run", "start"]
