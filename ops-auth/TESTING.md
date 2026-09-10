# Testing Big Beard Ops Auth

Testing plan for the ops-auth service before moving to custom domain.

## Testing Approach

We'll deploy to the default Cloudflare Workers domain first:
- **Test URL:** `https://ops-auth.<your-subdomain>.workers.dev/`
- **Duration:** Test for stability and functionality
- **After success:** Move to custom domain `ops.bigbeardapps.com`

## Phase 1: Deployment Test (workers.dev)

### Deploy to workers.dev

After fixing API token permissions, complete steps 2-6 from QUICKSTART.md:

```bash
cd ops-auth
export CLOUDFLARE_API_TOKEN=$CLOUDFARE_API_TOKEN

# Create database
npx wrangler d1 create ops-auth-db

# Update wrangler.toml with database ID (from output above)
# Then run migrations
npx wrangler d1 execute ops-auth-db --file=schema.sql --remote

# Set secrets
npx wrangler secret put SESSION_SECRET
# Enter a random 64-char hex string

npx wrangler secret put ADMIN_PASSWORD
# Enter a test password

# Deploy
npx wrangler deploy
```

**Note the deployment URL** - it will look like:
```
✨ Deployed ops-auth to https://ops-auth.raul-c-pena-gmail-com.workers.dev
```

## Phase 2: Functional Testing

### Test 1: Login Page Loads

**URL:** `https://ops-auth.<subdomain>.workers.dev/`

**Expected:**
- ✅ Login page displays
- ✅ Big Beard branding visible (🧔)
- ✅ Password input field present
- ✅ "Sign In" button present
- ✅ Page is styled correctly (blue gradient background, white card)

### Test 2: Successful Login

**Steps:**
1. Enter the admin password you set
2. Click "Sign In"

**Expected:**
- ✅ Button shows "Signing in..." loading state
- ✅ Redirects to `/dashboard`
- ✅ Dashboard shows success message
- ✅ "Welcome to Big Beard Ops" heading visible
- ✅ "Sign Out" button present

### Test 3: Failed Login

**Steps:**
1. Go back to login page
2. Enter wrong password
3. Click "Sign In"

**Expected:**
- ✅ Error message appears: "Invalid password"
- ✅ Password field is cleared
- ✅ Focus returns to password field
- ✅ Page doesn't redirect

### Test 4: Session Persistence

**Steps:**
1. Log in successfully
2. Open new tab to same worker URL
3. Should land directly on dashboard (without login)

**Expected:**
- ✅ New tab shows dashboard immediately
- ✅ No login required (session cookie works)

### Test 5: Logout

**Steps:**
1. From dashboard, click "Sign Out"

**Expected:**
- ✅ Redirects to login page
- ✅ Session is cleared
- ✅ Trying to access `/dashboard` redirects to login

### Test 6: Session Verification

**Steps:**
1. Log in via browser
2. Open browser DevTools → Network tab
3. Look at the login response headers
4. Copy the `session` cookie value

**Test with curl:**
```bash
# Verify session
curl https://ops-auth.<subdomain>.workers.dev/api/verify \
  -H "Cookie: session=YOUR_SESSION_VALUE"

# Expected: {"authenticated":true}
```

### Test 7: API Login

**Test direct API login:**
```bash
curl -X POST https://ops-auth.<subdomain>.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_ADMIN_PASSWORD"}' \
  -v
```

**Expected response:**
```json
{
  "success": true,
  "sessionId": "...",
  "expiresAt": 1234567890
}
```

**Expected headers:**
- `Set-Cookie: session=...; HttpOnly; Secure; SameSite=Strict`

### Test 8: Protected Route

**Steps:**
1. Log out completely
2. Try to access `/dashboard` directly

**Expected:**
- ✅ Redirects to `/` (login page)
- ✅ Dashboard not accessible without auth

### Test 9: Invalid API Requests

```bash
# Login without password
curl -X POST https://ops-auth.<subdomain>.workers.dev/api/login \
  -H "Content-Type: application/json" \
  -d '{}'

# Expected: {"error":"Password required"} with 400 status

# Verify without session
curl https://ops-auth.<subdomain>.workers.dev/api/verify

# Expected: {"authenticated":false}
```

### Test 10: Database Verification

