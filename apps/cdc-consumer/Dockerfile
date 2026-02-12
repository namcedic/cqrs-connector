# syntax=docker/dockerfile:1

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/cdc-consumer/package.json apps/cdc-consumer/package.json
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/cdc-consumer ./apps/cdc-consumer
WORKDIR /app/apps/cdc-consumer
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/apps/cdc-consumer/dist ./dist
COPY --from=builder /app/apps/cdc-consumer/package.json ./package.json
EXPOSE 3001
CMD ["node", "dist/main.js"]
