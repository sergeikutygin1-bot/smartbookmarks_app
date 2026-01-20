# Manual Secret Rotation Required

## Completed
- ✅ Generated new JWT_SECRET and JWT_REFRESH_SECRET
- ✅ Updated backend/.env with new JWT secrets
- ✅ Created comprehensive backend/.env.example template
- ✅ Verified .env is in .gitignore

## Manual Actions Required

### 1. Rotate OpenAI API Key
**Current exposed key**: `sk-proj-buy7zj...` (visible in git history)

**Actions**:
1. Go to https://platform.openai.com/api-keys
2. Create a new API key
3. Update `OPENAI_API_KEY` in `backend/.env`
4. Delete the old key from OpenAI dashboard

### 2. Rotate LangChain API Key
**Current exposed key**: `lsv2_pt_1b7e4405...` (visible in git history)

**Actions**:
1. Go to https://smith.langchain.com/settings
2. Create a new API key
3. Update `LANGCHAIN_API_KEY` in `backend/.env`
4. Delete the old key from LangSmith dashboard

### 3. Rotate Google OAuth Credentials
**Current exposed credentials** (visible in git history):
- Client ID: `[REDACTED - see old commits if needed]`
- Client Secret: `[REDACTED - see old commits if needed]`

**Actions**:
1. Go to https://console.cloud.google.com/apis/credentials
2. Create a new OAuth 2.0 Client ID
3. Set redirect URI: `http://localhost:3002/api/v1/auth/google/callback`
4. Update `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `backend/.env`
5. Delete old OAuth client from Google Cloud Console

### 4. Update GitHub OAuth Credentials
**Current status**: Placeholder values (need real credentials)

**Actions**:
1. Go to https://github.com/settings/developers
2. Create a new OAuth App
3. Set callback URL: `http://localhost:3002/api/v1/auth/github/callback`
4. Update `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `backend/.env`

### 5. Git History Cleanup (OPTIONAL - DESTRUCTIVE)

**Warning**: This will rewrite git history and require force push!

The plan suggested using `git filter-repo` to remove .env from history:
```bash
git filter-repo --path backend/.env --invert-paths
git push origin main --force
```

**Recommendation**: Only do this if:
- You've rotated ALL secrets above first
- You've coordinated with all team members
- You understand this rewrites history

**Alternative**: If this is a private project, simply rotating the secrets is sufficient.

## Verification After Rotation

After updating all secrets in backend/.env:
```bash
# Restart Docker services with new secrets
docker-compose down
docker-compose up -d

# Test authentication
curl -X POST http://localhost:3002/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpass"}'

# Test OpenAI enrichment (create a bookmark and verify enrichment works)
```
