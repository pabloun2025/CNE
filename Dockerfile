# Imagen única para la web y el trabajador (compose: docker-compose.oracle.yml).
FROM node:22.23.4-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# tsx se queda como dependencia de producción: lo usan el trabajador y los scripts de base de datos.
RUN npm run build && npm prune --omit=dev

FROM node:22.23.4-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN groupadd --system cne && useradd --system --gid cne --home /app cne
COPY --from=build --chown=cne:cne /app/package.json /app/package-lock.json ./
COPY --from=build --chown=cne:cne /app/node_modules ./node_modules
COPY --from=build --chown=cne:cne /app/.next ./.next
COPY --from=build --chown=cne:cne /app/public ./public
COPY --from=build --chown=cne:cne /app/src ./src
COPY --from=build --chown=cne:cne /app/db ./db
COPY --from=build --chown=cne:cne /app/scripts ./scripts
COPY --from=build --chown=cne:cne /app/tsconfig.json /app/next.config.ts ./
USER cne
EXPOSE 38473
CMD ["npm", "start"]
