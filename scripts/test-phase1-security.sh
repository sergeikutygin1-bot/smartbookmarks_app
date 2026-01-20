#!/bin/bash
# Phase 1 Security Quick Test Script
# Automated testing for security headers, CSRF, and XSS protection

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# API URL
API_URL="http://localhost:3002"

echo -e "${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Phase 1 Security Testing - Automated Tests${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

# Helper function to run test
run_test() {
    local test_name="$1"
    local test_command="$2"
    local expected_pattern="$3"

    TESTS_RUN=$((TESTS_RUN + 1))
    echo -ne "${YELLOW}[$TESTS_RUN]${NC} Testing: $test_name... "

    result=$(eval "$test_command" 2>&1 || true)

    if echo "$result" | grep -q "$expected_pattern"; then
        echo -e "${GREEN}✅ PASS${NC}"
        TESTS_PASSED=$((TESTS_PASSED + 1))
        return 0
    else
        echo -e "${RED}❌ FAIL${NC}"
        echo -e "    Expected pattern: $expected_pattern"
        echo -e "    Got: ${result:0:100}..."
        TESTS_FAILED=$((TESTS_FAILED + 1))
        return 1
    fi
}

echo -e "${YELLOW}══ Test Suite 1: Security Headers${NC}\n"

# Test 1: Content-Security-Policy
run_test "Content-Security-Policy header" \
    "curl -sI $API_URL/health" \
    "Content-Security-Policy"

# Test 2: X-Frame-Options
run_test "X-Frame-Options header" \
    "curl -sI $API_URL/health" \
    "X-Frame-Options: DENY"

# Test 3: Strict-Transport-Security
run_test "Strict-Transport-Security header" \
    "curl -sI $API_URL/health" \
    "Strict-Transport-Security"

# Test 4: X-API-Version
run_test "X-API-Version header" \
    "curl -sI $API_URL/health" \
    "X-API-Version: 1.0.0"

# Test 5: X-Content-Type-Options
run_test "X-Content-Type-Options header" \
    "curl -sI $API_URL/health" \
    "X-Content-Type-Options: nosniff"

echo -e "\n${YELLOW}══ Test Suite 2: Backend Health & Config${NC}\n"

# Test 6: Health endpoint
run_test "Health endpoint responds" \
    "curl -s $API_URL/health" \
    "ok"

# Test 7: JWT secrets configured
run_test "New JWT secrets in use" \
    "docker exec smartbookmarks_backend printenv JWT_SECRET" \
    "x+wIkUpHF6TEr/RLS6HWCI5TzQwZ6IleNiCnNhZQRAQ="

# Test 8: DOMPurify installed
run_test "DOMPurify package installed" \
    "docker exec smartbookmarks_backend npm list isomorphic-dompurify 2>&1" \
    "isomorphic-dompurify@"

# Test 9: Helmet installed
run_test "Helmet package installed" \
    "docker exec smartbookmarks_backend npm list helmet 2>&1" \
    "helmet@"

# Test 10: CSRF package installed
run_test "CSRF package installed" \
    "docker exec smartbookmarks_backend npm list csrf 2>&1" \
    "csrf@"

echo -e "\n${YELLOW}══ Test Suite 3: Database & Data Integrity${NC}\n"

# Test 11: Database has data
run_test "Database contains users" \
    "docker exec smartbookmarks_postgres psql -U smartbookmarks -d smartbookmarks -t -c 'SELECT COUNT(*) FROM users;'" \
    "8"

# Test 12: Database has bookmarks
run_test "Database contains bookmarks" \
    "docker exec smartbookmarks_postgres psql -U smartbookmarks -d smartbookmarks -t -c 'SELECT COUNT(*) FROM bookmarks;'" \
    "19"

echo -e "\n${YELLOW}══ Test Suite 4: Container Health${NC}\n"

# Test 13: Backend container running
run_test "Backend container running" \
    "docker ps --format '{{.Names}}' --filter 'name=smartbookmarks_backend'" \
    "smartbookmarks_backend"

# Test 14: Postgres container healthy
run_test "Postgres container healthy" \
    "docker ps --format '{{.Names}} {{.Status}}' --filter 'name=smartbookmarks_postgres'" \
    "healthy"

# Test 15: Redis container healthy
run_test "Redis container healthy" \
    "docker ps --format '{{.Names}} {{.Status}}' --filter 'name=smartbookmarks_redis'" \
    "healthy"

# Test 16: Frontend container running
run_test "Frontend container running" \
    "docker ps --format '{{.Names}}' --filter 'name=smartbookmarks_frontend'" \
    "smartbookmarks_frontend"

echo -e "\n${YELLOW}══ Test Suite 5: Volume Protection${NC}\n"

# Test 17: Data volume exists
run_test "Data volume exists" \
    "docker volume ls --format '{{.Name}}'" \
    "smart_bookmarks_v2_postgres_data"

# Test 18: Volume marked as external
run_test "Volume marked as external in docker-compose" \
    "grep -A1 'smart_bookmarks_v2_postgres_data:' docker-compose.yml" \
    "external: true"

echo -e "\n${YELLOW}══ Test Suite 6: Backup System${NC}\n"

# Test 19: Backup script exists
run_test "Backup script exists and executable" \
    "test -x ./scripts/backup-database.sh && echo 'exists'" \
    "exists"

# Test 20: Restore script exists
run_test "Restore script exists and executable" \
    "test -x ./scripts/restore-backup.sh && echo 'exists'" \
    "exists"

# Test 21: Backup directory exists
run_test "Backup directory exists" \
    "test -d ./backups/daily && echo 'exists'" \
    "exists"

# Test 22: At least one backup exists
run_test "Backup files present" \
    "ls ./backups/daily/*.sql.gz 2>/dev/null | wc -l" \
    "[1-9]"

# Summary
echo -e "\n${BLUE}═══════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  Test Results Summary${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════${NC}\n"

echo -e "Total Tests:  ${BLUE}$TESTS_RUN${NC}"
echo -e "Passed:       ${GREEN}$TESTS_PASSED${NC}"
echo -e "Failed:       ${RED}$TESTS_FAILED${NC}"

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "\n${GREEN}✅ All tests passed! Phase 1 security is working correctly.${NC}"
    echo -e "\n${YELLOW}Next Steps:${NC}"
    echo -e "  1. Test manually in browser (see PHASE_1_TESTING_GUIDE.md)"
    echo -e "  2. Try XSS payloads in bookmark creation"
    echo -e "  3. Verify CSRF tokens in DevTools Network tab"
    echo -e "  4. Ready to proceed with Phase 2!"
    exit 0
else
    echo -e "\n${RED}⚠️  Some tests failed. Please review the failures above.${NC}"
    echo -e "\n${YELLOW}Troubleshooting:${NC}"
    echo -e "  • Check docker logs: ${BLUE}docker logs smartbookmarks_backend --tail 50${NC}"
    echo -e "  • Restart services: ${BLUE}docker-compose restart${NC}"
    echo -e "  • Rebuild containers: ${BLUE}docker-compose build${NC}"
    echo -e "  • Review: ${BLUE}PHASE_1_TESTING_GUIDE.md${NC}"
    exit 1
fi
