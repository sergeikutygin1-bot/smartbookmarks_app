# Phase 1 Security Testing Guide

## 🎯 Testing Overview

Phase 1 implemented 4 critical security features. This guide provides step-by-step tests to verify each one works correctly.

**Testing Time:** ~15 minutes
**Prerequisites:**
- Docker services running (`docker-compose ps`)
- Frontend accessible at http://localhost:3000
- Backend accessible at http://localhost:3002

---

## Test 1: Security Headers (Helmet.js) ✅

### What We're Testing
Verify that security headers are present and configured correctly.

### Test 1.1: Check Headers via Browser DevTools

**Steps:**
1. Open http://localhost:3000 in browser
2. Open DevTools (F12 or Cmd+Option+I)
3. Go to **Network** tab
4. Refresh page
5. Click on any request to backend (e.g., `/health` or `/api/bookmarks`)
6. Click **Headers** tab
7. Look for these headers in **Response Headers**:

**Expected Headers:**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'...
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
X-XSS-Protection: 0
X-API-Version: 1.0.0
```

**✅ PASS:** All headers present
**❌ FAIL:** Any header missing

### Test 1.2: Command-Line Verification

```bash
curl -I http://localhost:3002/health | grep -E "(Content-Security-Policy|X-Frame-Options|Strict-Transport|X-API-Version)"
```

**Expected Output:**
```
Content-Security-Policy: ...
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
X-Frame-Options: DENY
X-API-Version: 1.0.0
```

**✅ PASS:** All 4 headers printed
**❌ FAIL:** Missing headers

---

## Test 2: CSRF Protection ✅

### What We're Testing
Verify that state-changing requests require CSRF tokens when using cookie authentication.

### Test 2.1: Verify CSRF Token Endpoint

**Steps:**
1. Login at http://localhost:3000/login
   - Email: `admin@smartbookmarks.app`
   - Password: (use your password, or let me know if you need to reset it)

2. Open DevTools → Console
3. Run this code:
```javascript
fetch('http://localhost:3002/api/v1/auth/csrf-token', {
  credentials: 'include'
})
.then(r => r.json())
.then(data => console.log('CSRF Token:', data.csrfToken))
```

**Expected Output:**
```
CSRF Token: <long-random-string>
```

**✅ PASS:** Token received
**❌ FAIL:** Error or no token

### Test 2.2: Test CSRF Protection (Negative Test)

**This test should FAIL (that's good - it means CSRF is working!)**

Open Terminal and run:
```bash
# First, login and capture cookies
curl -c cookies.txt -X POST http://localhost:3002/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smartbookmarks.app","password":"YOUR_PASSWORD"}'

# Try to create bookmark WITHOUT CSRF token (should be rejected)
curl -b cookies.txt -X POST http://localhost:3002/api/bookmarks \
  -H "Content-Type: application/json" \
  -d '{"url":"https://test.com","title":"Test"}'
```

**Expected Output:**
```json
{
  "error": "CSRF token missing",
  "message": "Include X-CSRF-Token header in your request"
}
```

**✅ PASS:** Request rejected with 403 error
**❌ FAIL:** Bookmark created (CSRF protection not working!)

### Test 2.3: Test CSRF Protection (Positive Test)

**This test should SUCCEED (CSRF token included)**

**Steps:**
1. Go to http://localhost:3000
2. Login as admin
3. Try to **create a new bookmark** through the UI
4. Open DevTools → Network tab
5. Find the POST request to `/api/bookmarks`
6. Check **Request Headers** for `X-CSRF-Token`

**Expected:**
- `X-CSRF-Token: <token>` header present
- Bookmark created successfully

**✅ PASS:** Bookmark created, CSRF token in headers
**❌ FAIL:** Request fails or no CSRF token

### Test 2.4: Bearer Token Bypass (Should Work)

API clients using Bearer tokens should bypass CSRF:

```bash
# Get Bearer token (from login response)
TOKEN="<your-jwt-token>"

# This should work WITHOUT CSRF token
curl -X POST http://localhost:3002/api/bookmarks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://bypass-test.com","title":"Bearer Test"}'
```

**Expected:** Bookmark created (200/201 status)

**✅ PASS:** Works without CSRF token
**❌ FAIL:** Request rejected

---

## Test 3: XSS Protection (DOMPurify) ✅

### What We're Testing
Verify that malicious scripts are stripped from user inputs.

### Test 3.1: XSS in Bookmark Title

**Steps:**
1. Login at http://localhost:3000
2. Create a new bookmark with:
   - **URL:** `https://example.com`
   - **Title:** `<script>alert('XSS')</script>Dangerous Title`

