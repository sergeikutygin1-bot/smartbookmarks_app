#!/bin/bash
# Setup automatic daily backups via cron
# Runs backup every day at 2 AM

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}⏰ Setting up Daily Automatic Backups${NC}"
echo "=================================================="

# Get absolute path to project directory
PROJECT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )/.." && pwd )"
BACKUP_SCRIPT="${PROJECT_DIR}/scripts/backup-database.sh"

# Check if backup script exists
if [ ! -f "$BACKUP_SCRIPT" ]; then
    echo "❌ Error: Backup script not found at ${BACKUP_SCRIPT}"
    exit 1
fi

# Create cron job entry
CRON_JOB="0 2 * * * cd ${PROJECT_DIR} && ${BACKUP_SCRIPT} >> ${PROJECT_DIR}/backups/backup.log 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$BACKUP_SCRIPT"; then
    echo -e "${YELLOW}⚠️  Automatic backup already configured${NC}"
    echo "Current cron jobs:"
    crontab -l | grep "$BACKUP_SCRIPT"
    exit 0
fi

# Add cron job
echo -e "\n${YELLOW}Adding cron job...${NC}"
(crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -

echo -e "${GREEN}✅ Daily backup configured!${NC}"
echo -e "\nBackups will run:"
echo -e "  • Daily at 2:00 AM"
echo -e "  • Logs: ${PROJECT_DIR}/backups/backup.log"
echo -e "  • Backups: ${PROJECT_DIR}/backups/daily/"
echo -e "\nTo view scheduled jobs:"
echo -e "  ${YELLOW}crontab -l${NC}"
echo -e "\nTo remove automatic backups:"
echo -e "  ${YELLOW}crontab -e${NC} (then delete the backup line)"
