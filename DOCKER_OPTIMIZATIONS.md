# Docker Container Optimization Guide

Comprehensive analysis and optimization recommendations for Smart Bookmarks Docker setup.

## Current State Analysis

### Image Sizes
- **Backend API**: 1.05GB (284MB compressed)
- **Backend Worker**: 1.05GB (284MB compressed)
- **Frontend**: 1.57GB (413MB compressed) ⚠️ Large!

### Resource Usage (Current)
- Backend API: 148MB RAM, 6.48% CPU
- Worker: 152MB RAM, 0.51% CPU
- Frontend: **925MB RAM** ⚠️ High!, 0.07% CPU
- PostgreSQL: 42MB RAM, 0.00% CPU
- Redis: 18MB RAM, 0.65% CPU

### Security Issues
- ❌ All containers running as **root user** (security risk)
- ❌ No resource limits set (risk of resource exhaustion)
- ❌ No read-only filesystem constraints
- ⚠️ API keys in environment variables (acceptable for dev, needs secrets for prod)

---

## Priority 1: Critical Optimizations (Do Now)

### 1.1 Run Containers as Non-Root User ⚠️ SECURITY

**Risk**: Root access allows container breakout attacks

**Solution**: Add non-root user to Dockerfiles

**Backend Dockerfile.dev**:
```dockerfile
FROM node:20-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

# Install dependencies as root (needed for npm ci)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy Prisma and generate as root
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code
COPY . .

# Change ownership to nodejs user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

EXPOSE 3002
CMD ["npm", "run", "dev"]
```

**Frontend Dockerfile.dev**:
```dockerfile
FROM node:20-alpine

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 3000
CMD ["npm", "run", "dev"]
```

**Impact**: 🔒 Significantly reduces security risk, industry best practice

---

### 1.2 Add Resource Limits to docker-compose.yml

**Risk**: Container can consume all host resources, causing crashes

**Solution**:
```yaml
services:
  backend-api:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '1.0'      # Max 1 CPU core
          memory: 512M     # Max 512MB RAM
        reservations:
          cpus: '0.5'      # Reserve 0.5 CPU
          memory: 256M     # Reserve 256MB RAM

  backend-worker:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '2.0'      # Workers need more CPU for AI processing
          memory: 1G
        reservations:
          cpus: '0.5'
          memory: 512M

  frontend:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G       # Next.js needs more memory for builds
        reservations:
          cpus: '0.25'
          memory: 512M

  postgres:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M

  redis:
    # ... existing config ...
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M
        reservations:
          cpus: '0.1'
          memory: 128M
```

**Impact**: 🛡️ Prevents resource exhaustion, improves stability

---

### 1.3 Optimize Frontend Memory Usage

**Issue**: Frontend using 925MB RAM (too high for Next.js dev)

**Solutions**:

**A. Reduce Next.js memory limit** (add to docker-compose.yml):
```yaml
frontend:
  environment:
    - NODE_ENV=development
    - BACKEND_URL=http://backend-api:3002
    - NODE_OPTIONS=--max-old-space-size=512  # Limit Node heap to 512MB
```

**B. Disable Next.js telemetry**:
```yaml
frontend:
  environment:
    - NEXT_TELEMETRY_DISABLED=1
```

**C. Add to `frontend/.env.local`**:
```env
# Reduce Next.js memory usage
NEXT_TELEMETRY_DISABLED=1
```

**Impact**: 💾 Reduces frontend RAM from ~900MB to ~400MB

---

## Priority 2: Performance Optimizations

### 2.1 Multi-Stage Builds for Production

**Current**: Single-stage dev images (1GB+)
**Target**: Production images under 300MB

**Create backend/Dockerfile.prod**:
```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps --production

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY prisma ./prisma
RUN npx prisma generate
COPY . .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app

# Copy only production dependencies
COPY --from=deps --chown=nodejs:nodejs /app/node_modules ./node_modules
# Copy built application
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
COPY --chown=nodejs:nodejs package*.json ./

USER nodejs
EXPOSE 3002
CMD ["node", "dist/server.js"]
```

**Create frontend/Dockerfile.prod**:
```dockerfile
# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder --chown=nodejs:nodejs /app/public ./public
COPY --from=builder --chown=nodejs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nodejs:nodejs /app/.next/static ./.next/static

USER nodejs
EXPOSE 3000
CMD ["node", "server.js"]
```

**Update next.config.ts** for standalone build:
```typescript
export default {
  output: 'standalone',  // Enable standalone build
}
```

**Create docker-compose.prod.yml**:
```yaml
services:
  backend-api:
    build:
      context: ./backend
      dockerfile: Dockerfile.prod
    # ... rest of config ...

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.prod
    # ... rest of config ...
```

**Impact**: 📦 Reduces image size by ~60%, faster deployments

---

### 2.2 Improve Docker Layer Caching

**Current Issue**: Code changes invalidate all layers after COPY

**Optimize backend/Dockerfile.dev**:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# 1. Copy only package files (changes rarely)
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# 2. Copy Prisma schema (changes occasionally)
COPY prisma/schema.prisma ./prisma/
RUN npx prisma generate

