#!/bin/bash
# Smart Bookmarks - Database Backup Script
# Creates a PostgreSQL dump with timestamp

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="./backups/daily"
MANUAL_BACKUP_DIR="./backups/manual"
CONTAINER_NAME="smartbookmarks_postgres"
DB_USER="smartbookmarks"
DB_NAME="smartbookmarks"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_FILE="${BACKUP_DIR}/backup-${TIMESTAMP}.sql"
KEEP_DAYS=7  # Keep backups for 7 days

echo -e "${GREEN}🗄️  Smart Bookmarks Database Backup${NC}"
echo "=================================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    exit 1
fi

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}❌ Error: Container ${CONTAINER_NAME} is not running${NC}"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"
mkdir -p "$MANUAL_BACKUP_DIR"

# Get current data counts
echo -e "\n${YELLOW}📊 Current Database Stats:${NC}"
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 'Users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'Bookmarks', COUNT(*) FROM bookmarks
UNION ALL SELECT 'Entities', COUNT(*) FROM entities
UNION ALL SELECT 'Concepts', COUNT(*) FROM concepts
UNION ALL SELECT 'Tags', COUNT(*) FROM tags
UNION ALL SELECT 'Relationships', COUNT(*) FROM relationships;
" -t

# Create backup
echo -e "\n${YELLOW}🔄 Creating backup...${NC}"
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

# Check if backup was created successfully
if [ -f "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✅ Backup created successfully!${NC}"
    echo -e "   File: ${BACKUP_FILE}"
    echo -e "   Size: ${BACKUP_SIZE}"
else
    echo -e "${RED}❌ Backup failed!${NC}"
    exit 1
fi

# Compress backup
echo -e "\n${YELLOW}🗜️  Compressing backup...${NC}"
gzip -f "$BACKUP_FILE"
COMPRESSED_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
echo -e "${GREEN}✅ Backup compressed to ${COMPRESSED_SIZE}${NC}"

# Clean up old backups (keep last 7 days)
echo -e "\n${YELLOW}🧹 Cleaning up old backups (keeping last ${KEEP_DAYS} days)...${NC}"
find "$BACKUP_DIR" -name "backup-*.sql.gz" -type f -mtime +${KEEP_DAYS} -delete
REMAINING_BACKUPS=$(ls -1 "$BACKUP_DIR"/backup-*.sql.gz 2>/dev/null | wc -l)
echo -e "${GREEN}✅ ${REMAINING_BACKUPS} backup(s) remaining${NC}"

# List recent backups
echo -e "\n${YELLOW}📋 Recent Backups:${NC}"
ls -lh "$BACKUP_DIR"/backup-*.sql.gz 2>/dev/null | tail -5 | awk '{print "   " $9 " (" $5 ")"}'

echo -e "\n${GREEN}=================================================="
echo -e "✅ Backup complete!${NC}"
echo -e "\nTo restore this backup:"
echo -e "  ${YELLOW}./scripts/restore-backup.sh ${BACKUP_FILE}.gz${NC}"
