# Big Beard Ops - Quick Start (After Credentials Setup)

**For:** Cloud Agent resuming deployment after Cloudflare credentials are available  
**Current Branch:** `cursor/ops-auth-login-f188`  
**Target:** Deploy to `https://ops.bigbeardapps.com`

---

## Pre-flight Check

Before proceeding, verify:

```bash
# Check credentials are available
echo $CLOUDFLARE_API_TOKEN
# Should output: [REDACTED] or actual token

# Check wrangler auth
cd ops-auth
npx wrangler whoami
# Should show: "You are logged in with an API Token"
```

If either fails, credentials are not configured. Stop and refer to `CURSOR_SETUP.md`.

---

## Deployment Commands (Copy-Paste Ready)

### Step 1: Create D1 Database

```bash
cd /workspace/ops-auth
npx wrangler d1 create ops-auth-db
```

**Action:** Copy the `database_id` from output (UUID format).

### Step 2: Update wrangler.toml

Edit `wrangler.toml` and replace the placeholder:

```toml
database_id = "PASTE-UUID-HERE"
```

Commit:

```bash
git add wrangler.toml
git commit -m "Configure production D1 database ID"
git push
```

### Step 3: Run Migrations

```bash
npm run db:migrate:remote
```

**Verify:**
```bash
npx wrangler d1 execute ops-auth-db --remote --command "SELECT name FROM sqlite_master WHERE type='table';"
```

Should show: `users`, `sessions`

### Step 4: Set Secrets

Generate and set secrets:

```bash
# Generate strong session secret
SESSION_SECRET=$(openssl rand -base64 48)
echo "Generated SESSION_SECRET (save this): $SESSION_SECRET"

# Set in Cloudflare
echo "$SESSION_SECRET" | npx wrangler secret put SESSION_SECRET

# Set bootstrap admin email
npx wrangler secret put BOOTSTRAP_ADMIN_EMAIL
# When prompted, enter: raul@bigbeardapps.com (or founder's email)

# Set bootstrap admin password
npx wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
# When prompted, enter a strong password (16+ chars recommended)
```

**Important:** Save the SESSION_SECRET and bootstrap password in a secure location (password manager).

### Step 5: Deploy Worker

```bash
npm run deploy
```

**Verify:**
```bash
# Test health endpoint (replace YOURSUBDOMAIN with actual workers.dev subdomain)
curl https://ops-auth.YOURSUBDOMAIN.workers.dev/api/health
```

Expected: `{"ok":true,"app":"Big Beard Ops"}`

### Step 6: Attach Custom Domain

**Option A: Via Cloudflare Dashboard (Recommended)**

1. Go to: https://dash.cloudflare.com → Workers & Pages
2. Click `ops-auth` worker
3. Settings > Domains & Routes
4. Add Custom Domain: `ops.bigbeardapps.com`
5. Confirm

**Option B: Via Wrangler (if supported)**

```bash
npx wrangler domains add ops.bigbeardapps.com
```

### Step 7: Verify Production

```bash
# Check DNS
dig ops.bigbeardapps.com

# Test HTTPS
curl -I https://ops.bigbeardapps.com/api/health

# Expected headers:
# HTTP/2 200
# x-content-type-options: nosniff
# x-frame-options: DENY
```

**Open in browser:** https://ops.bigbeardapps.com

1. Should see login UI
2. Enter bootstrap credentials
3. Click Sign In
4. Should show signed-in state with email

**Check cookie in DevTools:**
- Application > Cookies > `ops_session`
- Verify: HttpOnly ✓, Secure ✓, SameSite=Lax, Domain=.bigbeardapps.com

### Step 8: Update PR

```bash
cd /workspace
```

Then update PR with deployment confirmation (use ManagePullRequest tool).

---

## One-Liner Deployment (Advanced)

If everything is configured and you're confident:

```bash
cd /workspace/ops-auth && \
npx wrangler d1 create ops-auth-db && \
echo "Paste database_id into wrangler.toml, then run:" && \
echo "npm run db:migrate:remote && npm run deploy"
```

**Not recommended** for first deployment - use step-by-step above.

---

## Verification Checklist

After deployment, confirm:

- [ ] `https://ops.bigbeardapps.com` loads (not 404/500)
- [ ] Login UI displays "Big Beard Ops" branding
- [ ] Bootstrap login works (correct email/password)
- [ ] Session persists after page reload
- [ ] `/api/me` returns authenticated user
- [ ] Logout clears session and redirects
- [ ] Wrong password shows: "Invalid email or password"
- [ ] 6 failed attempts shows: "Too many login attempts..."
- [ ] Cookie has correct security flags (DevTools check)
- [ ] Security headers present (Network tab)
- [ ] No errors in Cloudflare logs: `npx wrangler tail`

---

## If Something Fails

### Database Error
```bash
# Check database exists
npx wrangler d1 list

# Check migrations ran
npx wrangler d1 execute ops-auth-db --remote --command "SELECT * FROM sqlite_master;"
```

### Secret Error
```bash
# List secrets (won't show values)
npx wrangler secret list

# Re-set if missing
npx wrangler secret put SESSION_SECRET
```

### Deploy Error
```bash
# Check TypeScript compiles
npx tsc --noEmit

# Check wrangler.toml syntax
cat wrangler.toml

# Check auth
npx wrangler whoami
```

### Custom Domain Not Working
```bash
# Check DNS
dig ops.bigbeardapps.com

# Wait 1-2 minutes for propagation
# Clear browser DNS cache: chrome://net-internals/#dns
```

**Full troubleshooting guide:** `DEPLOY.md` section "Troubleshooting"

---

## Success Criteria

Deployment is complete when:

✅ All verification checklist items pass  
✅ Founder can log in from browser  
✅ Session persists across page reloads  
✅ No errors in logs for 5 minutes  
✅ PR updated with confirmation  

---

## After Success

1. Mark PR as ready for review (remove draft status)
2. Document deployed URL and credentials location
3. Proceed to Phase 1: Cloudflare API connection (see handoff doc)

---

## Emergency Rollback

If critical issue:

```bash
# Option 1: Remove custom domain
# Cloudflare Dashboard > Workers > ops-auth > Domains > Remove

# Option 2: Delete worker (keeps database)
npx wrangler delete ops-auth
```

---

**Need detailed instructions?** See `DEPLOY.md`  
**Need credential setup?** See `CURSOR_SETUP.md`  
**Need API reference?** See `README.md`