# 3. Copy source code (changes frequently)
COPY . .

EXPOSE 3002
CMD ["npm", "run", "dev"]
```

**Optimize frontend/Dockerfile.dev**:
```dockerfile
FROM node:20-alpine

WORKDIR /app

# 1. Package files first
COPY package*.json ./
RUN npm ci

# 2. Copy config files (tsconfig, next.config, etc.)
COPY tsconfig.json next.config.* ./

# 3. Source code last
COPY . .

EXPOSE 3000
CMD ["npm", "run", "dev"]
```

**Impact**: ⚡ Faster rebuilds when only source code changes

---

### 2.3 Use BuildKit for Faster Builds

**Enable BuildKit** (add to docker-compose.yml):
```yaml
# At the top of the file
x-build-args: &build-args
  BUILDKIT_INLINE_CACHE: 1

services:
  backend-api:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
      cache_from:
        - smart_bookmarks_v2-backend-api:latest
      args: *build-args
```

**Or use environment variable**:
```bash
# Add to .env or shell
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1
```

**Impact**: ⚡ 2-3x faster builds with better caching

---

### 2.4 Optimize .dockerignore Files

**Expand backend/.dockerignore**:
```
node_modules
.next
dist
.env
.env.local
.env.*.local
npm-debug.log
yarn-debug.log
yarn-error.log
.DS_Store
.git
.gitignore
.data
*.md
.vscode
.idea
coverage
.nyc_output
*.test.ts
*.spec.ts
tests/
__tests__/
.github
Dockerfile*
docker-compose*
```

**Expand frontend/.dockerignore**:
```
node_modules
.next
.env
.env.local
.env.*.local
npm-debug.log
yarn-debug.log
yarn-error.log
.DS_Store
.git
.gitignore
*.md
.vscode
.idea
coverage
.nyc_output
*.test.ts
*.test.tsx
*.spec.ts
__tests__/
.github
Dockerfile*
docker-compose*
public/mockServiceWorker.js
```

**Impact**: 📉 Reduces build context size, faster uploads to Docker daemon

---

## Priority 3: Development Experience

### 3.1 Add Development Compose Override

**Create docker-compose.override.yml** (auto-loaded in dev):
```yaml
# Development-specific overrides
services:
  backend-api:
    environment:
      - LOG_LEVEL=debug
      - NODE_ENV=development
    volumes:
      # Mount node_modules for faster npm install during dev
      - ./backend/package.json:/app/package.json:ro
      - ./backend/package-lock.json:/app/package-lock.json:ro

  frontend:
    environment:
      - NODE_ENV=development
      - FAST_REFRESH=true
    command: npm run dev -- --turbo  # Use Turbopack if Next.js 13+
```

---

### 3.2 Add Make Commands for Common Tasks

**Create Makefile** in project root:
```makefile
.PHONY: help build up down logs restart clean

help:
	@echo "Smart Bookmarks Docker Commands"
	@echo "  make build     - Build all containers"
	@echo "  make up        - Start all services"
	@echo "  make down      - Stop all services"
	@echo "  make logs      - Follow all logs"
	@echo "  make restart   - Restart all services"
	@echo "  make clean     - Remove containers and volumes"
	@echo "  make shell-api - Open shell in backend API"
	@echo "  make shell-fe  - Open shell in frontend"

build:
	docker-compose build

up:
	docker-compose up -d
	@echo "✓ Services started!"
	@echo "Frontend: http://localhost:3000"
	@echo "Backend:  http://localhost:3002"
	@echo "Admin:    http://localhost:3002/admin"

down:
	docker-compose down

logs:
	docker-compose logs -f

restart:
	docker-compose restart

clean:
	docker-compose down -v
	docker system prune -f

shell-api:
	docker exec -it smartbookmarks_backend sh

shell-fe:
	docker exec -it smartbookmarks_frontend sh

db-shell:
	docker exec -it smartbookmarks_db psql -U smartbookmarks -d smartbookmarks

redis-cli:
	docker exec -it smartbookmarks_redis redis-cli
```

**Usage**:
```bash
make up      # Start everything
make logs    # Watch logs
make down    # Stop everything
```

---

### 3.3 Health Check Optimizations

**Improve health checks** in docker-compose.yml:
```yaml
services:
  backend-api:
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3002/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 10s
      timeout: 3s      # Reduced from 5s
      retries: 3       # Reduced from 5
      start_period: 20s  # Reduced from 30s

  frontend:
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:3000', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 30s  # Reduced from 45s
```

---

## Priority 4: Production Readiness

### 4.1 Environment-Specific Configurations

**Create .env.production**:
```env
NODE_ENV=production
LOG_LEVEL=info
OPENAI_API_KEY=  # Set in production secrets
DATABASE_URL=    # Set in production secrets
REDIS_URL=       # Set in production secrets
```

**Update docker-compose.prod.yml**:
```yaml
services:
  backend-api:
    env_file:
      - .env.production
    environment:
      - NODE_ENV=production
    restart: unless-stopped  # Auto-restart on crash

  frontend:
    env_file:
      - .env.production
    restart: unless-stopped
