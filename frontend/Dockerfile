# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS build

WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine

ARG ASTRA_VERSION=dev
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Astra GRC Community Edition Frontend" \
      org.opencontainers.image.version="${ASTRA_VERSION}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.source="https://github.com/astra-ssj/The-Cortex"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html

USER 101:101
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/health || exit 1