**Check sessions are stored:**
```bash
npx wrangler d1 execute ops-auth-db --remote \
  --command "SELECT id, user_id, created_at, expires_at FROM sessions"
```

**Expected:**
- Should show active sessions from your tests
- `expires_at` should be ~30 days in future

## Phase 3: Security Testing

### Security Test 1: Cookie Attributes

**Steps:**
1. Log in via browser
2. Open DevTools → Application → Cookies
3. Find `session` cookie

**Expected attributes:**
- ✅ HttpOnly: true (can't access via JavaScript)
- ✅ Secure: true (HTTPS only)
- ✅ SameSite: Strict (CSRF protection)
- ✅ Path: /
- ✅ Max-Age: ~2592000 (30 days)

### Security Test 2: JavaScript Cookie Access

**Steps:**
1. Log in
2. Open browser console
3. Try: `document.cookie`

**Expected:**
- ✅ Session cookie NOT visible (HttpOnly protection)

### Security Test 3: Session Expiration

**Manual test (or wait 30 days):**
```bash
# Manually expire a session in database
npx wrangler d1 execute ops-auth-db --remote \
  --command "UPDATE sessions SET expires_at = 0 WHERE id = 'YOUR_SESSION_ID'"

# Then try to access dashboard
# Expected: Redirect to login
```

## Phase 4: Load Testing (Optional)

### Basic Load Test

Test with multiple concurrent logins:

```bash
# Install hey if not available
# brew install hey (macOS) or apt-get install hey (Linux)

# Test login endpoint (be careful not to DoS yourself)
hey -n 100 -c 10 -m POST \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_PASSWORD"}' \
  https://ops-auth.<subdomain>.workers.dev/api/login
```

**Expected:**
- ✅ All requests succeed (200 status)
- ✅ Worker handles concurrent requests
- ✅ D1 database doesn't fail

## Phase 5: Success Criteria

Before moving to custom domain, verify:

- [ ] All 10 functional tests pass
- [ ] All 3 security tests pass
- [ ] Session cookies work correctly
- [ ] Database stores sessions properly
- [ ] No console errors in browser
- [ ] Worker logs show no errors (`npx wrangler tail`)
- [ ] UI looks good on mobile and desktop
- [ ] Login/logout flow is smooth

## Phase 6: Move to Custom Domain

Once all tests pass:

**Add custom domain:**
```bash
npx wrangler domains add ops.bigbeardapps.com
```

**Or via dashboard:**
1. Workers & Pages → ops-auth
2. Settings → Domains & Routes
3. Add → Custom Domain
4. Enter: `ops.bigbeardapps.com`

**Then repeat functional tests on custom domain:**
- Test login at `https://ops.bigbeardapps.com/`
- Verify SSL certificate is valid
- Check DNS propagation: `dig ops.bigbeardapps.com`

## Troubleshooting

### Login fails immediately
- Check secrets are set: `npx wrangler secret list`
- View logs: `npx wrangler tail`
- Verify database has tables: `npx wrangler d1 execute ops-auth-db --remote --command "SELECT name FROM sqlite_master WHERE type='table'"`

### Session not persisting
- Check cookie is set (DevTools → Application → Cookies)
- Verify cookie attributes are correct
- Check browser doesn't block third-party cookies

### Dashboard shows blank page
- Check browser console for JavaScript errors
- View Worker logs: `npx wrangler tail`
- Try hard refresh: Ctrl+Shift+R (or Cmd+Shift+R)

### Database errors
- Verify migrations ran: `npx wrangler d1 execute ops-auth-db --remote --command ".tables"`
- Check wrangler.toml has correct database_id
- Ensure database binding name is "DB"

## Monitoring

**During testing, keep logs running:**
```bash
npx wrangler tail
```

This shows real-time requests, errors, and console.log output.

**Check for:**
- ✅ 200 responses for successful operations
- ✅ Appropriate error codes (401, 400, etc.)
- ❌ No 500 errors
- ❌ No database connection failures
- ❌ No unhandled exceptions

## Success!

When all tests pass, the service is production-ready for:
- Internal Big Beard Apps operations tools
- Integration with other services via API
- Custom domain deployment

---

**Testing duration:** Estimated 30-45 minutes for complete test suite  
**After success:** Ready to move to `ops.bigbeardapps.com`
