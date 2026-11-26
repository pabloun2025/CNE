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
# pg_dump 16 y pg_restore para el respaldo previo a «Preparar elección» (M19). El servidor es PostgreSQL 16: el cliente no puede ser más antiguo.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl \
    && install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends postgresql-client-16 cabextract \
    && curl -fsSL --retry 3 -o /tmp/arial32.exe https://downloads.sourceforge.net/project/corefonts/the%20fonts/final/arial32.exe \
    && echo '85297a4d146e9c87ac6f74822734bdee5f4b2a722d7eaa584b7f2cbf76f478f6  /tmp/arial32.exe' | sha256sum -c - \
    && install -d -m 755 /usr/local/share/fonts/cne \
    && cabextract -q -L -d /usr/local/share/fonts/cne /tmp/arial32.exe \
    && test -s /usr/local/share/fonts/cne/arial.ttf && test -s /usr/local/share/fonts/cne/arialbd.ttf \
    && rm /tmp/arial32.exe \
    && apt-get purge -y curl cabextract && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
RUN groupadd --system cne && useradd --system --gid cne --home /app cne \
    && install -d -m 700 -o cne -g cne /run/cne-padron-movil
COPY --from=build --chown=cne:cne /app/package.json /app/package-lock.json ./
COPY --from=build --chown=cne:cne /app/node_modules ./node_modules
COPY --from=build --chown=cne:cne /app/.next ./.next
COPY --from=build --chown=cne:cne /app/public ./public
COPY --from=build --chown=cne:cne /app/src ./src
# El PDF de la credencial se lee en caliente. .dockerignore deja entrar solo este archivo.
COPY --from=build --chown=cne:cne /app/insumos/originales/MODELO_DE_CREDENCIALES_DE_MJRV.pdf ./insumos/originales/MODELO_DE_CREDENCIALES_DE_MJRV.pdf
COPY --from=build --chown=cne:cne /app/db ./db
COPY --from=build --chown=cne:cne /app/scripts ./scripts
COPY --from=build --chown=cne:cne /app/tsconfig.json /app/next.config.ts ./
USER cne
EXPOSE 38473
CMD ["npm", "start"]
