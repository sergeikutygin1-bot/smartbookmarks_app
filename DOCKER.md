# Docker Development Guide

Complete guide for running Smart Bookmarks in Docker with hot-reload development support.

## Prerequisites

- **Docker Desktop 4.0+** (macOS/Windows) or **Docker Engine 20.10+** (Linux)
- **4GB+ RAM** allocated to Docker
- **10GB+ disk space**
- **OpenAI API Key** for AI enrichment features

## Quick Start

### First-Time Setup

1. **Clone repository** (if you haven't already):
   ```bash
   cd /Users/sergeykutygin/Desktop/vibecoding/smart_bookmarks_v2
   ```

2. **Create backend environment file**:
   ```bash
   cp backend/.env.example backend/.env
   ```

3. **Edit `backend/.env` and add your OpenAI API key**:
   ```bash
   # Open in your editor
   nano backend/.env  # or vim, code, etc.

   # Add your key:
   OPENAI_API_KEY=sk-your-actual-api-key-here
   ```

4. **Start all services**:
   ```bash
   docker-compose up --build
   ```

5. **Wait for healthchecks** (30-90 seconds)
   - Watch the logs until you see all services are healthy
   - You'll see messages like "✓ Container smartbookmarks_backend healthy"

6. **Access the application**:
   - **Frontend**: http://localhost:3000
   - **Backend API**: http://localhost:3002
   - **Admin Dashboard**: http://localhost:3002/admin

### Daily Development

**Start all services**:
```bash
docker-compose up
```

**Start in background** (detached mode):
```bash
docker-compose up -d
```

**View logs** (all services):
```bash
docker-compose logs -f
```

**View logs** (specific service):
```bash
docker-compose logs -f backend-api
docker-compose logs -f backend-worker
docker-compose logs -f frontend
```

**Stop all services**:
```bash
docker-compose down
```

**Stop and remove volumes** (⚠️ deletes database data):
```bash
docker-compose down -v
```

---

## Port Reference

| Service       | Port | URL                          | Description                |
|--------------|------|------------------------------|----------------------------|
| Frontend     | 3000 | http://localhost:3000        | Next.js web UI             |
| Backend API  | 3002 | http://localhost:3002        | Express REST API           |
| PostgreSQL   | 5432 | postgresql://localhost:5432  | Database (pgvector)        |
| Redis        | 6379 | redis://localhost:6379       | Cache & job queue          |

---

## Individual Service Commands

**Backend API only**:
```bash
docker-compose up backend-api
```

**Worker only**:
```bash
docker-compose up backend-worker
```

**Frontend only**:
```bash
docker-compose up frontend
```

**Database & Redis only**:
```bash
docker-compose up postgres redis
```

**Rebuild specific service**:
```bash
docker-compose up --build backend-api
docker-compose up --build frontend
```

---

## Common Tasks

### Run Database Migrations

```bash
docker-compose exec backend-api npx prisma migrate dev
```

### Create a New Migration

```bash
docker-compose exec backend-api npx prisma migrate dev --name add_new_feature
```

### Access Prisma Studio

```bash
docker-compose exec backend-api npx prisma studio
```
Then open http://localhost:5555

### Access PostgreSQL CLI

```bash
docker-compose exec postgres psql -U smartbookmarks -d smartbookmarks
```

Example queries:
```sql
-- List all bookmarks
SELECT id, title, url, status FROM bookmarks LIMIT 10;

-- Check vector embeddings
SELECT id, title, embedding IS NOT NULL as has_embedding FROM bookmarks;

-- Exit
\q
```

### Access Redis CLI

```bash
docker-compose exec redis redis-cli
```

Example commands:
```bash
# Check connection
PING

# List all BullMQ jobs
KEYS "bull:enrichment:*"

# Get queue stats
LLEN bull:enrichment:wait

# Exit
exit
```

### Install New Dependencies

**Backend**:
```bash
# Install package
docker-compose exec backend-api npm install <package-name>

# Rebuild and restart
docker-compose up --build backend-api
```

**Frontend**:
```bash
# Install package
docker-compose exec frontend npm install <package-name>

# Rebuild and restart
docker-compose up --build frontend
```

### Clear All Data (DANGEROUS ⚠️)

This removes **all database data, Redis cache, and volumes**:
```bash
docker-compose down -v
```

To start fresh:
```bash
docker-compose down -v
docker-compose up --build
```

---

## Environment Variables

### Backend (`.env` file)

**Required**:
- `OPENAI_API_KEY` - Your OpenAI API key for AI enrichment

**Auto-configured by Docker**:
- `DATABASE_URL` - Automatically set to `postgresql://smartbookmarks:dev_password@postgres:5432/smartbookmarks`
- `REDIS_URL` - Automatically set to `redis://redis:6379`
- `PORT` - Set to `3002`

**Optional** (see `backend/.env.example` for full list):
- `AI_MODEL` - Default: `gpt-4o-mini`
- `WORKER_CONCURRENCY` - Default: `5`
- `LOG_LEVEL` - Default: `info`

### Frontend

No `.env` file needed! The `BACKEND_URL` is automatically set via docker-compose to `http://backend-api:3002`.

---

## Troubleshooting

### Services Won't Start

**Check service status**:
```bash
docker-compose ps
```

**Check logs**:
```bash
docker-compose logs backend-api
docker-compose logs postgres
docker-compose logs redis
```

**Common issues**:
- **Port already in use**: Stop other services using ports 3000, 3002, 5432, or 6379
- **Missing .env file**: Ensure `backend/.env` exists with `OPENAI_API_KEY`
- **Docker not running**: Start Docker Desktop

### Backend Can't Connect to Database

1. **Check postgres is healthy**:
   ```bash
   docker-compose ps postgres
   ```
   Should show "healthy" status

2. **Verify migrations ran**:
   ```bash
   docker-compose logs backend-api | grep migrate
   ```

3. **Manually run migrations**:
   ```bash
   docker-compose exec backend-api npx prisma migrate deploy
   ```

### Frontend Shows 502/503 Errors

1. **Check backend-api is healthy**:
   ```bash
   docker-compose ps backend-api
   ```

2. **Test backend directly**:
   ```bash
   curl http://localhost:3002/health
   ```
   Should return `{"status":"ok"}`

3. **Check logs**:
   ```bash
   docker-compose logs backend-api
   docker-compose logs frontend
   ```

### Hot-Reload Not Working

**Backend**:
1. Verify source code is mounted:
   ```bash
   docker-compose config | grep -A 5 "backend/src"
   ```

2. Check tsx watch is running:
   ```bash
   docker-compose logs backend-api | grep "watching"
   ```

3. **Restart service**:
   ```bash
   docker-compose restart backend-api
   ```

**Frontend**:
1. Verify volumes are mounted:
   ```bash
   docker-compose config | grep -A 10 "frontend/app"
   ```

2. Check Fast Refresh is working:
   ```bash
   docker-compose logs frontend | grep "Fast Refresh"
   ```

3. **Restart service**:
   ```bash
   docker-compose restart frontend
   ```

### Worker Not Processing Jobs

1. **Check worker logs**:
   ```bash
   docker-compose logs backend-worker
   ```

2. **Verify Redis connection**:
   ```bash
   docker-compose exec backend-worker npm run test:redis
   ```

3. **Check BullMQ queue**:
   ```bash
   docker-compose exec redis redis-cli KEYS "bull:*"
   ```

4. **Restart worker**:
   ```bash
   docker-compose restart backend-worker
   ```

### Port Already in Use

Change port in `docker-compose.yml`:
```yaml
ports:
  - "3001:3000"  # Maps host:3001 to container:3000
```

Or stop the conflicting service:
```bash
# Find process using port 3000
lsof -i :3000

# Kill it
kill -9 <PID>
```

### Out of Disk Space

Clean up Docker resources:
```bash
# Remove stopped containers and unused images
docker system prune -f

# Remove everything (⚠️ DANGEROUS - removes all Docker data)
docker system prune -a -f --volumes
```

### Slow Performance (macOS)

1. **Increase Docker Desktop RAM allocation**:
   - Docker Desktop → Settings → Resources
   - Increase Memory to 4GB+ and CPUs to 4+

2. **Named volumes are already optimized**:
   - `backend_node_modules` and `frontend_node_modules` use named volumes (faster than bind mounts)

3. **Exclude unnecessary files**:
   - Ensure `.dockerignore` files exist in `backend/` and `frontend/`

---

## Development Workflow

### Making Code Changes

**Backend code** (`backend/src/`):
1. Edit files in `backend/src/`
2. Save the file
3. tsx watch automatically detects changes and restarts server (2-3 seconds)
4. Check logs: `docker-compose logs -f backend-api`

**Frontend code** (`frontend/app/`, `frontend/components/`):
1. Edit any component or page
2. Save the file
3. Next.js Fast Refresh updates browser instantly (<1 second)
4. No restart needed

### Adding Database Changes

1. **Edit Prisma schema**:
   ```bash
   # Edit backend/prisma/schema.prisma locally
   ```

2. **Create migration**:
   ```bash
   docker-compose exec backend-api npx prisma migrate dev --name describe_your_change
   ```

3. **Restart services** to apply changes:
   ```bash
   docker-compose restart backend-api backend-worker
   ```

### Testing AI Enrichment

1. **Start all services**:
   ```bash
   docker-compose up
   ```

2. **Open frontend** at http://localhost:3000

3. **Create a bookmark**:
   - Click "+ New Bookmark"
   - Paste a URL (e.g., https://news.ycombinator.com/item?id=12345)
   - Click Save

4. **Click "Enrich" button** on the bookmark

5. **Monitor worker logs**:
   ```bash
   docker-compose logs -f backend-worker
   ```
   You should see:
   - Content extraction
   - AI analysis
   - Tag generation
   - Embedding creation

6. **Check Redis queue**:
   ```bash
   docker-compose exec redis redis-cli KEYS "bull:enrichment:*"
   ```

---

## Architecture

```
┌─────────────────┐
│   Frontend      │ :3000
│   (Next.js)     │
└────────┬────────┘
         │ HTTP (API Routes as BFF)
         │ BACKEND_URL=http://backend-api:3002
         ▼
┌─────────────────┐     ┌──────────────────┐
│  Backend API    │────▶│   PostgreSQL     │ :5432
│  (Express)      │     │   (pgvector)     │
│  :3002          │     └──────────────────┘
└────────┬────────┘
         │ BullMQ
         │ Queue
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Backend Worker  │────▶│     Redis        │ :6379
│ (BullMQ)        │     │  (Queue+Cache)   │
└─────────────────┘     └──────────────────┘
```

**Service Dependencies**:
```
postgres (healthy) ──┐
                     ├──▶ backend-api (healthy) ──┐
redis (healthy) ─────┘                            ├──▶ frontend
                                                  │
                      backend-worker ─────────────┘
```

---

## Healthcheck Status

Each service has a healthcheck that Docker monitors:

| Service      | Healthcheck                   | Interval | Start Period |
|-------------|-------------------------------|----------|--------------|
| postgres    | `pg_isready -U smartbookmarks` | 10s      | N/A          |
| redis       | `redis-cli ping`               | 10s      | N/A          |
| backend-api | `wget http://localhost:3002/health` | 10s | 30s          |
| frontend    | `wget http://localhost:3000`   | 15s      | 45s          |
| backend-worker | None (workers don't expose HTTP) | N/A | N/A       |

**Check service health**:
```bash
docker-compose ps
```

Output shows:
- **healthy** - Service is ready
- **starting** - Still initializing
- **unhealthy** - Service failed healthcheck

---

## Cleanup

**Remove containers and networks** (keeps volumes/data):
```bash
docker-compose down
```

**Remove everything including database data**:
```bash
docker-compose down -v
```

**Remove Docker images**:
```bash
docker-compose down --rmi all
```

**Complete reset** (nuclear option):
```bash
# Stop everything
docker-compose down -v

# Remove all Docker resources
docker system prune -a -f --volumes

# Verify git status
git status

# Restart Docker Desktop

# Rebuild from scratch
docker-compose up --build
```

---

## Performance Expectations

### Build Times

- **First build**: ~2-3 minutes (npm install on all services)
- **Rebuild** (cached): ~30 seconds
- **Hot-reload** (no rebuild): Instant

### Startup Times

- **Cold start** (first time): ~60-90 seconds
- **Warm start** (already built): ~20-30 seconds

**Startup sequence**:
```
0s    - docker-compose up starts
10s   - postgres healthy ✓
10s   - redis healthy ✓
30s   - backend-api runs migrations
40s   - backend-api healthy ✓
45s   - backend-worker connects ✓
60s   - frontend healthy ✓
```

### Hot-Reload Performance

- **Backend**: ~2-3 seconds (tsx watch restarts Node.js process)
- **Frontend**: <1 second (Next.js Fast Refresh)

---

## Tips & Best Practices

### Development Tips

1. **Use detached mode** when you don't need to watch logs:
   ```bash
   docker-compose up -d
   docker-compose logs -f backend-api  # Only watch specific service
   ```

2. **Restart individual services** instead of everything:
   ```bash
   docker-compose restart backend-api
   ```

3. **Keep .env files out of git**:
   - `.gitignore` already excludes `.env`
   - Use `.env.example` for documentation

4. **Monitor resource usage**:
   ```bash
   docker stats
   ```

### Performance Tips

1. **Don't mount node_modules from host** - Already handled via named volumes
2. **Use .dockerignore** - Already configured
3. **Build images in advance** if you don't need hot-reload:
   ```bash
   docker-compose build
   docker-compose up
   ```

### Debugging Tips

1. **Access container shell**:
   ```bash
   docker-compose exec backend-api sh
   docker-compose exec frontend sh
   ```

2. **Check environment variables**:
   ```bash
   docker-compose exec backend-api env | grep DATABASE
   ```

3. **View full docker-compose config**:
   ```bash
   docker-compose config
   ```

---

## FAQ

**Q: Can I run services locally (without Docker) and Docker services together?**

A: Yes! For example:
- Run postgres + redis in Docker
- Run backend locally: `cd backend && npm run dev`
- Run frontend locally: `cd frontend && npm run dev`

Just ensure `DATABASE_URL` and `REDIS_URL` in your local `.env` point to `localhost:5432` and `localhost:6379`.

**Q: How do I update dependencies?**

A:
```bash
# Update package.json locally
npm install <new-package>

# Rebuild the container
docker-compose up --build backend-api
```

**Q: Can I run multiple workers?**

A: Yes! Scale the worker service:
```bash
docker-compose up --scale backend-worker=3
```

**Q: How do I backup the database?**

A:
```bash
docker-compose exec postgres pg_dump -U smartbookmarks smartbookmarks > backup.sql
```

Restore:
```bash
cat backup.sql | docker-compose exec -T postgres psql -U smartbookmarks -d smartbookmarks
```

**Q: Where is data stored?**

A:
- **postgres_data** volume: `/var/lib/docker/volumes/smart_bookmarks_v2_postgres_data`
- **redis_data** volume: Local Docker volume
- **Logs**: `docker-compose logs`

---

## Getting Help

**Check logs first**:
```bash
docker-compose logs -f
```

**Verify configuration**:
```bash
docker-compose config
```

**Check service status**:
```bash
docker-compose ps
```

**GitHub Issues**: Report bugs at [GitHub Repository]

---

**Happy coding! 🚀**
