#!/bin/bash
# Production Deployment Script for Smart Bookmarks
# Zero-downtime deployment with health checks and rollback capability

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.prod.yml"
BACKUP_DIR="./backups"
MAX_HEALTH_RETRIES=30
HEALTH_CHECK_INTERVAL=10

# Functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."

    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    # Check Docker Compose
    if ! docker compose version &> /dev/null; then
        log_error "Docker Compose v2 is not installed"
        exit 1
    fi

    # Check secrets
    for secret in postgres_password jwt_secret jwt_refresh_secret openai_api_key; do
        if [ ! -f "secrets/${secret}.txt" ] || [ ! -s "secrets/${secret}.txt" ]; then
            log_error "Missing or empty secret: secrets/${secret}.txt"
            log_info "Run 'make secrets-generate' to create secrets"
            exit 1
        fi
    done

    log_success "Prerequisites check passed"
}

backup_database() {
    log_info "Creating database backup..."

    mkdir -p "$BACKUP_DIR"

    BACKUP_FILE="${BACKUP_DIR}/smartbookmarks_$(date +%Y%m%d_%H%M%S).dump"

    if docker compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U smartbookmarks -F c smartbookmarks > "$BACKUP_FILE" 2>/dev/null; then
        log_success "Database backed up to: $BACKUP_FILE"
        return 0
    else
        log_warning "Database backup failed (database may not be running yet)"
        return 1
    fi
}

build_images() {
    log_info "Building Docker images..."

    VERSION=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")

    # Build backend
    log_info "Building backend image..."
    docker build \
        -f backend/Dockerfile \
        -t smartbookmarks/backend:${VERSION} \
        -t smartbookmarks/backend:latest \
        ./backend

    # Build frontend
    log_info "Building frontend image..."
    NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL:-"https://api.yourdomain.com"}
    docker build \
        -f frontend/Dockerfile \
        -t smartbookmarks/frontend:${VERSION} \
        -t smartbookmarks/frontend:latest \
        --build-arg NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
        ./frontend

    log_success "Images built successfully (version: $VERSION)"
}

wait_for_health() {
    local service=$1
    local max_retries=${2:-$MAX_HEALTH_RETRIES}

    log_info "Waiting for $service to become healthy..."

    for i in $(seq 1 $max_retries); do
        if docker compose -f "$COMPOSE_FILE" ps | grep -q "$service.*healthy"; then
            log_success "$service is healthy"
            return 0
        fi

        echo -n "."
        sleep $HEALTH_CHECK_INTERVAL
    done

    echo ""
    log_error "$service failed to become healthy after $((max_retries * HEALTH_CHECK_INTERVAL)) seconds"
    return 1
}

deploy_services() {
    log_info "Deploying services..."

    # Start database and Redis first
    log_info "Starting database and Redis..."
    VERSION=${VERSION:-latest} docker compose -f "$COMPOSE_FILE" up -d postgres redis

    # Wait for database
    if ! wait_for_health "postgres" 20; then
        log_error "Database failed to start"
        return 1
    fi

    # Wait for Redis
    if ! wait_for_health "redis" 10; then
        log_error "Redis failed to start"
        return 1
    fi

    # Deploy backend
    log_info "Deploying backend API..."
    VERSION=${VERSION:-latest} docker compose -f "$COMPOSE_FILE" up -d --no-deps backend-api

    if ! wait_for_health "backend-api"; then
        log_error "Backend API failed to start"
        return 1
    fi

    # Deploy workers
    log_info "Deploying workers..."
    VERSION=${VERSION:-latest} docker compose -f "$COMPOSE_FILE" up -d --no-deps backend-worker graph-worker

    # Deploy frontend
    log_info "Deploying frontend..."
    VERSION=${VERSION:-latest} docker compose -f "$COMPOSE_FILE" up -d --no-deps frontend

    if ! wait_for_health "frontend"; then
        log_error "Frontend failed to start"
        return 1
    fi

    # Deploy Caddy
    log_info "Deploying Caddy reverse proxy..."
    VERSION=${VERSION:-latest} docker compose -f "$COMPOSE_FILE" up -d --no-deps caddy

    if ! wait_for_health "caddy"; then
        log_error "Caddy failed to start"
        return 1
    fi

    log_success "All services deployed successfully"
}

run_migrations() {
    log_info "Running database migrations..."

    if docker compose -f "$COMPOSE_FILE" exec -T backend-api npx prisma migrate deploy; then
        log_success "Database migrations completed"
        return 0
    else
        log_error "Database migrations failed"
        return 1
    fi
}

verify_deployment() {
    log_info "Verifying deployment..."

    # Check container status
    log_info "Container status:"
    docker compose -f "$COMPOSE_FILE" ps

    # Check backend health
    if docker compose -f "$COMPOSE_FILE" exec -T backend-api wget --quiet --tries=1 --spider http://localhost:3002/health 2>/dev/null; then
        log_success "Backend health check passed"
    else
        log_error "Backend health check failed"
        return 1
    fi

    # Check frontend health
    if docker compose -f "$COMPOSE_FILE" exec -T frontend wget --quiet --tries=1 --spider http://localhost:3000/ 2>/dev/null; then
        log_success "Frontend health check passed"
    else
        log_error "Frontend health check failed"
        return 1
    fi

    log_success "Deployment verification passed"
}

show_status() {
    log_info "Deployment Status:"
    echo ""
    docker compose -f "$COMPOSE_FILE" ps
    echo ""

    log_info "Resource Usage:"
    docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}"
    echo ""
}

rollback() {
    log_warning "Rolling back deployment..."

    # Stop new containers
    docker compose -f "$COMPOSE_FILE" down --remove-orphans

    # Restore from backup if available
    LATEST_BACKUP=$(ls -t "$BACKUP_DIR"/*.dump 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        log_info "Restoring database from $LATEST_BACKUP"
        docker compose -f "$COMPOSE_FILE" up -d postgres
        sleep 10
        docker compose -f "$COMPOSE_FILE" exec -T postgres pg_restore -U smartbookmarks -d smartbookmarks -c < "$LATEST_BACKUP" || true
    fi

    log_error "Rollback completed. Please investigate the issue."
    exit 1
}

# Main deployment flow
main() {
    log_info "====================================="
    log_info "Smart Bookmarks Production Deployment"
    log_info "====================================="
    echo ""

    # Pre-deployment checks
    check_prerequisites

    # Backup before deployment
    backup_database || log_warning "Skipping backup (database may not exist yet)"

    # Build images
    build_images

    # Deploy services
    if ! deploy_services; then
        log_error "Deployment failed"
        rollback
    fi

    # Run migrations
    if ! run_migrations; then
        log_error "Migrations failed"
        rollback
    fi

    # Verify deployment
    if ! verify_deployment; then
        log_error "Verification failed"
        rollback
    fi

    # Show status
    show_status

    log_success "====================================="
    log_success "Deployment completed successfully!"
    log_success "====================================="
    echo ""
    log_info "Next steps:"
    log_info "  - Monitor logs: make logs-tail"
    log_info "  - Check health: make health"
    log_info "  - View status: make stats"
}

# Run main function
main "$@"
