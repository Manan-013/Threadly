# Stage 1: Build dashboard frontend
FROM node:22-alpine AS dashboard-builder
WORKDIR /app/dashboard
COPY dashboard/package*.json ./
RUN npm ci
COPY dashboard/ ./
RUN npm run build

# Stage 2: Production runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4000

# Install backend dependencies
COPY backend/package*.json ./backend/
WORKDIR /app/backend
RUN npm ci --omit=dev

# Copy backend source & assets
COPY backend/src ./src
COPY backend/.env.example ./.env.example

# Copy compiled dashboard distribution from Stage 1
COPY --from=dashboard-builder /app/dashboard/dist /app/dashboard/dist

# Expose server port
EXPOSE 4000

# Persistent SQLite database volume
VOLUME ["/app/backend/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/api/bootstrap || exit 1

# Start production server
CMD ["node", "src/server.js"]
