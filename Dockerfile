# syntax=docker/dockerfile:1.6
#
# chora-kiosk-web Dockerfile — the kiosk edition's Angular 21 SPA.
#
# Multi-stage: node:24-alpine builds the production bundle, nginx:alpine
# serves it and reverse-proxies /api and /bff to the chora-gateway edge.
#
# Build context = this repository. The app has no monorepo dependencies —
# everything resolves from npm.

ARG NODE_VERSION=24-alpine
ARG NGINX_VERSION=alpine
ARG GIT_SHA=unknown
ARG BUILD_TIME=unknown

############################
# Stage 1 — build
############################
FROM node:${NODE_VERSION} AS builder

ARG GIT_SHA
ARG BUILD_TIME

WORKDIR /src

# Install dependencies first for better layer caching.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Build the bundle. kiosk-web's angular.json defaults to the production
# configuration, so `npm run build` needs no --configuration flag.
COPY . .
RUN npm run build

############################
# Stage 2 — runtime
############################
FROM nginx:${NGINX_VERSION}

ARG GIT_SHA
ARG BUILD_TIME

LABEL org.opencontainers.image.title="chora-kiosk-web" \
      org.opencontainers.image.source="https://github.com/apollo-chora/chora-kiosk-web" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.created="${BUILD_TIME}" \
      org.opencontainers.image.vendor="Chora Platform" \
      org.opencontainers.image.licenses="UNLICENSED"

# SPA config: serve the bundle, reverse-proxy /api and /bff to the gateway.
COPY nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /src/dist/kiosk-web/browser /usr/share/nginx/html

EXPOSE 8080

# nginx's default entrypoint runs the master process in the foreground.
