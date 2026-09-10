# Cloudflare API Token Permissions

The current API token (`CLOUDFARE_API_TOKEN` - note the typo in the secret name) lacks permissions to create D1 databases and deploy Workers.

## Current Issue

```
✘ [ERROR] A request to the Cloudflare API (/accounts/.../d1/database) failed.
Authentication error [code: 10000]
```

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

## Recommended: Use Edit Cloudflare Workers Template

Alternatively, create a new token using Cloudflare's pre-made "Edit Cloudflare Workers" template:

1. [Create API Token](https://dash.cloudflare.com/profile/api-tokens)
2. Use template: **"Edit Cloudflare Workers"**
3. This includes:
   - Account → Workers Scripts → Edit
   - Account → Account Settings → Read
   - Zone → Workers Routes → Edit
4. Additionally add: **Account → D1 → Edit**
5. Save and copy the token
6. Update in Cursor Dashboard

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
