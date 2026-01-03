# Production Deployment Setup - GitHub Configuration

This guide covers setting up GitHub for automated CI/CD deployments.

## Required GitHub Secrets

Navigate to **Settings → Secrets and variables → Actions** and add the following secrets:

### Docker Registry Secrets

```
DOCKER_USERNAME
```
Your Docker Hub username.

**Example**: `smartbookmarks`

---

```
DOCKER_PASSWORD
```
Your Docker Hub password or access token (recommended).

**How to create token**:
1. Go to https://hub.docker.com/settings/security
2. Click "New Access Token"
3. Name: "GitHub Actions"
4. Permissions: Read & Write
5. Copy token and add to GitHub secrets

---

### Production Server Secrets

```
PRODUCTION_HOST
```
Your production server IP address or domain.

**Example**: `123.45.67.89` or `server.example.com`

---

```
PRODUCTION_USER
```
SSH username for production server.

**Example**: `deploy` or `ubuntu`

---

```
PRODUCTION_SSH_KEY
```
SSH private key for production server access.

**How to create**:
```bash
# On your local machine
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/github_deploy

# Copy private key (paste this into GitHub secret)
cat ~/.ssh/github_deploy

# Copy public key to server
ssh-copy-id -i ~/.ssh/github_deploy.pub user@server
```

**IMPORTANT**: Paste the entire private key including header/footer:
```
-----BEGIN OPENSSH PRIVATE KEY-----
...
-----END OPENSSH PRIVATE KEY-----
```

---

```
PRODUCTION_SSH_PORT
```
SSH port for production server (default: 22).

**Example**: `22` or `2222`

---

```
PRODUCTION_DOMAIN
```
Your production domain name.

**Example**: `bookmarks.example.com`

---

```
NEXT_PUBLIC_API_URL
```
Public-facing API URL (used by browser).

**Example**: `https://bookmarks.example.com`

**IMPORTANT**: Must match your Caddy domain configuration.

---

## Server Setup

### 1. Create Deployment User

```bash
# SSH into server
ssh root@your-server

# Create deploy user
adduser deploy
usermod -aG docker deploy
usermod -aG sudo deploy

# Setup SSH key
mkdir -p /home/deploy/.ssh
chmod 700 /home/deploy/.ssh

# Add GitHub Actions public key
echo "YOUR_PUBLIC_KEY_HERE" >> /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
```

### 2. Clone Repository

```bash
# Switch to deploy user
su - deploy

# Create app directory
sudo mkdir -p /opt/smartbookmarks
sudo chown deploy:deploy /opt/smartbookmarks

# Clone repository
cd /opt/smartbookmarks
git clone https://github.com/yourusername/smart_bookmarks_v2.git .
```

### 3. Initial Setup

```bash
# Generate secrets
./scripts/setup-secrets.sh

# Configure environment
cp .env.production.example .env.production
nano .env.production  # Edit configuration

# Initial deployment
make build
make deploy-prod
```

---

## Testing GitHub Actions

### Test Build Workflow

1. Create a test branch:
```bash
git checkout -b test-ci
git push origin test-ci
```

2. Open a pull request to `main`

3. Verify GitHub Actions runs:
   - ✅ Backend build completes
   - ✅ Frontend build completes
   - ✅ Trivy security scans pass
   - ✅ Test deployment succeeds

### Test Production Deployment

1. Merge PR to `main` branch

2. Verify GitHub Actions:
   - ✅ Images built and pushed to Docker Hub
   - ✅ SSH connection to server succeeds
   - ✅ Deployment script runs
   - ✅ Health checks pass

3. Verify deployment:
```bash
# Check server
ssh deploy@your-server
cd /opt/smartbookmarks
make health
```

---

## Monitoring Deployments

### GitHub Actions Dashboard

View deployments at:
```
https://github.com/yourusername/smart_bookmarks_v2/actions
```

### Deployment Logs

Click on any workflow run to view:
- Build logs
- Security scan results
- Deployment output
- Health check results

### Failed Deployments

If deployment fails:

1. **Check GitHub Actions logs**:
   - Build errors
   - SSH connection issues
   - Deployment script failures

