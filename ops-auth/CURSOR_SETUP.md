# Setting Up Cloudflare Credentials for Cloud Agent Deployment

**Goal:** Enable the Cursor Cloud Agent to deploy Big Beard Ops to your Cloudflare account.

---

## Quick Start (5 minutes)

### 1. Create Cloudflare API Token

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token**
3. Start with **Edit Cloudflare Workers** template
4. Customize permissions (see below)
5. Click **Continue to summary** → **Create Token**
6. **Copy the token immediately** (you won't see it again)

### 2. Add Token to Cursor Dashboard

1. Go to: https://cursor.com/settings (or your Cursor Dashboard)
2. Navigate to **Cloud Agents > Secrets**
3. Click **Add Secret**
4. Set:
   - **Name:** `CLOUDFLARE_API_TOKEN`
   - **Value:** (paste the token from step 1)
   - **Scope:** Repository → `bigbeardapps-site`
5. Save

### 3. Resume Cloud Agent

Once the secret is added, either:
- **Option A:** Resume the existing Cloud Agent run and tell it to continue deployment
- **Option B:** Start a new Cloud Agent on branch `cursor/ops-auth-login-f188` with message:
  ```
  Continue Big Beard Ops deployment from DEPLOY.md.
  Cloudflare credentials are now available.
  Start from Step 2: Create D1 database.
  ```

---

## Detailed: Cloudflare API Token Permissions

When creating the token, configure these permissions:

### Account Permissions
```
Account Settings > Read
D1 > Edit
Workers Scripts > Edit
```

### Zone Permissions
```
Workers Routes > Edit
Zone > Read
DNS > Edit
```

### Account Resources
- **Include:** Your Cloudflare account (select from dropdown)

### Zone Resources
- **Include:** Specific zone → `bigbeardapps.com`

### IP Filtering (Optional)
- Leave blank (allows from any IP - needed for Cloud Agents)

### TTL (Optional)
- Default: Never expires
- Recommended: Set expiration if you prefer rotating tokens

---

## Screenshot Guide

### Creating the Token

![Cloudflare API Token Creation](https://developers.cloudflare.com/images/workers-platform-tokens.png)

**Key Settings:**
- Template: "Edit Cloudflare Workers"
- Permissions: Account (D1, Workers) + Zone (Routes, DNS)
- Zone: `bigbeardapps.com`

### Adding to Cursor

1. **Cursor Dashboard > Cloud Agents > Secrets**
2. Click "+ Add Secret"
3. Fill form:
   ```
   Name:  CLOUDFLARE_API_TOKEN
   Value: cf_xxx...xxx (your token)
   Scope: Repository: bigbeardapps-site
   ```
4. Click "Save Secret"

---

## Verification

### Check Token Works

Test locally before adding to Cursor:

```bash
export CLOUDFLARE_API_TOKEN="your-token-here"
cd ops-auth
npx wrangler whoami
```

**Expected Output:**
```
Getting User settings...
👋 You are logged in with an API Token, associated with the email 'your@email.com'!
┌──────────────────────────┬──────────────────────────────────┐
│ Account Name             │ Account ID                       │
├──────────────────────────┼──────────────────────────────────┤
│ Your Account             │ xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx │
└──────────────────────────┴──────────────────────────────────┘
```

If you see this, the token is valid! ✅

### Check Secret is Available in Cloud Agent

After adding to Cursor Dashboard, the Cloud Agent will automatically have access to it via:

```bash
echo $CLOUDFLARE_API_TOKEN
# Should output: [REDACTED] (for security)
```

The agent can use it without additional setup.

---

## Security Best Practices

### Token Storage
- ✅ **DO:** Store in Cursor Dashboard Secrets (encrypted at rest)
- ✅ **DO:** Store in password manager (e.g., 1Password, Bitwarden)
- ❌ **DON'T:** Commit to git
- ❌ **DON'T:** Share in Slack/email
- ❌ **DON'T:** Store in plaintext files

### Token Scope
- ✅ **DO:** Limit to specific account + zone (`bigbeardapps.com`)
- ✅ **DO:** Only grant required permissions (D1, Workers, DNS)
- ❌ **DON'T:** Use "Edit Cloudflare Account" template (too broad)
- ❌ **DON'T:** Grant unnecessary permissions (e.g., billing, API)

### Token Rotation
- **Recommended:** Rotate every 90 days
- **After rotation:** Update Cursor Dashboard secret with new token
- **Old token:** Revoke in Cloudflare Dashboard

### Compromised Token?
If you suspect the token is leaked:

1. **Immediately revoke:**
   - Cloudflare Dashboard > Profile > API Tokens
   - Find the token → Click "Delete" / "Revoke"

2. **Create new token** (same permissions)

3. **Update Cursor Dashboard** with new token

4. **Check Cloudflare audit logs:**
   - Dashboard > Audit Logs
   - Look for unauthorized actions in last 24-48 hours

---

## Alternative: Local Deployment (Without Cloud Agent)

If you prefer deploying from your local machine:

```bash
# One-time setup
npx wrangler login
# Opens browser for OAuth authentication

# Then deploy as normal
cd ops-auth
npm run deploy
```

**Pros:**
- No need to store API token
- Uses OAuth (more secure)
- Immediate control

**Cons:**
- Manual deployment (no CI/CD)
- Requires local environment setup
- Can't leverage Cloud Agent automation

---

## Troubleshooting

### "You are not authenticated"

**Cause:** Token not set or invalid.

**Fix:**
1. Verify token is added to Cursor Dashboard
2. Check token hasn't expired (Cloudflare Dashboard > API Tokens)
3. Ensure scope is repository-wide, not just user-scoped

### "Insufficient permissions"

**Cause:** Token missing required permissions.

**Fix:**
1. Cloudflare Dashboard > Profile > API Tokens
2. Edit the token
3. Add missing permissions:
   - Account: D1 Edit, Workers Scripts Edit
   - Zone: Workers Routes Edit, DNS Edit
4. Save changes
5. Wait 30 seconds for propagation
6. Retry deployment

### "Zone not found"

**Cause:** Token doesn't have access to `bigbeardapps.com` zone.

**Fix:**
1. Edit token in Cloudflare Dashboard
2. Under "Zone Resources", change to:
   - Include > Specific zone > `bigbeardapps.com`
3. Save
4. Retry

### Secret not available in Cloud Agent

**Cause:** Secret scope incorrect or not saved.

**Fix:**
1. Cursor Dashboard > Cloud Agents > Secrets
2. Find `CLOUDFLARE_API_TOKEN`
3. Check scope is set to:
   - **Repository:** `bigbeardapps-site`
   - **Not** user-only or team-only
4. If wrong, delete and recreate with correct scope

---

## FAQ

**Q: Can I use the same token for multiple projects?**
A: Yes, but it's better security to create per-project tokens with minimal permissions.

**Q: Will this token allow the agent to edit my DNS?**
A: Only for the `bigbeardapps.com` zone (needed to attach `ops.bigbeardapps.com` subdomain).

**Q: Can I revoke this later?**
A: Yes, anytime in Cloudflare Dashboard > API Tokens. Revocation is instant.

**Q: Does the token cost money?**
A: No, API tokens are free. You only pay for Cloudflare resources used (D1, Workers).

**Q: What if I'm on a Free Cloudflare plan?**
A: Perfect! Big Beard Ops is designed for Free tier. No upgrade needed for deployment.

**Q: Is the token shared with other Cursor users?**
A: No. Repository-scoped secrets are only accessible to Cloud Agents you start.

---

## Next Steps

Once the token is added:

1. ✅ Resume Cloud Agent or start new one
2. ✅ Agent will run `ops-auth/DEPLOY.md` steps automatically
3. ✅ Watch for deployment completion
4. ✅ Test `https://ops.bigbeardapps.com` login
5. ✅ Proceed to Phase 1 (Cloudflare connection + analytics)

---

**Need Help?**

- Cloudflare API Tokens docs: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Cursor Cloud Agents docs: https://cursor.com/docs/cloud-agents
- Support: support@bigbeardapps.com
