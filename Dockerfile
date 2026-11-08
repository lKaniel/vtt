# The game server with its built client. Game data lives outside the image,
# in /data (see deploy/ and docs/deploy.md).

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

# Build the client with every dependency.
FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm build

# The server runs its TypeScript with tsx, so it needs only its own packages.
FROM base AS runtime
COPY . .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile --prod --filter @vtt/server...
COPY --from=build /app/packages/client/dist packages/client/dist
COPY deploy/entrypoint.sh /usr/local/bin/vtt-entrypoint
RUN mkdir -p /data && chown node:node /data
USER node
ENV NODE_ENV=production PORT=3001 VTT_DATA=/data VTT_GAME=/data/world
EXPOSE 3001
VOLUME /data
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["vtt-entrypoint"]
WORKDIR /app/packages/server
CMD ["node", "--import", "tsx", "src/index.ts"]
