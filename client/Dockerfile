# Build estático del frontend de StockLab. Se exporta con:
#   docker build -f client/Dockerfile --target frontend \
#     --output "type=local,dest=<WEB_ROOT>/dist.new" client

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM scratch AS frontend
COPY --from=build /app/dist /
