FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm ci
COPY tsconfig.base.json ./
COPY shared ./shared
COPY server ./server
RUN npm run build -w @app/shared && npm run build -w @app/server

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg poppler-utils && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/shared/package.json ./shared/package.json
COPY --from=build /app/shared/dist ./shared/dist
COPY --from=build /app/server/package.json ./server/package.json
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/src/db/migrations ./server/src/db/migrations
ENV NODE_ENV=production
CMD ["node", "server/dist/index.js"]
