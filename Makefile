# Makefile for Smart Bookmarks Docker Deployment
# Simplifies common deployment tasks

.PHONY: help build build-backend build-frontend push pull deploy deploy-prod start stop restart logs clean secrets backup restore health test

# Variables
COMPOSE_FILE ?= docker-compose.yml
COMPOSE_PROD_FILE ?= docker-compose.prod.yml
VERSION ?= $(shell git rev-parse --short HEAD)
REGISTRY ?= smartbookmarks
BACKUP_DIR ?= ./backups

# Colors for output
BLUE := \033[0;34m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

help: ## Show this help message
	@echo "$(BLUE)Smart Bookmarks - Docker Deployment Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage: make $(GREEN)<target>$(NC)\n\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(GREEN)%-20s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Development

dev: ## Start development environment
	@echo "$(BLUE)Starting development environment...$(NC)"
	docker compose -f $(COMPOSE_FILE) up -d
	@echo "$(GREEN)✓ Development environment started$(NC)"
	@make logs-tail

dev-stop: ## Stop development environment
	@echo "$(BLUE)Stopping development environment...$(NC)"
	docker compose -f $(COMPOSE_FILE) down
	@echo "$(GREEN)✓ Development environment stopped$(NC)"

dev-restart: ## Restart development environment
	@make dev-stop
	@make dev

##@ Production Build

build: build-backend build-frontend ## Build all production images

build-backend: ## Build backend production image
	@echo "$(BLUE)Building backend image...$(NC)"
	docker build \
		-f backend/Dockerfile \
		-t $(REGISTRY)/backend:$(VERSION) \
		-t $(REGISTRY)/backend:latest \
		--build-arg VERSION=$(VERSION) \
		./backend
	@echo "$(GREEN)✓ Backend image built: $(REGISTRY)/backend:$(VERSION)$(NC)"

build-frontend: ## Build frontend production image
	@echo "$(BLUE)Building frontend image...$(NC)"
	docker build \
		-f frontend/Dockerfile \
		-t $(REGISTRY)/frontend:$(VERSION) \
		-t $(REGISTRY)/frontend:latest \
		--build-arg NEXT_PUBLIC_API_URL=$(NEXT_PUBLIC_API_URL) \
		./frontend
	@echo "$(GREEN)✓ Frontend image built: $(REGISTRY)/frontend:$(VERSION)$(NC)"

##@ Docker Registry

push: ## Push images to registry
	@echo "$(BLUE)Pushing images to registry...$(NC)"
	docker push $(REGISTRY)/backend:$(VERSION)
	docker push $(REGISTRY)/backend:latest
	docker push $(REGISTRY)/frontend:$(VERSION)
	docker push $(REGISTRY)/frontend:latest
	@echo "$(GREEN)✓ Images pushed to registry$(NC)"

pull: ## Pull images from registry
	@echo "$(BLUE)Pulling images from registry...$(NC)"
	docker pull $(REGISTRY)/backend:latest
	docker pull $(REGISTRY)/frontend:latest
	@echo "$(GREEN)✓ Images pulled from registry$(NC)"

##@ Production Deployment

deploy-prod: secrets-check ## Deploy production environment (zero-downtime)
	@echo "$(BLUE)Deploying production environment...$(NC)"
	@make build
	@echo "$(YELLOW)Backing up database before deployment...$(NC)"
	@make backup
	@echo "$(YELLOW)Starting new containers...$(NC)"
	VERSION=$(VERSION) docker compose -f $(COMPOSE_PROD_FILE) up -d --no-deps --build --remove-orphans
	@echo "$(YELLOW)Waiting for health checks...$(NC)"
	@sleep 10
	@make health
	@echo "$(GREEN)✓ Production deployment complete$(NC)"

start: ## Start production environment
	@echo "$(BLUE)Starting production environment...$(NC)"
	docker compose -f $(COMPOSE_PROD_FILE) up -d
	@echo "$(GREEN)✓ Production environment started$(NC)"

stop: ## Stop production environment
	@echo "$(BLUE)Stopping production environment...$(NC)"
	docker compose -f $(COMPOSE_PROD_FILE) down
	@echo "$(GREEN)✓ Production environment stopped$(NC)"

restart: ## Restart production environment
	@echo "$(BLUE)Restarting production environment...$(NC)"
	docker compose -f $(COMPOSE_PROD_FILE) restart
	@echo "$(GREEN)✓ Production environment restarted$(NC)"

restart-backend: ## Restart backend services only
	@echo "$(BLUE)Restarting backend services...$(NC)"
	docker compose -f $(COMPOSE_PROD_FILE) restart backend-api backend-worker graph-worker
	@echo "$(GREEN)✓ Backend services restarted$(NC)"

restart-frontend: ## Restart frontend service only
	@echo "$(BLUE)Restarting frontend service...$(NC)"
	docker compose -f $(COMPOSE_PROD_FILE) restart frontend
	@echo "$(GREEN)✓ Frontend service restarted$(NC)"

##@ Monitoring & Logs

logs: ## Show all logs
	docker compose -f $(COMPOSE_PROD_FILE) logs

logs-tail: ## Tail all logs
	docker compose -f $(COMPOSE_PROD_FILE) logs -f

logs-backend: ## Show backend logs
	docker compose -f $(COMPOSE_PROD_FILE) logs -f backend-api

logs-worker: ## Show worker logs
	docker compose -f $(COMPOSE_PROD_FILE) logs -f backend-worker graph-worker

logs-frontend: ## Show frontend logs
	docker compose -f $(COMPOSE_PROD_FILE) logs -f frontend

logs-caddy: ## Show Caddy logs
	docker compose -f $(COMPOSE_PROD_FILE) logs -f caddy

health: ## Check health of all services
	@echo "$(BLUE)Checking service health...$(NC)"
	@docker compose -f $(COMPOSE_PROD_FILE) ps
	@echo ""
	@echo "$(BLUE)Container stats:$(NC)"
	@docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}"

