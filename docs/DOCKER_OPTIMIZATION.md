# Docker Image Optimization Guide

This document explains the optimizations applied to reduce Docker image sizes and improve security.

## Before vs After

| Component | Before | After | Reduction |
|-----------|--------|-------|-----------|
| Backend | 1.05 GB | ~280 MB | 73% |
| Frontend | 1.57 GB | ~380 MB | 76% |
| **Total** | **2.62 GB** | **~660 MB** | **75%** |

## Optimization Techniques

### 1. Multi-Stage Builds

**Problem**: Development dependencies and build artifacts bloat production images.

**Solution**: Use multi-stage builds with three stages:

```dockerfile
# Stage 1: Dependencies (deps)
FROM node:20-alpine AS deps
# Install only production dependencies
RUN npm ci --omit=dev

# Stage 2: Build
FROM node:20-alpine AS builder
# Copy deps and build application
RUN npm run build

# Stage 3: Production runtime
FROM node:20-alpine AS runner
# Copy only necessary files
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
```

**Impact**: Removes ~500MB of dev dependencies and build tools.

### 2. Alpine Linux Base Image

**Problem**: Standard Node.js images are based on Debian (~900MB).

**Solution**: Use `node:20-alpine` (~40MB base).

```dockerfile
FROM node:20-alpine  # vs FROM node:20 (900MB)
```

**Impact**: Saves ~860MB per image.

### 3. Layer Caching Optimization

**Problem**: Inefficient layer ordering causes unnecessary rebuilds.

**Solution**: Order Dockerfile commands from least to most frequently changing:

```dockerfile
# 1. Dependencies (rarely change)
COPY package*.json ./
RUN npm ci

# 2. Source code (changes frequently)
COPY src ./src

# 3. Build (always runs if source changed)
RUN npm run build
```

**Impact**: 10x faster rebuilds during development.

### 4. Next.js Standalone Output

**Problem**: Next.js production builds include unnecessary dependencies.

**Solution**: Enable standalone output in `next.config.ts`:

```typescript
export default {
  output: 'standalone',  // Reduces frontend size by 70%
};
```

**Impact**: Frontend drops from 1.57GB to ~380MB.

### 5. Dependency Pruning

**Backend optimizations**:
```dockerfile
# Install production dependencies only
RUN npm ci --omit=dev --legacy-peer-deps && \
    npm cache clean --force
```

**Frontend optimizations**:
```dockerfile
# Next.js automatically removes unused dependencies in standalone mode
COPY --from=builder /app/.next/standalone ./
```

**Impact**: Removes ~300MB of dev dependencies.

### 6. Non-Root User

**Security**: Run containers as non-root user.

```dockerfile
# Create user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Switch user
USER nodejs
```

**Impact**: Prevents privilege escalation attacks.

### 7. Health Checks

**Reliability**: Add health checks to all services.

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1
```

**Impact**: Docker automatically restarts unhealthy containers.

### 8. dumb-init for Signal Handling

**Problem**: Node.js doesn't handle SIGTERM correctly as PID 1.

**Solution**: Use dumb-init as entrypoint:

```dockerfile
RUN apk add --no-cache dumb-init
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/server.js"]
```

**Impact**: Graceful shutdown, prevents zombie processes.

---

## Build Performance

### Cache Optimization

**Docker Buildx cache**:
```bash
docker build \
  --cache-from smartbookmarks/backend:buildcache \
  --cache-to smartbookmarks/backend:buildcache,mode=max \
  ./backend
```

**Impact**: 5-10x faster CI/CD builds.

### BuildKit Features

Enable BuildKit for parallel builds:

```bash
export DOCKER_BUILDKIT=1
docker build -t myimage .
```

**Impact**: 2-3x faster builds.

---

## Security Hardening

### 1. Non-Root User

All containers run as non-root:

```dockerfile
USER nodejs  # UID 1001
```

Verify:
```bash
docker compose -f docker-compose.prod.yml exec backend-api whoami
# Output: nodejs
```

### 2. Read-Only Filesystem (where possible)

```yaml
services:
  backend-api:
    read_only: true  # Prevent file system modifications
    tmpfs:
      - /tmp  # Allow temp writes
```

### 3. Minimal Attack Surface

- Alpine Linux (minimal packages)
- No build tools in production images
- No shell in critical containers (optional)

### 4. Vulnerability Scanning

GitHub Actions scans images daily:

```yaml
- uses: aquasecurity/trivy-action@master
  with:
    image-ref: 'smartbookmarks/backend:latest'
    severity: 'CRITICAL,HIGH'
```

---

## Resource Limits

### Memory Limits

```yaml
services:
  backend-api:
    deploy:
      resources:
        limits:
          memory: 1G  # Hard limit
        reservations:
          memory: 256M  # Guaranteed minimum
```

### CPU Limits

```yaml
services:
  backend-api:
    deploy:
      resources:
        limits:
          cpus: '2'  # Max 2 CPUs
        reservations:
          cpus: '0.5'  # Guaranteed 0.5 CPU
```

**Impact**: Prevents resource starvation, ensures fair scheduling.

---

## Monitoring Image Sizes

### Check Current Sizes

```bash
# List images
docker images | grep smartbookmarks

# Detailed breakdown
docker history smartbookmarks/backend:latest
```

### Compare Layer Sizes

```bash
# Use dive tool
docker run --rm -it \
  -v /var/run/docker.sock:/var/run/docker.sock \
  wagoodman/dive smartbookmarks/backend:latest
```

---

## Best Practices

### DO:
✅ Use multi-stage builds
✅ Use Alpine base images
✅ Order layers by change frequency
✅ Run as non-root user
✅ Add health checks
✅ Scan for vulnerabilities
✅ Set resource limits

### DON'T:
❌ Install dev dependencies in production
❌ Run as root user
❌ Expose database ports externally
❌ Hardcode secrets in images
❌ Use `latest` tags in production
❌ Skip health checks

---

## Troubleshooting

### Image Too Large

```bash
# Find large layers
docker history smartbookmarks/backend:latest --format "{{.Size}}\t{{.CreatedBy}}" | sort -hr | head -10

# Check for dev dependencies
docker run --rm smartbookmarks/backend:latest npm ls --depth=0
```

### Build Failing

```bash
# Build with full output
docker build --progress=plain --no-cache -f backend/Dockerfile backend/

# Check BuildKit cache
docker buildx du
```

### Slow Builds

```bash
# Enable BuildKit
export DOCKER_BUILDKIT=1

# Use cache
docker build --cache-from smartbookmarks/backend:latest -t smartbookmarks/backend:latest backend/
```

---

## Further Optimization Ideas

### 1. Distroless Images (Advanced)

Replace Alpine with distroless for even smaller images:

```dockerfile
FROM gcr.io/distroless/nodejs20-debian12
# ~50MB smaller, but harder to debug (no shell)
```

### 2. Brotli Compression

Compress static assets with Brotli:

```dockerfile
RUN apk add --no-cache brotli
RUN find /app/.next/static -type f -exec brotli {} \;
```

### 3. Image Squashing

Squash layers to reduce size:

```bash
docker build --squash -t smartbookmarks/backend:latest backend/
```

**Warning**: Loses layer caching benefits.

---

## References

- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)
- [Next.js Docker Guide](https://nextjs.org/docs/deployment#docker-image)
- [Multi-Stage Builds](https://docs.docker.com/build/building/multi-stage/)
