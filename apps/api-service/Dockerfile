# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api-service/package.json apps/api-service/package.json
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/api-service ./apps/api-service
WORKDIR /app/apps/api-service
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/api-service/dist ./dist
COPY --from=builder /app/apps/api-service/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/main.js"]