stats: ## Show real-time container statistics
	docker stats

##@ Database Management

db-migrate: ## Run database migrations
	@echo "$(BLUE)Running database migrations...$(NC)"
	docker compose -f $(COMPOSE_PROD_FILE) exec backend-api npx prisma migrate deploy
	@echo "$(GREEN)✓ Database migrations complete$(NC)"

db-shell: ## Open PostgreSQL shell
	docker compose -f $(COMPOSE_PROD_FILE) exec postgres psql -U smartbookmarks -d smartbookmarks

db-backup: backup ## Alias for backup

backup: ## Backup PostgreSQL database
	@echo "$(BLUE)Creating database backup...$(NC)"
	@mkdir -p $(BACKUP_DIR)
	docker compose -f $(COMPOSE_PROD_FILE) exec -T postgres pg_dump -U smartbookmarks -F c smartbookmarks > $(BACKUP_DIR)/smartbookmarks_$(shell date +%Y%m%d_%H%M%S).dump
	@echo "$(GREEN)✓ Database backup created$(NC)"

restore: ## Restore PostgreSQL database from latest backup
	@echo "$(RED)WARNING: This will restore from the latest backup!$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to cancel, or wait 5 seconds to continue...$(NC)"
	@sleep 5
	@LATEST_BACKUP=$$(ls -t $(BACKUP_DIR)/*.dump | head -1); \
	echo "$(BLUE)Restoring from $$LATEST_BACKUP...$(NC)"; \
	docker compose -f $(COMPOSE_PROD_FILE) exec -T postgres pg_restore -U smartbookmarks -d smartbookmarks -c < $$LATEST_BACKUP
	@echo "$(GREEN)✓ Database restored$(NC)"

##@ Cache & Redis

redis-shell: ## Open Redis CLI
	docker compose -f $(COMPOSE_PROD_FILE) exec redis redis-cli

redis-flush: ## Flush all Redis cache
	@echo "$(RED)WARNING: This will clear all cache!$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to cancel, or wait 5 seconds to continue...$(NC)"
	@sleep 5
	docker compose -f $(COMPOSE_PROD_FILE) exec redis redis-cli FLUSHALL
	@echo "$(GREEN)✓ Redis cache cleared$(NC)"

redis-stats: ## Show Redis statistics
	docker compose -f $(COMPOSE_PROD_FILE) exec redis redis-cli INFO stats

##@ Secrets Management

secrets-generate: ## Generate new secrets
	@echo "$(BLUE)Generating secrets...$(NC)"
	@mkdir -p secrets
	@if [ ! -f secrets/postgres_password.txt ]; then \
		openssl rand -base64 32 > secrets/postgres_password.txt; \
		echo "$(GREEN)✓ Generated postgres_password$(NC)"; \
	fi
	@if [ ! -f secrets/jwt_secret.txt ]; then \
		openssl rand -base64 64 > secrets/jwt_secret.txt; \
		echo "$(GREEN)✓ Generated jwt_secret$(NC)"; \
	fi
	@if [ ! -f secrets/jwt_refresh_secret.txt ]; then \
		openssl rand -base64 64 > secrets/jwt_refresh_secret.txt; \
		echo "$(GREEN)✓ Generated jwt_refresh_secret$(NC)"; \
	fi
	@if [ ! -f secrets/openai_api_key.txt ]; then \
		echo "$(YELLOW)⚠ Please add your OpenAI API key to secrets/openai_api_key.txt$(NC)"; \
		touch secrets/openai_api_key.txt; \
	fi
	@chmod 600 secrets/*
	@echo "$(GREEN)✓ Secrets generated$(NC)"

secrets-check: ## Check if all required secrets exist
	@echo "$(BLUE)Checking secrets...$(NC)"
	@MISSING=0; \
	for secret in postgres_password jwt_secret jwt_refresh_secret openai_api_key; do \
		if [ ! -f secrets/$$secret.txt ]; then \
			echo "$(RED)✗ Missing: secrets/$$secret.txt$(NC)"; \
			MISSING=1; \
		elif [ ! -s secrets/$$secret.txt ]; then \
			echo "$(RED)✗ Empty: secrets/$$secret.txt$(NC)"; \
			MISSING=1; \
		else \
			echo "$(GREEN)✓ Found: secrets/$$secret.txt$(NC)"; \
		fi \
	done; \
	if [ $$MISSING -eq 1 ]; then \
		echo ""; \
		echo "$(RED)Missing required secrets! Run 'make secrets-generate' first.$(NC)"; \
		exit 1; \
	fi
	@echo "$(GREEN)✓ All secrets present$(NC)"

##@ Maintenance

clean: ## Clean up stopped containers and unused resources
	@echo "$(BLUE)Cleaning up Docker resources...$(NC)"
	docker compose -f $(COMPOSE_PROD_FILE) down --remove-orphans
	docker system prune -f
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-all: ## Remove all containers, volumes, and images
	@echo "$(RED)WARNING: This will remove all data!$(NC)"
	@echo "$(YELLOW)Press Ctrl+C to cancel, or wait 5 seconds to continue...$(NC)"
	@sleep 5
	docker compose -f $(COMPOSE_PROD_FILE) down -v --remove-orphans
	docker system prune -af --volumes
	@echo "$(GREEN)✓ All resources removed$(NC)"

update: ## Update to latest images and restart
	@echo "$(BLUE)Updating to latest images...$(NC)"
	@make pull
	@make backup
	@make restart
	@echo "$(GREEN)✓ Update complete$(NC)"

##@ Testing

test-build: ## Test build process without pushing
	@echo "$(BLUE)Testing build process...$(NC)"
	@make build
	@echo "$(GREEN)✓ Build test complete$(NC)"

test-health: ## Test health checks
	@echo "$(BLUE)Testing health checks...$(NC)"
	@sleep 5
	@docker compose -f $(COMPOSE_PROD_FILE) exec backend-api wget --quiet --tries=1 --spider http://localhost:3002/health && echo "$(GREEN)✓ Backend healthy$(NC)" || echo "$(RED)✗ Backend unhealthy$(NC)"
	@docker compose -f $(COMPOSE_PROD_FILE) exec frontend wget --quiet --tries=1 --spider http://localhost:3000/ && echo "$(GREEN)✓ Frontend healthy$(NC)" || echo "$(RED)✗ Frontend unhealthy$(NC)"

##@ Utility

shell-backend: ## Open shell in backend container
	docker compose -f $(COMPOSE_PROD_FILE) exec backend-api sh

shell-frontend: ## Open shell in frontend container
	docker compose -f $(COMPOSE_PROD_FILE) exec frontend sh

prune-images: ## Remove dangling images
	docker image prune -f

prune-volumes: ## Remove unused volumes
	@echo "$(RED)WARNING: This may remove data!$(NC)"
	docker volume prune -f