3. Check the created bookmark

**Expected Result:**
- Title should be: `Dangerous Title`
- Script tags completely removed
- No alert popup appears

**✅ PASS:** Script tags stripped, safe text kept
**❌ FAIL:** Script tags remain or alert appears

### Test 3.2: XSS in Bookmark Notes (Safe HTML Preserved)

**Steps:**
1. Create bookmark with notes:
```
<strong>Bold text</strong> is safe
<script>alert('XSS')</script> is dangerous
<em>Italic text</em> is also safe
```

2. Check the saved notes

**Expected Result:**
```
Bold text is safe
 is dangerous
Italic text is also safe
```

- `<strong>` and `<em>` tags preserved (safe HTML)
- `<script>` tags completely removed
- Text content kept

**✅ PASS:** Safe HTML kept, scripts removed
**❌ FAIL:** Script tags remain

### Test 3.3: JavaScript Protocol in URL

**Steps:**
1. Try to create bookmark with URL:
   - **URL:** `javascript:alert('XSS')`

**Expected Result:**
- Request fails with error
- OR URL sanitized to safe value

**✅ PASS:** JavaScript URL rejected/sanitized
**❌ FAIL:** Malicious URL accepted

### Test 3.4: XSS in Tags

**Steps:**
1. Create bookmark with tags:
```
["<script>bad</script>", "normal-tag", "<img onerror=alert(1)>"]
```

2. Check saved tags

**Expected Result:**
```
["normal-tag"]
```
- Only safe tag kept
- Malicious tags stripped

**✅ PASS:** Only safe tags saved
**❌ FAIL:** Malicious tags remain

### Test 3.5: Command-Line XSS Test

```bash
# Login first (save cookies)
curl -c cookies.txt -X POST http://localhost:3002/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smartbookmarks.app","password":"YOUR_PASSWORD"}'

# Get CSRF token
CSRF_TOKEN=$(curl -s -b cookies.txt http://localhost:3002/api/v1/auth/csrf-token | jq -r .csrfToken)

# Try XSS payload in bookmark
curl -b cookies.txt -X POST http://localhost:3002/api/bookmarks \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF_TOKEN" \
  -d '{
    "url": "https://test.com",
    "title": "<script>alert(\"XSS\")</script>Test",
    "notes": "<strong>Safe</strong> <script>bad()</script>"
  }'

# Check the created bookmark
curl -s -b cookies.txt http://localhost:3002/api/bookmarks | jq '.data[0].title'
```

**Expected Output:**
```
"Test"
```

**✅ PASS:** Script tags removed
**❌ FAIL:** Script tags in response

---

## Test 4: JWT Secret Rotation ✅

### What We're Testing
Verify that new JWT secrets are being used.

### Test 4.1: Check Environment Variables

```bash
# Check that new JWT secrets are in use
docker exec smartbookmarks_backend printenv | grep JWT_SECRET
```

**Expected Output:**
```
JWT_SECRET=x+wIkUpHF6TEr/RLS6HWCI5TzQwZ6IleNiCnNhZQRAQ=
JWT_REFRESH_SECRET=QTOhnV27WeqvqaE/nIGFUg1G69CeDvcUjE1n3HQZAh4=
```

**✅ PASS:** New secrets match Phase 1 values
**❌ FAIL:** Old secrets still in use

### Test 4.2: Old Tokens Invalid

**Note:** This test only works if you have old tokens from before secret rotation.

If you have an old JWT token, try using it:
```bash
curl http://localhost:3002/api/bookmarks \
  -H "Authorization: Bearer <old-token>"
```

**Expected Result:**
```json
{"error": "Unauthorized", "message": "Invalid token"}
```

**✅ PASS:** Old token rejected
**❌ FAIL:** Old token still works

### Test 4.3: New Tokens Work

```bash
# Login to get new token
curl -X POST http://localhost:3002/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@smartbookmarks.app","password":"YOUR_PASSWORD"}' \
  | jq -r .tokens.accessToken

# Use new token
curl http://localhost:3002/api/bookmarks \
  -H "Authorization: Bearer <new-token>"
```

**Expected:** List of bookmarks returned

**✅ PASS:** New token works
**❌ FAIL:** New token rejected

---

## Test 5: Integration Test (All Features Together) ✅

### End-to-End User Flow

**Steps:**
1. Open http://localhost:3000 in **Incognito/Private window**
2. Register new user:
   - Email: `test-phase1@example.com`
   - Password: `TestPhase1!`
