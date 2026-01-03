#!/bin/bash
# Setup script for production secrets
# Run this once during initial deployment

set -euo pipefail

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "Setting up production secrets..."

# Create secrets directory
mkdir -p secrets
chmod 700 secrets

# Generate PostgreSQL password
if [ ! -f secrets/postgres_password.txt ]; then
    openssl rand -base64 32 > secrets/postgres_password.txt
    echo -e "${GREEN}✓ Generated postgres_password${NC}"
else
    echo -e "${YELLOW}⚠ postgres_password already exists, skipping${NC}"
fi

# Generate JWT secret
if [ ! -f secrets/jwt_secret.txt ]; then
    openssl rand -base64 64 > secrets/jwt_secret.txt
    echo -e "${GREEN}✓ Generated jwt_secret${NC}"
else
    echo -e "${YELLOW}⚠ jwt_secret already exists, skipping${NC}"
fi

# Generate JWT refresh secret
if [ ! -f secrets/jwt_refresh_secret.txt ]; then
    openssl rand -base64 64 > secrets/jwt_refresh_secret.txt
    echo -e "${GREEN}✓ Generated jwt_refresh_secret${NC}"
else
    echo -e "${YELLOW}⚠ jwt_refresh_secret already exists, skipping${NC}"
fi

# OpenAI API key (must be added manually)
if [ ! -f secrets/openai_api_key.txt ]; then
    echo -e "${YELLOW}⚠ Please add your OpenAI API key to secrets/openai_api_key.txt${NC}"
    echo -n "Enter OpenAI API key (or press Enter to skip): "
    read -r api_key
    if [ -n "$api_key" ]; then
        echo "$api_key" > secrets/openai_api_key.txt
        echo -e "${GREEN}✓ Saved openai_api_key${NC}"
    else
        touch secrets/openai_api_key.txt
        echo -e "${YELLOW}⚠ Created empty openai_api_key.txt - YOU MUST ADD YOUR KEY MANUALLY${NC}"
    fi
else
    echo -e "${YELLOW}⚠ openai_api_key already exists, skipping${NC}"
fi

# Secure all secrets
chmod 600 secrets/*

echo ""
echo -e "${GREEN}✓ Secrets setup complete!${NC}"
echo ""
echo "Next steps:"
echo "1. Verify secrets/openai_api_key.txt contains your API key"
echo "2. Copy .env.production.example to .env.production and configure it"
echo "3. Run 'make build' to build Docker images"
echo "4. Run 'make deploy-prod' to deploy"