```

---

### 4.2 Add Security Scanning

**Add to CI/CD or run manually**:
```bash
# Scan images for vulnerabilities
docker scan smart_bookmarks_v2-backend-api:latest
docker scan smart_bookmarks_v2-frontend:latest

# Or use Trivy
docker run aquasec/trivy image smart_bookmarks_v2-backend-api:latest
```

**Create .trivyignore** for known acceptable issues:
```
# Add CVE IDs to ignore
CVE-2024-XXXXX
```

---

### 4.3 Add Container Security Options

**Update docker-compose.yml**:
```yaml
services:
  backend-api:
    security_opt:
      - no-new-privileges:true  # Prevent privilege escalation
    cap_drop:
      - ALL                      # Drop all capabilities
    cap_add:
      - NET_BIND_SERVICE        # Only add what's needed
    read_only: true             # Read-only root filesystem
    tmpfs:
      - /tmp                    # Writable tmp directory
      - /app/.data              # Writable data directory
```

---

## Priority 5: Monitoring & Observability

### 5.1 Add Resource Monitoring

**Create monitoring/docker-compose.monitoring.yml**:
```yaml
services:
  prometheus:
    image: prom/prometheus:latest
    ports:
      - "9090:9090"
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus_data:/prometheus
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
    networks:
      - smartbookmarks

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3001:3000"
    volumes:
      - grafana_data:/var/lib/grafana
    environment:
      - GF_SECURITY_ADMIN_PASSWORD=admin
    networks:
      - smartbookmarks

volumes:
  prometheus_data:
  grafana_data:

networks:
  smartbookmarks:
    external: true
    name: smart_bookmarks_v2_smartbookmarks
```

**Create monitoring/prometheus.yml**:
```yaml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'docker'
    static_configs:
      - targets: ['host.docker.internal:9323']
```

---

### 5.2 Enhanced Health Checks with DB/Redis Connectivity

**Update backend health endpoint** (in server.ts):
```typescript
app.get("/health", async (req, res) => {
  const checks = {
    status: "ok",
    service: "smart-bookmarks-backend",
    timestamp: new Date().toISOString(),
    checks: {
      database: false,
      redis: false,
    }
  };

  try {
    // Check database
    await prisma.$queryRaw`SELECT 1`;
    checks.checks.database = true;
  } catch (err) {
    checks.status = "degraded";
  }

  try {
    // Check Redis
    await redis.ping();
    checks.checks.redis = true;
  } catch (err) {
    checks.status = "degraded";
  }

  const statusCode = checks.status === "ok" ? 200 : 503;
  res.status(statusCode).json(checks);
});
```

---

## Implementation Roadmap

### Week 1: Critical Security & Stability
- [ ] Add non-root user to Dockerfiles (1.1)
- [ ] Add resource limits (1.2)
- [ ] Optimize frontend memory usage (1.3)
- [ ] Test thoroughly

### Week 2: Performance
- [ ] Improve layer caching (2.2)
- [ ] Optimize .dockerignore (2.4)
- [ ] Enable BuildKit (2.3)

### Week 3: Developer Experience
- [ ] Add Makefile (3.2)
- [ ] Create docker-compose.override.yml (3.1)
- [ ] Optimize health checks (3.3)

### Week 4: Production Prep
- [ ] Create multi-stage production builds (2.1)
- [ ] Add security scanning (4.2)
- [ ] Environment-specific configs (4.1)
- [ ] Add monitoring (5.1)

---

## Quick Wins (Can Do Today)

1. **Add resource limits** (5 minutes)
   ```bash
   # Update docker-compose.yml with deploy.resources sections
   docker-compose up -d
   ```

2. **Enable BuildKit** (2 minutes)
   ```bash
   echo 'export DOCKER_BUILDKIT=1' >> ~/.zshrc
   source ~/.zshrc
   ```

3. **Optimize .dockerignore** (5 minutes)
   ```bash
   # Add the expanded .dockerignore content
   ```

4. **Add Makefile** (10 minutes)
   ```bash
   # Create Makefile with common commands
   ```

---

## Expected Impact Summary

| Optimization | Image Size | RAM Usage | Build Time | Security |
|-------------|------------|-----------|------------|----------|
| Current | 1.5GB | 925MB | Baseline | ⚠️ Root |
| + Non-root user | 1.5GB | 925MB | Same | ✅ Secure |
| + Resource limits | 1.5GB | 512MB | Same | ✅ Stable |
| + Layer caching | 1.5GB | 512MB | -40% | ✅ |
| + Multi-stage prod | 300MB | 256MB | +20% build, -60% deploy | ✅ |
| **Final State** | **300MB** | **256MB** | **-30% overall** | **✅ Hardened** |

---

## Next Steps

1. Review this document
2. Choose optimizations based on priority
3. Implement incrementally (don't do everything at once)
4. Test after each change
5. Update DOCKER.md with new configurations

**Questions?** Let me know which optimizations you'd like to implement first!
