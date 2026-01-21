# Smart Bookmarks - Production Deployment Guide

Complete Docker deployment guide for production environments. This guide covers deployment to a single VPS/server using Docker Compose (no Kubernetes required).

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Initial Setup](#initial-setup)
4. [Deployment](#deployment)
5. [Post-Deployment](#post-deployment)
6. [Maintenance](#maintenance)
7. [Monitoring](#monitoring)
8. [Troubleshooting](#troubleshooting)
9. [Security Best Practices](#security-best-practices)
10. [Rollback Procedures](#rollback-procedures)

---

## Overview

### Architecture

Smart Bookmarks runs 7 Docker containers in production:

| Container | Purpose | Resource Limits |
|-----------|---------|-----------------|
| **postgres** | PostgreSQL 16 + pgvector | 2 CPU, 2GB RAM |
| **redis** | Cache + job queue | 1 CPU, 768MB RAM |
| **backend-api** | Express REST API | 2 CPU, 1GB RAM |
| **backend-worker** | Enrichment processing | 1.5 CPU, 768MB RAM |
| **graph-worker** | Graph processing | 1.5 CPU, 768MB RAM |
| **frontend** | Next.js application | 1 CPU, 512MB RAM |
| **caddy** | Reverse proxy + SSL | 0.5 CPU, 256MB RAM |

**Total Resources**: ~8.5 CPUs, ~5.3GB RAM (recommended minimum: 4 vCPUs, 8GB RAM)

### Network Architecture

```
Internet → Caddy (SSL termination)
            ├─→ Frontend (port 3000) → Internal network
            └─→ Backend API (port 3002) → Internal network
                  ├─→ PostgreSQL (internal only)
                  ├─→ Redis (internal only)
                  ├─→ Backend Worker (internal only)
                  └─→ Graph Worker (internal only)
```

**Security**: Database and Redis are NOT exposed to the internet.

---

## Prerequisites

### Server Requirements

**Minimum Specifications:**
- 4 vCPU cores
- 8GB RAM
- 50GB SSD storage
- Ubuntu 22.04 LTS or Debian 12

**Recommended Specifications:**
- 8 vCPU cores
- 16GB RAM
- 100GB SSD storage

### Software Requirements

1. **Docker Engine** (v24.0+)
2. **Docker Compose** v2
3. **Git**
4. **Make** (optional but recommended)

### Domain & DNS

- Domain name pointing to server IP
- DNS A record: `yourdomain.com` → `YOUR_SERVER_IP`
- DNS A record: `api.yourdomain.com` → `YOUR_SERVER_IP` (optional, can use subpath)

---

## Initial Setup

### 1. Install Docker

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### 2. Clone Repository

```bash
# Create application directory
sudo mkdir -p /opt/smartbookmarks
sudo chown $USER:$USER /opt/smartbookmarks

# Clone repository
cd /opt/smartbookmarks
git clone https://github.com/yourusername/smart_bookmarks_v2.git .
```

### 3. Generate Secrets

```bash
# Generate all secrets
make secrets-generate

# Or manually:
mkdir -p secrets
chmod 700 secrets

# PostgreSQL password
openssl rand -base64 32 > secrets/postgres_password.txt

# JWT secrets
openssl rand -base64 64 > secrets/jwt_secret.txt
openssl rand -base64 64 > secrets/jwt_refresh_secret.txt

# Add OpenAI API key
echo "sk-YOUR_OPENAI_API_KEY" > secrets/openai_api_key.txt

# Secure secrets
chmod 600 secrets/*
```

### 4. Configure Environment

```bash
# Copy environment template
cp .env.production.example .env.production

# Edit configuration
nano .env.production
```

**Critical settings to change:**

```bash
# Your domain
DOMAIN=yourdomain.com
SSL_EMAIL=admin@yourdomain.com

# Public API URL (must match domain)
NEXT_PUBLIC_API_URL=https://yourdomain.com

# Optional: Adjust worker concurrency based on server resources
ENRICHMENT_WORKER_CONCURRENCY=5
GRAPH_WORKER_CONCURRENCY=3
```

### 5. Build Images

```bash
# Build both images
make build

# Or build individually
make build-backend
make build-frontend
```

**Expected build times:**
- Backend: 3-5 minutes
- Frontend: 5-8 minutes

**Expected image sizes:**
- Backend: ~250-300MB
- Frontend: ~350-400MB

---

## Deployment

### Automated Deployment (Recommended)

```bash
# Run automated deployment script
./scripts/deploy.sh
```

This script will:
1. Check prerequisites
2. Backup database
3. Build images
4. Deploy services sequentially
5. Run migrations
6. Verify deployment
7. Show status

### Manual Deployment

```bash
# 1. Start database and Redis
make start

# 2. Wait for health checks (30-60 seconds)
make health

# 3. Run database migrations
make db-migrate

# 4. Verify all services are healthy
make health
```

---

## Post-Deployment

### 1. Verify Services

```bash
# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Expected output: All services "healthy"
```

### 2. Test Endpoints

```bash
# Test backend health
curl https://yourdomain.com/api/health

# Expected: {"status":"ok"}

# Test frontend
curl -I https://yourdomain.com

# Expected: HTTP/2 200
```

### 3. Check SSL Certificate

```bash
# View certificate
curl -vI https://yourdomain.com 2>&1 | grep -i "SSL certificate"

# Or use online tool:
# https://www.ssllabs.com/ssltest/
```

### 4. Create Admin User

```bash
# Access backend container
make shell-backend

# Create user via API or database
# (Add your user creation script here)
```

### 5. Initial Data Seeding (Optional)

```bash
# Run backfill for existing users
docker compose -f docker-compose.prod.yml exec backend-api npm run backfill
```

---

## Maintenance

### Daily Tasks

**Automated backups** (add to crontab):

```bash
# Backup database daily at 2 AM
0 2 * * * cd /opt/smartbookmarks && make backup
```

### Weekly Tasks

1. **Review logs**:
   ```bash
   make logs-backend
   make logs-worker
   ```

2. **Check resource usage**:
   ```bash
   make stats
   ```

3. **Review security scans** (GitHub Actions runs automatically)

### Monthly Tasks

1. **Update dependencies**:
   ```bash
   # Backend
   cd backend
   npm audit
   npm update

   # Frontend
   cd frontend
   npm audit
   npm update
   ```

2. **Update base images**:
   ```bash
   docker pull node:20-alpine
   docker pull pgvector/pgvector:pg16
   docker pull redis:7-alpine
   docker pull caddy:2-alpine
   ```

3. **Prune old backups**:
   ```bash
   # Keep only last 30 days
   find backups/ -name "*.dump" -mtime +30 -delete
   ```

### Updating Application

```bash
# 1. Backup first
make backup

# 2. Pull latest code
git pull origin main

# 3. Rebuild and deploy
make deploy-prod

# 4. Verify
make health
```

---

## Monitoring

### Container Health

```bash
# Real-time health status
make health

# Container stats
make stats

# Detailed container info
docker compose -f docker-compose.prod.yml ps
```

### Logs

```bash
# Tail all logs
make logs-tail

# Specific service logs
make logs-backend
make logs-worker
make logs-frontend
make logs-caddy

# Last 100 lines
docker compose -f docker-compose.prod.yml logs --tail=100 backend-api
```

### Database Monitoring

```bash
# PostgreSQL shell
make db-shell

# Query slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

# Check database size
SELECT pg_size_pretty(pg_database_size('smartbookmarks'));

# Check table sizes
SELECT schemaname, tablename, pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename))
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Redis Monitoring

```bash
# Redis CLI
make redis-shell

# Show stats
INFO stats

# Monitor commands
MONITOR

# Check memory usage
INFO memory

# List queue lengths
LLEN bull:graph-entities:wait
LLEN bull:graph-clustering:wait
```

### Resource Monitoring

```bash
# Container resource usage
docker stats --no-stream

# Disk usage
df -h
docker system df

# Memory usage
free -h

# CPU usage
top
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
make logs

# Check specific service
docker compose -f docker-compose.prod.yml logs backend-api

# Verify secrets exist
make secrets-check

# Verify configuration
docker compose -f docker-compose.prod.yml config
```

### High Memory Usage

```bash
# Check container stats
make stats

# Restart specific service
make restart-backend
make restart-frontend

# Adjust resource limits in docker-compose.prod.yml
```

### Database Connection Issues

```bash
# Check PostgreSQL status
docker compose -f docker-compose.prod.yml exec postgres pg_isready -U smartbookmarks

# Check connections
docker compose -f docker-compose.prod.yml exec postgres psql -U smartbookmarks -d smartbookmarks -c "SELECT count(*) FROM pg_stat_activity;"

# Restart database (will cause downtime)
docker compose -f docker-compose.prod.yml restart postgres
```

### SSL Certificate Issues

```bash
# Check Caddy logs
make logs-caddy

# Force certificate renewal
docker compose -f docker-compose.prod.yml exec caddy caddy reload --config /etc/caddy/Caddyfile

# Check certificate status
docker compose -f docker-compose.prod.yml exec caddy caddy list-modules
```

### Worker Queue Backlog

```bash
# Check queue lengths
make redis-shell
# Then in Redis:
LLEN bull:graph-entities:wait
LLEN bull:graph-clustering:wait

# Scale workers (adjust in docker-compose.prod.yml)
# Increase WORKER_CONCURRENCY environment variable

# Restart workers
docker compose -f docker-compose.prod.yml restart backend-worker graph-worker
```

### Out of Disk Space

```bash
# Check disk usage
df -h
docker system df

# Clean up old images and containers
make clean

# Prune old backups
find backups/ -name "*.dump" -mtime +30 -delete

# Prune Docker system
docker system prune -a --volumes
```

---

## Security Best Practices

### 1. Secrets Management

- **NEVER** commit secrets to git
- Rotate secrets every 90 days
- Use strong random values (32+ bytes)
- Set proper file permissions (600)

```bash
# Rotate JWT secrets
openssl rand -base64 64 > secrets/jwt_secret.txt
openssl rand -base64 64 > secrets/jwt_refresh_secret.txt
chmod 600 secrets/*.txt

# Restart services
make restart
```

### 2. Firewall Configuration

```bash
# Install UFW
sudo apt install ufw

# Allow SSH (change 22 to your port)
sudo ufw allow 22/tcp

# Allow HTTP/HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw enable

# Verify
sudo ufw status
```

### 3. Regular Updates

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Update Docker images
make pull
make restart

# Check for vulnerabilities (GitHub Actions does this automatically)
```

### 4. Database Security

- PostgreSQL is NOT exposed externally (no port mapping)
- Use strong passwords (32+ characters)
- Enable SSL connections (optional, for RDS/managed databases)

### 5. Rate Limiting

Rate limiting is configured at two levels:

1. **Caddy** (reverse proxy) - protects against DDoS
2. **Backend API** (application) - protects against abuse

Adjust in `backend/src/middleware/rateLimiter.ts` and Caddyfile.

### 6. Monitoring & Alerts

Set up alerts for:
- High memory usage (>80%)
- High CPU usage (>90%)
- Disk space low (<10% free)
- Service health check failures
- SSL certificate expiry (<30 days)

---

## Rollback Procedures

### Quick Rollback (Same Database Schema)

```bash
# 1. Stop current deployment
make stop

# 2. Checkout previous version
git checkout <previous-commit>

# 3. Rebuild images
make build

# 4. Start services
make start

# 5. Verify
make health
```

### Full Rollback (Database Migration Required)

```bash
# 1. Stop services
make stop

# 2. Restore database from backup
make restore

# 3. Checkout previous version
git checkout <previous-commit>

# 4. Rebuild and restart
make build
make start

# 5. Verify
make health
```

### Emergency Rollback (Fast)

```bash
# Pull last known good images from registry
docker pull smartbookmarks/backend:previous-version
docker pull smartbookmarks/frontend:previous-version

# Tag as latest
docker tag smartbookmarks/backend:previous-version smartbookmarks/backend:latest
docker tag smartbookmarks/frontend:previous-version smartbookmarks/frontend:latest

# Restart
make restart
```

---

## Backup & Restore

### Manual Backup

```bash
# Create backup
make backup

# Backups stored in: backups/smartbookmarks_YYYYMMDD_HHMMSS.dump
```

### Automated Backups

Add to crontab:

```bash
crontab -e

# Add this line:
0 2 * * * cd /opt/smartbookmarks && make backup > /dev/null 2>&1
```

### Restore from Backup

```bash
# Restore latest backup
make restore

# Restore specific backup
BACKUP_FILE=backups/smartbookmarks_20250103_020000.dump
docker compose -f docker-compose.prod.yml exec -T postgres pg_restore -U smartbookmarks -d smartbookmarks -c < $BACKUP_FILE
```

### Offsite Backup

```bash
# Sync backups to S3 (example)
aws s3 sync backups/ s3://your-bucket/smartbookmarks-backups/

# Or use rsync to another server
rsync -avz backups/ user@backup-server:/backups/smartbookmarks/
```

---

## Common Commands Cheatsheet

| Task | Command |
|------|---------|
| Start all services | `make start` |
| Stop all services | `make stop` |
| Restart all services | `make restart` |
| View logs | `make logs-tail` |
| Check health | `make health` |
| Build images | `make build` |
| Deploy production | `make deploy-prod` |
| Backup database | `make backup` |
| Restore database | `make restore` |
| Run migrations | `make db-migrate` |
| Shell into backend | `make shell-backend` |
| PostgreSQL shell | `make db-shell` |
| Redis shell | `make redis-shell` |
| Clear cache | `make redis-flush` |
| Resource stats | `make stats` |
| Clean up | `make clean` |

---

## Support & Resources

- **Documentation**: `/docs/`
- **Issues**: GitHub Issues
- **Logs**: `make logs-tail`
- **Health Check**: `https://yourdomain.com/api/health`

---

## License

MIT License - See LICENSE file for details
