FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
RUN npm ci --include-workspace-root --workspace=@app/shared --workspace=@app/server
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
RUN npm run build -w @app/shared && npm run build -w @app/server

FROM node:24-bookworm-slim AS prod-deps
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
RUN npm ci --omit=dev --workspace=@app/shared --workspace=@app/server

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
COPY --chown=node:node --from=prod-deps /app/package.json ./package.json
COPY --chown=node:node --from=prod-deps /app/shared/package.json ./shared/package.json
COPY --chown=node:node --from=build /app/shared/dist ./shared/dist
COPY --chown=node:node --from=prod-deps /app/server/package.json ./server/package.json
COPY --chown=node:node --from=build /app/server/dist ./server/dist
COPY --chown=node:node --from=build /app/server/src/db/migrations ./server/src/db/migrations
USER node
ENV NODE_ENV=production
CMD ["sh", "-c", "node server/dist/db/migrate.js && exec node server/dist/index.js"]