3. Verify received in inbox (if email configured)
4. Login with new credentials
5. Create bookmark with XSS payload:
   - URL: `https://github.com/anthropics/claude`
   - Title: `<script>alert('xss')</script>Claude AI`
   - Notes: `<strong>Bold</strong> <script>bad()</script> text`
   - Tags: `["ai", "<script>bad</script>"]`
6. Verify bookmark created
7. Check bookmark details
8. Edit bookmark
9. Delete bookmark
10. Logout

**Expected Results:**
- ✅ All operations succeed
- ✅ No script tags in saved data
- ✅ Safe HTML preserved in notes
- ✅ Bad tags removed
- ✅ No JavaScript alerts
- ✅ All requests include CSRF tokens (check DevTools)
- ✅ Security headers present on all responses

---

## 📊 Testing Checklist

### Security Headers (4 tests)
- [ ] Headers visible in DevTools
- [ ] Command-line verification passes
- [ ] CSP header configured correctly
- [ ] X-Frame-Options set to DENY

### CSRF Protection (4 tests)
- [ ] CSRF token endpoint works
- [ ] Request without CSRF token rejected
- [ ] Request with CSRF token succeeds
- [ ] Bearer tokens bypass CSRF

### XSS Protection (5 tests)
- [ ] Script tags stripped from title
- [ ] Safe HTML preserved in notes
- [ ] JavaScript URLs blocked
- [ ] Script tags stripped from tags
- [ ] Command-line XSS test passes

### JWT Secrets (3 tests)
- [ ] New secrets in environment
- [ ] Old tokens invalid (if available)
- [ ] New tokens work

### Integration (1 test)
- [ ] End-to-end flow works with all features

---

## 🚨 What to Do If Tests Fail

### If Security Headers Missing:
```bash
# Check if backend is running
docker-compose ps

# Check backend logs
docker logs smartbookmarks_backend --tail 50

# Restart backend
docker-compose restart backend-api
```

### If CSRF Not Working:
```bash
# Check if CSRF middleware is loaded
docker logs smartbookmarks_backend | grep -i csrf

# Check frontend auth helper
# Frontend should automatically fetch and include CSRF tokens
```

### If XSS Sanitization Fails:
```bash
# Check if DOMPurify is installed
docker exec smartbookmarks_backend npm list isomorphic-dompurify

# Check sanitization in action
docker logs smartbookmarks_backend --tail 50
```

### If JWT Issues:
```bash
# Verify JWT secrets in container
docker exec smartbookmarks_backend printenv | grep JWT

# Restart backend to load new secrets
docker-compose restart backend-api
```

---

## 🎯 Quick Smoke Test (2 minutes)

If you just want a quick verification:

```bash
# 1. Check security headers
curl -sI http://localhost:3002/health | grep -E "(X-Frame-Options|X-API-Version)"

# 2. Try XSS in bookmark (requires login first)
# Open browser, login, create bookmark with title: <script>alert(1)</script>Test
# Verify title becomes: Test

# 3. Check backend logs for any errors
docker logs smartbookmarks_backend --tail 20
```

---

## 📝 Test Results Template

Copy this to document your test results:

```markdown
# Phase 1 Testing Results

**Date:** 2026-01-20
**Tester:** Your Name
**Environment:** Development (localhost)

## Test Results

### Security Headers
- [ ] Test 1.1: Browser DevTools - PASS/FAIL
- [ ] Test 1.2: Command-line - PASS/FAIL

### CSRF Protection
- [ ] Test 2.1: Token endpoint - PASS/FAIL
- [ ] Test 2.2: Negative test - PASS/FAIL
- [ ] Test 2.3: Positive test - PASS/FAIL
- [ ] Test 2.4: Bearer bypass - PASS/FAIL

### XSS Protection
- [ ] Test 3.1: Title XSS - PASS/FAIL
- [ ] Test 3.2: Notes HTML - PASS/FAIL
- [ ] Test 3.3: JS protocol - PASS/FAIL
- [ ] Test 3.4: Tag XSS - PASS/FAIL
- [ ] Test 3.5: CLI test - PASS/FAIL

### JWT Secrets
- [ ] Test 4.1: New secrets - PASS/FAIL
- [ ] Test 4.2: Old tokens - PASS/FAIL
- [ ] Test 4.3: New tokens - PASS/FAIL

### Integration
- [ ] Test 5: E2E flow - PASS/FAIL

## Issues Found
(List any failures or unexpected behavior)

## Overall Status
✅ All tests passed
❌ X tests failed (see issues above)
```

---

**Next Steps After Testing:**
1. If all tests pass → Ready for Phase 2!
2. If tests fail → Review logs and fix issues
3. Document any issues found for future reference
