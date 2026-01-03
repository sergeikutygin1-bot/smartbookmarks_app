# Production Dockerfile for Smart Bookmarks Backend
# Multi-stage build optimized for size and security
# Target: <300MB final image

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev --legacy-peer-deps && \
    npm cache clean --force

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package*.json ./

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY src ./src
COPY tsconfig.json ./

# Build TypeScript
RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init wget

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=deps --chown=nodejs:nodejs /app/package*.json ./

# Copy Prisma schema and generated client
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nodejs:nodejs /app/node_modules/.prisma ./node_modules/.prisma

# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Copy scripts for runtime utilities (backfill, etc)
COPY --from=builder --chown=nodejs:nodejs /app/src ./src

# Set NODE_ENV to production
ENV NODE_ENV=production \
    PORT=3002

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command (can be overridden for workers)
CMD ["node", "dist/server.js"]
