# Imagen de la API de StockLab (Express + Prisma).
# Build: docker build -t stocklab-api:<version> server

FROM node:24-bookworm-slim AS base
# Prisma necesita OpenSSL para detectar y cargar sus motores.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV CHECKPOINT_DISABLE=1 \
    PRISMA_HIDE_UPDATE_MESSAGE=1

# 1) Compilación (con devDependencies)
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2) Solo dependencias de producción (incluye el CLI de Prisma para migrar)
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev \
    && node_modules/.bin/prisma generate \
    && npm cache clean --force

# 3) Runtime
FROM base AS runtime
ENV NODE_ENV=production
COPY package.json ./
COPY prisma ./prisma
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]
