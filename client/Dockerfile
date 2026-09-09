# --- build stage -----------------------------------------------------------
FROM node:20-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Baked into the static build at build time — Vite inlines env vars into
# the bundle, they can't be changed at container runtime. Defaults to a
# relative path so the browser calls the same origin it's served from,
# and nginx (below) proxies that through to the server container —
# meaning there's no cross-origin request at all in this setup, unlike
# local dev (Vite on :5173 talking to Express on :5000).
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- production stage -------------------------------------------------------
FROM nginx:1.27-alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
