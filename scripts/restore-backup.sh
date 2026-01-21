#!/bin/bash
# Smart Bookmarks - Database Restore Script
# Restores a PostgreSQL dump from backup file

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="smartbookmarks_postgres"
DB_USER="smartbookmarks"
DB_NAME="smartbookmarks"

echo -e "${RED}⚠️  Smart Bookmarks Database Restore${NC}"
echo "=================================================="
echo -e "${RED}WARNING: This will OVERWRITE your current database!${NC}"
echo "=================================================="

# Check if backup file was provided
if [ -z "$1" ]; then
    echo -e "${RED}❌ Error: No backup file specified${NC}"
    echo -e "\nUsage: $0 <backup-file.sql.gz>"
    echo -e "\nAvailable backups:"
    ls -lh ./backups/daily/backup-*.sql.gz 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}'
    exit 1
fi

BACKUP_FILE="$1"

# Check if backup file exists
if [ ! -f "$BACKUP_FILE" ]; then
    echo -e "${RED}❌ Error: Backup file not found: ${BACKUP_FILE}${NC}"
    exit 1
fi

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Docker is not running${NC}"
    exit 1
fi

# Check if container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}❌ Error: Container ${CONTAINER_NAME} is not running${NC}"
    echo -e "Start it with: docker-compose up -d postgres"
    exit 1
fi

# Show current database stats
echo -e "\n${YELLOW}📊 Current Database Stats (will be replaced):${NC}"
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 'Users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'Bookmarks', COUNT(*) FROM bookmarks
UNION ALL SELECT 'Entities', COUNT(*) FROM entities
UNION ALL SELECT 'Concepts', COUNT(*) FROM concepts
UNION ALL SELECT 'Tags', COUNT(*) FROM tags
UNION ALL SELECT 'Relationships', COUNT(*) FROM relationships;
" -t 2>/dev/null || echo "   (empty database)"

# Show backup info
echo -e "\n${YELLOW}📦 Backup File Info:${NC}"
ls -lh "$BACKUP_FILE" | awk '{print "   Size: " $5 "\n   Date: " $6 " " $7 " " $8}'

# Confirm with user
echo -e "\n${RED}⚠️  Are you sure you want to restore this backup?${NC}"
echo -e "This will DELETE all current data and replace it with the backup."
read -p "Type 'yes' to continue: " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo -e "${YELLOW}Restore cancelled.${NC}"
    exit 0
fi

# Create emergency backup of current state
echo -e "\n${YELLOW}🔄 Creating emergency backup of current state...${NC}"
EMERGENCY_BACKUP="./backups/manual/emergency-before-restore-$(date +%Y-%m-%d_%H-%M-%S).sql.gz"
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$EMERGENCY_BACKUP"
echo -e "${GREEN}✅ Emergency backup saved to: ${EMERGENCY_BACKUP}${NC}"

# Decompress if needed
TEMP_FILE=""
if [[ "$BACKUP_FILE" == *.gz ]]; then
    echo -e "\n${YELLOW}🗜️  Decompressing backup...${NC}"
    TEMP_FILE="${BACKUP_FILE%.gz}"
    gunzip -c "$BACKUP_FILE" > "$TEMP_FILE"
    RESTORE_FILE="$TEMP_FILE"
else
    RESTORE_FILE="$BACKUP_FILE"
fi

# Drop and recreate database
echo -e "\n${YELLOW}🗑️  Dropping current database...${NC}"
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d postgres -c "CREATE DATABASE $DB_NAME;"

# Restore backup
echo -e "\n${YELLOW}🔄 Restoring backup...${NC}"
cat "$RESTORE_FILE" | docker exec -i "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME"

# Clean up temp file
if [ -n "$TEMP_FILE" ] && [ -f "$TEMP_FILE" ]; then
    rm "$TEMP_FILE"
fi

# Verify restore
echo -e "\n${YELLOW}✓ Verifying restored database...${NC}"
docker exec "$CONTAINER_NAME" psql -U "$DB_USER" -d "$DB_NAME" -c "
SELECT 'Users' as table_name, COUNT(*) as count FROM users
UNION ALL SELECT 'Bookmarks', COUNT(*) FROM bookmarks
UNION ALL SELECT 'Entities', COUNT(*) FROM entities
UNION ALL SELECT 'Concepts', COUNT(*) FROM concepts
UNION ALL SELECT 'Tags', COUNT(*) FROM tags
UNION ALL SELECT 'Relationships', COUNT(*) FROM relationships;
" -t

echo -e "\n${GREEN}=================================================="
echo -e "✅ Database restored successfully!${NC}"
echo -e "=================================================="
echo -e "\nEmergency backup (before restore) saved at:"
echo -e "  ${YELLOW}${EMERGENCY_BACKUP}${NC}"
echo -e "\nRestart services to apply changes:"
echo -e "  ${YELLOW}docker-compose restart backend-api backend-worker graph-worker${NC}"
