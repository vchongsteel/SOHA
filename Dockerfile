FROM node:26-bookworm-slim AS frontend
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:26-bookworm-slim AS app
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 STATIC_DIR=/app/public
COPY backend/ ./backend/
WORKDIR /app/backend
RUN npm install --omit=dev
COPY --from=frontend /build/frontend/dist/frontend/browser /app/public
EXPOSE 3001
CMD ["node", "server.mjs"]
