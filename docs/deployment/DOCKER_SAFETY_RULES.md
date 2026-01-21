# 🚨 DOCKER SAFETY RULES - READ THIS FIRST! 🚨

## ⛔ NEVER DO THIS:
```bash
docker-compose down -v          # ❌ DELETES ALL DATA VOLUMES!
docker-compose down --volumes   # ❌ SAME AS ABOVE!
docker volume rm <volume>       # ❌ PERMANENT DATA LOSS!
docker volume prune             # ❌ DELETES UNUSED VOLUMES!
```

## ✅ SAFE COMMANDS:
```bash
docker-compose down             # ✅ Stops containers, keeps data
docker-compose restart          # ✅ Restarts services safely
docker-compose stop             # ✅ Stops without removing
docker-compose up -d            # ✅ Starts/recreates containers
```

## 📊 Data Storage Location

Your critical data volume:
- **Volume Name**: `smart_bookmarks_v2_postgres_data`
- **Contains**: All users, bookmarks, entities, concepts, relationships
- **Current Data**: 8 users, 19 bookmarks, 196 relationships

## 🔒 Protection Measures in Place

1. ✅ Volume marked as `external: true` in docker-compose.yml
2. ✅ Daily automatic backups (see backup scripts)
3. ✅ This warning file in project root
4. ✅ Backup verification before dangerous operations

## 🗂️ Backup Files Location

- Daily backups: `./backups/daily/`
- Manual backups: `./backups/manual/`
- Retention: 7 daily backups kept automatically

## 🆘 Emergency Data Recovery

If data is accidentally deleted:
```bash
# Check available old volumes
docker volume ls | grep bookmark

# Restore from backup
./scripts/restore-backup.sh ./backups/daily/backup-YYYY-MM-DD.sql

# List backups
ls -lah ./backups/daily/
```

## 📋 Daily Checklist

Before ANY docker-compose command:
1. ✅ Check if command has `-v` or `--volumes` flag
2. ✅ Verify last backup is recent (max 24 hours old)
3. ✅ If unsure, run backup manually first

## 🔧 Maintenance Commands

**Safe restart after code changes:**
```bash
# Backend changes only
docker-compose restart backend-api backend-worker graph-worker

# Frontend changes only
docker-compose restart frontend

# Full restart (keeps data)
docker-compose down && docker-compose up -d
```

**Safe rebuild after dependency changes:**
```bash
# Rebuild without removing volumes
docker-compose build backend-api
docker-compose up -d backend-api
```

**Create manual backup:**
```bash
./scripts/backup-database.sh
```

---

**⚠️ REMEMBER: When in doubt, backup first!**
