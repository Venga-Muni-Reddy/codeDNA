# Stage 1: Build React Frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
COPY frontend/package*.json ./frontend/
RUN npm ci --workspace=frontend --legacy-peer-deps
COPY frontend/ ./frontend/
RUN npm run build:frontend --workspace=frontend

# Stage 2: Build Express Backend
FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci --workspace=backend --legacy-peer-deps
COPY backend/ ./backend/
RUN npm run build:backend --workspace=backend

# Stage 3: Production Runtime environment
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm ci --omit=dev --workspace=backend --legacy-peer-deps

# Copy compiled resources
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

EXPOSE 5000
CMD ["npm", "start", "--workspace=backend"]
