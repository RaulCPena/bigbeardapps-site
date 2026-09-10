# Big Beard Ops - Production Deployment Guide

**Status:** Ready for deployment (pending Cloudflare credentials)  
**Target:** `https://ops.bigbeardapps.com`  
**Current Branch:** `cursor/ops-auth-login-f188`

---

## Prerequisites Checklist

Before starting deployment, ensure you have:

- [x] Source code committed and pushed
- [x] TypeScript compilation verified (no errors)
- [x] Dependencies installed (`npm install` successful)
- [ ] Cloudflare API Token with required permissions (see below)
- [ ] Access to `bigbeardapps.com` Cloudflare zone

---

## Step 1: Add Cloudflare Credentials

### For Cloud Agent Deployment

Add a Cloudflare API Token to Cursor Dashboard:

1. Go to [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use **Edit Cloudflare Workers** template, then customize:

**Permissions:**
```
Account > Account Settings > Read
Account > D1 > Edit
Account > Workers Scripts > Edit
Zone > Workers Routes > Edit
Zone > Zone > Read
Zone > DNS > Edit
```

**Account Resources:**
- Include: Your account (select your account from dropdown)

**Zone Resources:**
- Include: Specific zone → `bigbeardapps.com`

4. Create token and copy it
5. In Cursor Dashboard, go to **Cloud Agents > Secrets**
6. Add secret: `CLOUDFLARE_API_TOKEN` = (paste token)
7. Scope: This repository (`bigbeardapps-site`)

### For Local Deployment (Alternative)

If deploying from local machine instead:

```bash
# Option A: Interactive login (opens browser)
npx wrangler login

# Option B: Use API token
export CLOUDFLARE_API_TOKEN="your-token-here"
```

---

## Step 2: Create D1 Database

```bash
cd ops-auth
npx wrangler d1 create ops-auth-db
```

**Expected Output:**
```
✅ Successfully created DB 'ops-auth-db'!

[[d1_databases]]
binding = "DB"
database_name = "ops-auth-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Action Required:** Copy the `database_id` value.

---

## Step 3: Update wrangler.toml

Edit `ops-auth/wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ops-auth-db"
database_id = "PASTE-REAL-UUID-HERE"  # Replace placeholder
migrations_dir = "migrations"
```

Commit this change:

```bash
git add wrangler.toml
git commit -m "Configure production D1 database ID"
git push
```

**Important:** The database ID is not a secret - it's safe to commit.

---

## Step 4: Run Database Migrations

Apply the schema to the remote D1 database:

```bash
npm run db:migrate:remote
# or: npx wrangler d1 migrations apply ops-auth-db --remote
```

**Expected Output:**
```
🌀 Executing on remote database ops-auth-db (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx):
🌀 To execute on your local development database, remove the --remote flag from your wrangler command.
🚣 Executed 1 migration(s) in 0.12 seconds
├ 0001_init.sql
```

**Verify:**
```bash
npx wrangler d1 execute ops-auth-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

Should show: `users`, `sessions`

---

## Step 5: Set Production Secrets

### Generate SESSION_SECRET

```bash
openssl rand -base64 48
```

Copy the output (should be ~64 characters).

### Set Secrets via Wrangler

```bash
# Required: Session secret
npx wrangler secret put SESSION_SECRET
# Paste the generated secret when prompted

# Recommended: Bootstrap admin credentials
npx wrangler secret put BOOTSTRAP_ADMIN_EMAIL
# Example: raul@bigbeardapps.com

npx wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
# Use a strong password (16+ characters recommended)
# Example: correcthorsebatterystaple2026!
```

**Security Notes:**
- Store SESSION_SECRET in password manager (needed for disaster recovery)
- Bootstrap password creates initial user only - does not update existing users
- After first login, consider rotating bootstrap password and documenting the process for manual password updates

---

## Step 6: Deploy Worker

```bash
npm run deploy
# or: npx wrangler deploy
```

**Expected Output:**
```
Total Upload: XX.XX KiB / gzip: XX.XX KiB
Uploaded ops-auth (X.XX sec)
Deployed ops-auth triggers (X.XX sec)
  https://ops-auth.YOURSUBDOMAIN.workers.dev
Current Version ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

**Initial Test:**
```bash
curl https://ops-auth.YOURSUBDOMAIN.workers.dev/api/health
```

Should return:
```json
{"ok":true,"app":"Big Beard Ops"}
```

---

## Step 7: Attach Custom Domain

### Via Cloudflare Dashboard

1. Go to **Workers & Pages**
2. Click on `ops-auth` worker
3. Go to **Settings > Domains & Routes**
4. Click **Add Custom Domain**
5. Enter: `ops.bigbeardapps.com`
6. Click **Add Domain**
7. Cloudflare will automatically create DNS records

**Propagation:** Usually instant (Cloudflare-to-Cloudflare), may take 1-2 minutes.

### Via Wrangler (Alternative)

Check if your Wrangler version supports:

```bash
npx wrangler domains add ops.bigbeardapps.com
```

---

## Step 8: Production Verification

### 8.1 DNS Check

```bash
dig ops.bigbeardapps.com
# Should resolve to Cloudflare IPs
```

### 8.2 HTTPS Check

```bash
curl -I https://ops.bigbeardapps.com/api/health
```

**Verify:**
- Status: `200 OK`
- `x-content-type-options: nosniff`
- `x-frame-options: DENY`
- Response body: `{"ok":true,"app":"Big Beard Ops"}`

### 8.3 Login Test

Open `https://ops.bigbeardapps.com` in browser:

1. Should see login UI with "Big Beard Ops" branding
2. Enter bootstrap admin email and password
3. Click **Sign In**
4. Should redirect to signed-in state showing email
5. Open DevTools > Application > Cookies
6. Verify `ops_session` cookie:
   - Domain: `.bigbeardapps.com`
   - Path: `/`
   - HttpOnly: ✓
   - Secure: ✓
   - SameSite: `Lax`
   - Max-Age: `1209600` (14 days)

### 8.4 API Test

```bash
# Get session cookie from browser DevTools
export COOKIE="ops_session=YOUR_SESSION_TOKEN_HERE"

curl https://ops.bigbeardapps.com/api/me \
  -H "Cookie: $COOKIE"
```

**Expected:**
```json
{
  "authenticated": true,
  "user": {
    "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "email": "raul@bigbeardapps.com"
  }
}
```

### 8.5 Logout Test

In browser, click **Sign Out**:
- Should redirect to login page
- Cookie should be cleared
- `/api/me` should return 401

### 8.6 Rate Limit Test

Try logging in with wrong password 6 times:
- First 5 attempts: "Invalid email or password"
- 6th attempt: "Too many login attempts. Please try again in 15 minutes."

---

## Step 9: Disable workers.dev (Optional Security Hardening)

After custom domain works, consider disabling the workers.dev preview:

Edit `wrangler.toml`:
```toml
workers_dev = false
```

Commit and redeploy:
```bash
git add wrangler.toml
git commit -m "Disable workers.dev preview URL"
git push
npm run deploy
```

**Impact:** The `ops-auth.*.workers.dev` URL will stop working. Only custom domain remains active.

---

## Troubleshooting

### Issue: "Database not found"

**Cause:** `database_id` in `wrangler.toml` is still the placeholder.

**Fix:**
1. Run `npx wrangler d1 list` to see your databases
2. Copy the correct UUID
3. Update `wrangler.toml`
4. Redeploy

### Issue: "SESSION_SECRET not set"

**Cause:** Secret not configured in production.

**Fix:**
```bash
npx wrangler secret put SESSION_SECRET
```

### Issue: Login always fails with "Invalid email or password"

**Causes:**
1. Bootstrap secrets not set
2. Email typo (check lowercase)
3. Password incorrect

**Debug:**
```bash
# List all secrets (won't show values)
npx wrangler secret list

# Check logs
npx wrangler tail
```

Then try logging in again and watch for errors.

### Issue: Custom domain not resolving

**Cause:** DNS propagation or misconfiguration.

**Fix:**
1. Check Cloudflare Dashboard > DNS for `ops` CNAME/AAAA record
2. Ensure zone is on Cloudflare nameservers
3. Wait 1-2 minutes for propagation
4. Clear browser DNS cache: `chrome://net-internals/#dns`

### Issue: Cookie not setting

**Causes:**
1. `APP_URL` in `wrangler.toml` doesn't match deployment URL
2. Browser blocking third-party cookies
3. Mixed content (HTTP iframe in HTTPS page)

**Fix:**
1. Verify `APP_URL = "https://ops.bigbeardapps.com"` in `wrangler.toml`
2. Test in incognito mode
3. Check browser console for cookie warnings

---

## Rollback Procedure

If deployment fails or has critical issues:

### Option A: Rollback to Previous Version

```bash
npx wrangler rollback --message "Rolling back to previous version"
```

### Option B: Remove Custom Domain

1. Cloudflare Dashboard > Workers & Pages > `ops-auth`
2. Settings > Domains & Routes
3. Click **Remove** next to `ops.bigbeardapps.com`

### Option C: Delete Worker (Nuclear Option)

```bash
npx wrangler delete ops-auth
```

**Warning:** This does NOT delete the D1 database. Data remains intact.

---

## Post-Deployment Tasks

Once authentication works in production:

- [x] Mark PR as ready for review (remove draft status)
- [ ] Update handoff document with real `database_id`
- [ ] Document the deployed worker URL in team wiki/notes
- [ ] Test login from mobile device
- [ ] Monitor Cloudflare Analytics for first 24 hours
- [ ] Consider enabling Cloudflare bot protection rules
- [ ] Proceed to Phase 1: Cloudflare API connection

---

## Monitoring & Maintenance

### Check Worker Health

```bash
npx wrangler tail
# Live tail logs in production
```

### View D1 Database

```bash
npx wrangler d1 execute ops-auth-db --remote \
  --command "SELECT id, email, created_at FROM users;"
```

### Check Active Sessions

```bash
npx wrangler d1 execute ops-auth-db --remote \
  --command "SELECT COUNT(*) as active_sessions FROM sessions WHERE expires_at > datetime('now');"
```

### Review Analytics

1. Cloudflare Dashboard > Workers & Pages > `ops-auth`
2. Click **Metrics** tab
3. Monitor:
   - Requests per day
   - Success rate
   - CPU time
   - Errors

### Cost Monitoring

**Free Tier Limits:**
- Workers: 100,000 requests/day
- D1: 5M reads, 100K writes/day

**Usage Alerts:**
Set up email alerts if approaching 80% of limits.

**Expected Usage (Dogfooding):**
- ~50-200 requests/day
- ~10 DB reads per request = ~2K reads/day
- ~5 DB writes/day (logins + sessions)

**Well under Free tier limits.**

---

## Security Audit Checklist

Before inviting other users:

- [ ] HTTPS enforced (no HTTP fallback)
- [ ] Security headers present (verify with securityheaders.com)
- [ ] Session cookies are HttpOnly + Secure + SameSite=Lax
- [ ] Rate limiting tested and working
- [ ] No secrets in git history (`git log --all --full-history --source -- '*secret*' '*password*'`)
- [ ] Bootstrap admin password is strong (16+ chars, unique)
- [ ] workers.dev preview disabled (if using custom domain exclusively)
- [ ] Cloudflare Access or IP allowlist considered (if needed)
- [ ] Password change/reset flow planned
- [ ] MFA/2FA roadmap defined

---

## Success Criteria

Deployment is complete when:

✅ `https://ops.bigbeardapps.com` loads login UI  
✅ Bootstrap admin can sign in successfully  
✅ `/api/me` returns authenticated user  
✅ Session persists across page reloads  
✅ Logout clears session  
✅ Rate limiting triggers after 5 failed attempts  
✅ All security headers present  
✅ Cookie has correct flags (HttpOnly, Secure, SameSite)  
✅ No errors in Cloudflare logs for 1 hour  
✅ PR updated with deployment confirmation  

---

## Questions?

- **Technical Issues:** Check `ops-auth/README.md` or Cloudflare Workers docs
- **Authentication Help:** Review `src/auth.ts` comments
- **Product Questions:** See `HANDOFF.md` for full context
- **Security Concerns:** support@bigbeardapps.com

---

**Next Phase:** After authentication works, proceed to Phase 1 (Cloudflare API connection) in the handoff document.
