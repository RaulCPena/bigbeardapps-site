# Cloudflare API Token Permissions

The current API token (`CLOUDFARE_API_TOKEN` - note the typo in the secret name) is **read-only** and lacks the **edit permissions** needed to create D1 databases and deploy Workers.

## Current Issue

The token is **read-only** - it can verify account access but cannot create resources or deploy.

```
✘ [ERROR] A request to the Cloudflare API (/accounts/.../d1/database) failed.
Authentication error [code: 10000]
```

**Root cause:** Token has Read permissions but needs Edit permissions.

## Required Permissions

To complete the deployment, the Cloudflare API token needs these permissions:

### Account Permissions
- **Account → D1 → Edit** (to create and manage D1 databases)
- **Account → Workers Scripts → Edit** (to deploy Workers)
- **Account → Account Settings → Read** (for account info)

### Zone Permissions (for custom domain)
- **Zone → Workers Routes → Edit** (to attach custom domains)
- **Zone → DNS → Edit** (if DNS records need updating)

## How to Update Token

1. Go to [Cloudflare Dashboard → API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Find the token currently in use (or create a new one)
3. Click "Edit" 
4. Add the required permissions listed above
5. Update the secret in Cursor Dashboard:
   - Go to Cursor Dashboard → Cloud Agents → Secrets
   - Update the `CLOUDFARE_API_TOKEN` secret (or better: fix the typo and rename to `CLOUDFLARE_API_TOKEN`)
   - The new token value

## RECOMMENDED SOLUTION: Use Edit Cloudflare Workers Template

**This is the easiest way** - Cloudflare has a pre-made template with the right permissions:

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click **"Create Token"**
3. Find template: **"Edit Cloudflare Workers"** → Click **"Use template"**
4. This includes:
   - ✓ Account → Workers Scripts → Edit
   - ✓ Account → Account Settings → Read
   - ✓ Zone → Workers Routes → Edit
5. **Important:** Click **"+ Add more"** and add: **Account → D1 → Edit**
6. Set Account Resources to your account
7. Click **"Continue to summary"** → **"Create Token"**
8. **Copy the token** (shown only once!)
9. Update in Cursor Dashboard → Cloud Agents → Secrets

**See TOKEN_SETUP.md for detailed step-by-step with screenshots.**

## Alternative: Create via Cloudflare Dashboard

If API token permissions are tricky, you can also:

1. **Create D1 database manually**:
   - Go to [Cloudflare Dashboard → D1](https://dash.cloudflare.com/043c813f753abea6e92ba52b229685cc/workers/d1)
   - Click "Create database"
   - Name: `ops-auth-db`
   - Copy the database ID
   - Update `wrangler.toml` with the ID

2. **Deploy via dashboard** (after fixing token):
   - Fix the API token permissions
   - Then run `npx wrangler deploy` to deploy the Worker

## After Fixing Permissions

Resume deployment from step 2 in QUICKSTART.md:

```bash
cd ops-auth
export CLOUDFLARE_API_TOKEN=$CLOUDFARE_API_TOKEN  # or use the corrected name

# Continue with deployment
npx wrangler d1 create ops-auth-db
# ... rest of steps
```

## Note About Secret Name Typo

The secret is currently named `CLOUDFARE_API_TOKEN` (missing second 'L').
- Either: Use `export CLOUDFLARE_API_TOKEN=$CLOUDFARE_API_TOKEN` in commands
- Or better: Rename the secret to `CLOUDFLARE_API_TOKEN` in Cursor Dashboard