2. **Check server logs**:
```bash
ssh deploy@your-server
cd /opt/smartbookmarks
make logs-tail
```

3. **Rollback if needed**:
```bash
ssh deploy@your-server
cd /opt/smartbookmarks
make stop
git checkout <previous-commit>
make build && make start
```

---

## Security Best Practices

### SSH Key Security

- ✅ Use separate SSH key for GitHub Actions
- ✅ Use ed25519 key type (more secure than RSA)
- ✅ Never commit private keys to git
- ✅ Rotate keys every 90 days

### Docker Hub Security

- ✅ Use access tokens instead of passwords
- ✅ Limit token permissions to Read & Write only
- ✅ Rotate tokens every 90 days
- ✅ Review token usage regularly

### GitHub Secrets Security

- ✅ Only repository admins can view/edit secrets
- ✅ Secrets are encrypted at rest
- ✅ Secrets are redacted in logs
- ✅ Audit secret access in GitHub logs

---

## Troubleshooting

### "Permission denied (publickey)" Error

**Solution**:
1. Verify public key added to server:
```bash
cat /home/deploy/.ssh/authorized_keys
```

2. Check SSH key format in GitHub secret (must include header/footer)

3. Verify deploy user has docker group access:
```bash
groups deploy
# Should include: deploy docker
```

### "docker: command not found" Error

**Solution**:
```bash
# Add deploy user to docker group
sudo usermod -aG docker deploy

# Logout and login again
exit
ssh deploy@your-server
```

### Build Fails with "Out of memory"

**Solution**: Increase GitHub Actions runner resources or reduce concurrent builds.

### Deployment Fails with "Health check timeout"

**Solution**:
1. Check server resources: `make stats`
2. Increase health check timeout in workflow
3. Check service logs: `make logs-tail`

---

## Workflow Customization

### Change Deployment Branch

Edit `.github/workflows/docker-build.yml`:

```yaml
on:
  push:
    branches:
      - production  # Change from 'main' to 'production'
```

### Disable Automatic Deployment

Remove the `deploy` job or add manual approval:

```yaml
deploy:
  environment:
    name: production
  # Requires manual approval in GitHub UI
```

### Add Slack Notifications

Add to workflow:

```yaml
- name: Notify Slack
  uses: 8398a7/action-slack@v3
  with:
    status: ${{ job.status }}
    webhook_url: ${{ secrets.SLACK_WEBHOOK }}
```

---

## Manual Deployment (Without GitHub Actions)

If you prefer manual deployments:

```bash
# Local machine
make build
make push

# Production server
ssh deploy@your-server
cd /opt/smartbookmarks
make pull
make deploy-prod
```

---

## Monitoring Deployments

### Uptime Monitoring

Use external monitoring:
- [Uptime Robot](https://uptimerobot.com/) (free)
- [Healthchecks.io](https://healthchecks.io/) (free)
- [Pingdom](https://www.pingdom.com/)

Monitor:
- `https://yourdomain.com/` (frontend)
- `https://yourdomain.com/api/health` (backend)

### Deployment Notifications

Configure GitHub notifications:
1. Go to repository settings
2. **Webhooks** → Add webhook
3. Payload URL: Your notification service
4. Events: Workflow runs

---

## Cost Considerations

### GitHub Actions Minutes

- Free tier: 2,000 minutes/month
- Each deployment: ~5-10 minutes
- **Budget**: ~200-400 deployments/month (free)

If you exceed free tier:
- GitHub Actions pricing: $0.008/minute
- **Cost**: ~$0.05-0.10 per deployment

### Docker Hub

- Free tier: Unlimited public images
- Rate limits: 100 pulls/6 hours (anonymous), 200 pulls/6 hours (authenticated)

If you need more:
- Pro plan: $5/month (unlimited pulls)

---

## Next Steps

1. ✅ Add all GitHub secrets
2. ✅ Configure production server
3. ✅ Test deployment with pull request
4. ✅ Monitor first production deployment
5. ✅ Set up external monitoring
6. ✅ Configure backup automation

---

## Support

- **GitHub Actions Docs**: https://docs.github.com/en/actions
- **Docker Hub**: https://hub.docker.com/
- **Deployment Guide**: [docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)
