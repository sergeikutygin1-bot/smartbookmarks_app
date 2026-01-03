# Smart Bookmarks - Production Deployment Quick Start

**IMPORTANT**: This guide is for production deployment on a single VPS/server using Docker Compose. For full documentation, see [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Prerequisites

- VPS/Server with 4+ vCPUs, 8GB+ RAM, 50GB+ SSD
- Ubuntu 22.04 LTS or Debian 12
- Domain name pointing to server IP
- OpenAI API key

## Quick Start (5 Steps)

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
```

### 2. Clone & Setup

```bash
# Clone repository
git clone https://github.com/yourusername/smart_bookmarks_v2.git
cd smart_bookmarks_v2

# Generate secrets
./scripts/setup-secrets.sh

# Configure environment
cp .env.production.example .env.production
nano .env.production  # Edit DOMAIN, SSL_EMAIL, etc.
```

### 3. Build Images

```bash
# Build production images
make build

# Expected: Backend ~280MB, Frontend ~380MB
# Build time: 5-10 minutes
```

### 4. Deploy

```bash
# Automated deployment with health checks
./scripts/deploy.sh

# Or manual deployment
make deploy-prod
```

### 5. Verify

```bash
# Check health
make health

# View logs
make logs-tail

# Test endpoints
curl https://yourdomain.com/api/health
```

**Done!** Application is now running at `https://yourdomain.com`

---

## Architecture

```
Internet → Caddy (SSL) → Frontend (Next.js) + Backend API
                            ↓                    ↓
                         PostgreSQL + Redis + Workers
```

### Services

| Service | Purpose | Resources |
|---------|---------|-----------|
| **Caddy** | Reverse proxy + SSL | 0.5 CPU, 256MB |
| **Frontend** | Next.js UI | 1 CPU, 512MB |
| **Backend API** | Express REST API | 2 CPU, 1GB |
| **Backend Worker** | Enrichment jobs | 1.5 CPU, 768MB |
| **Graph Worker** | Graph processing | 1.5 CPU, 768MB |
| **PostgreSQL** | Database + pgvector | 2 CPU, 2GB |
| **Redis** | Cache + job queue | 1 CPU, 768MB |

**Total**: ~8.5 CPUs, ~5.3GB RAM

---

## Security Features

✅ **Non-root containers** - All services run as unprivileged users
✅ **No exposed database ports** - PostgreSQL/Redis internal only
✅ **Docker secrets** - Sensitive data never in environment variables
✅ **Automatic SSL** - Let's Encrypt via Caddy
✅ **Resource limits** - Prevents resource exhaustion
✅ **Health checks** - Automatic restart on failure
✅ **Image scanning** - Trivy scans for vulnerabilities
✅ **Read-only filesystem** - Where possible

---

## Common Commands

| Task | Command |
|------|---------|
| **Start all services** | `make start` |
| **Stop all services** | `make stop` |
| **Restart services** | `make restart` |
| **View logs** | `make logs-tail` |
| **Check health** | `make health` |
| **Backup database** | `make backup` |
| **Restore database** | `make restore` |
| **Run migrations** | `make db-migrate` |
| **PostgreSQL shell** | `make db-shell` |
| **Redis shell** | `make redis-shell` |
| **Clear cache** | `make redis-flush` |
| **Resource stats** | `make stats` |

---

## Daily Operations

### Monitoring

```bash
# Check service health
make health

# View resource usage
make stats

# View logs
make logs-backend
make logs-worker
```

### Backups

```bash
# Manual backup
make backup

# Automated daily backup (add to crontab)
0 2 * * * cd /opt/smartbookmarks && make backup
```

### Updates

```bash
# Pull latest code
git pull origin main

# Rebuild and deploy
make deploy-prod

# Verify
make health
```

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs
make logs

# Verify secrets
make secrets-check

# Restart service
make restart-backend  # or restart-frontend
```

### High Memory Usage

```bash
# Check stats
make stats

# Restart workers
docker compose -f docker-compose.prod.yml restart backend-worker graph-worker
```

### Database Issues

```bash
# Check database health
docker compose -f docker-compose.prod.yml exec postgres pg_isready

# Run migrations
make db-migrate

# Restore from backup
make restore
```

### SSL Certificate Issues

```bash
# Check Caddy logs
make logs-caddy

# Verify domain DNS
dig yourdomain.com

# Force certificate renewal
docker compose -f docker-compose.prod.yml restart caddy
```

---

## Environment Variables

Critical settings in `.env.production`:

```bash
# Domain & SSL
DOMAIN=yourdomain.com
SSL_EMAIL=admin@yourdomain.com

# API URL (must match domain)
NEXT_PUBLIC_API_URL=https://yourdomain.com

# Worker concurrency (adjust based on server resources)
ENRICHMENT_WORKER_CONCURRENCY=5
GRAPH_WORKER_CONCURRENCY=3

# Logging
LOG_LEVEL=info
```

---

## Secrets

All secrets stored in `secrets/` directory:

- `postgres_password.txt` - Database password
- `jwt_secret.txt` - JWT signing key
- `jwt_refresh_secret.txt` - JWT refresh token key
- `openai_api_key.txt` - OpenAI API key

**NEVER commit secrets to git!** (Already in `.gitignore`)

---

## Rollback

### Quick rollback (no database changes)

```bash
make stop
git checkout <previous-commit>
make build
make start
```

### Full rollback (with database restore)

```bash
make stop
make restore  # Restore database
git checkout <previous-commit>
make build
make start
```

---

## Performance Benchmarks

Based on 11-bookmark test dataset:

| Query | p95 Latency | Target | Status |
|-------|-------------|--------|--------|
| Bookmark List | 0.51ms | <10ms | ✅ |
| Full-Text Search | 0.44ms | <200ms | ✅ |
| Vector Similarity | 0.54ms | <500ms | ✅ |
| Graph Relationships | 0.72ms | <1s | ✅ |
| Cluster Query | 0.92ms | <1s | ✅ |

---

## Resource Requirements by User Scale

| Users | vCPUs | RAM | Storage | Cost/Month |
|-------|-------|-----|---------|------------|
| **1-100** | 4 | 8GB | 50GB | $20-40 |
| **100-1K** | 8 | 16GB | 100GB | $40-80 |
| **1K-10K** | 16 | 32GB | 200GB | $80-160 |

*Estimates based on DigitalOcean/Linode pricing*

---

## CI/CD Pipeline

GitHub Actions automatically:

1. **Build** images on every push
2. **Scan** for vulnerabilities with Trivy
3. **Test** deployment in CI environment
4. **Deploy** to production (on main branch)
5. **Verify** health checks

Workflow: `.github/workflows/docker-build.yml`

---

## Cost Optimization

### OpenAI API Costs

Per user/month with 50 bookmarks:

- Entity extraction: $0.05 (hybrid spaCy + GPT)
- Concept analysis: $0.10
- Clustering: $0.10 (batch, weekly)
- Insights: $0.05 (batch, daily)

**Total**: ~$0.30/user/month

### Server Costs

- **Small** (100 users): $20-40/month
- **Medium** (1K users): $40-80/month
- **Large** (10K users): $80-160/month

### Caching Impact

Redis caching reduces:
- OpenAI API calls by 50-70%
- Database queries by 80-90%
- Response time to <10ms for cached queries

---

## Next Steps

1. **Set up monitoring** - Consider Uptime Robot, Healthchecks.io
2. **Configure backups** - Set up automated off-site backups
3. **Enable alerts** - Disk space, memory, health checks
4. **Review logs** - Set up log aggregation (optional)
5. **Test disaster recovery** - Practice restore procedures

---

## Documentation

- **Full Deployment Guide**: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)
- **Docker Optimization**: [docs/DOCKER_OPTIMIZATION.md](docs/DOCKER_OPTIMIZATION.md)
- **Application Documentation**: [docs/](docs/)

---

## Support

- **Issues**: GitHub Issues
- **Logs**: `make logs-tail`
- **Health**: `https://yourdomain.com/api/health`

---

## License

MIT License - See LICENSE file for details
