# Creating the Correct Cloudflare API Token

The current token is **read-only**, which is why deployment is failing. You need a token with **edit permissions** for D1 and Workers.

## Quick Fix: Use "Edit Cloudflare Workers" Template

**Easiest approach** - Cloudflare has a pre-made template with most permissions we need:

### Step-by-Step

1. **Go to API Tokens:**
   - Visit: https://dash.cloudflare.com/profile/api-tokens
   - Click **"Create Token"**

2. **Use Template:**
   - Find **"Edit Cloudflare Workers"** template
   - Click **"Use template"**

3. **Add D1 Permission:**
   - The template includes Workers permissions, but we need to add D1
   - In the **Permissions** section, click **"+ Add more"**
   - Select:
     - **Account** → **D1** → **Edit**

4. **Review Permissions:**
   
   Your token should have:
   ```
   Account Permissions:
   ✓ Workers Scripts - Edit
   ✓ D1 - Edit
   ✓ Account Settings - Read
   
   Zone Permissions:
   ✓ Workers Routes - Edit
   ```

5. **Set Account/Zone:**
   - **Account Resources:** Include → Specific account → `Raul.c.pena@gmail.com's Account`
   - **Zone Resources:** All zones (or specific zone if you prefer)

6. **Create Token:**
   - Click **"Continue to summary"**
   - Click **"Create Token"**
   - **COPY THE TOKEN** - you can only see it once!

7. **Update in Cursor:**
   - Go to Cursor Dashboard → Cloud Agents → Secrets
   - Find `CLOUDFARE_API_TOKEN` (or create `CLOUDFLARE_API_TOKEN` with correct spelling)
   - Paste the new token value
   - Save

## Alternative: Create Custom Token

If you prefer to create from scratch:

1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click **"Create Token"**
3. Click **"Get started"** next to "Create Custom Token"
4. Add these permissions:

   **Account Permissions:**
   - Account → **Workers Scripts** → **Edit**
   - Account → **D1** → **Edit**
   - Account → **Account Settings** → **Read**

   **Zone Permissions:**
   - Zone → **Workers Routes** → **Edit**

5. Set Account Resources:
   - Include → Specific account → `Raul.c.pena@gmail.com's Account`

6. Set Zone Resources:
   - Include → All zones from an account → `Raul.c.pena@gmail.com's Account`

7. Continue and create token

## What Each Permission Does

| Permission | Why We Need It |
|------------|----------------|
| **Workers Scripts → Edit** | Deploy the authentication worker |
| **D1 → Edit** | Create and manage the database |
| **Account Settings → Read** | Verify account access (wrangler whoami) |
| **Workers Routes → Edit** | Add custom domain later (optional) |

## Verify the New Token

After updating the token in Cursor secrets:

```bash
cd /workspace/ops-auth
export CLOUDFLARE_API_TOKEN=$CLOUDFARE_API_TOKEN

# Test authentication
npx wrangler whoami

# Try creating the database (should work now!)
npx wrangler d1 create ops-auth-db
```

**Expected output:**
```
✅ Successfully created DB 'ops-auth-db'
[[d1_databases]]
binding = "DB"
database_name = "ops-auth-db"
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

## Troubleshooting

### "Authentication error [code: 10000]" still appears

**Cause:** Token still doesn't have the right permissions

**Fix:**
1. Double-check the token has **Edit** permissions (not Read)
2. Make sure you selected **D1 → Edit** (not just Workers)
3. Verify the token is for the correct account

### "Token not found"

**Cause:** Environment variable not set or typo in secret name

**Fix:**
```bash
# Check if token is set
env | grep -i token

# Should show:
# CLOUDFARE_API_TOKEN=[REDACTED]  (note the typo in the name)

# Set correct name for wrangler
export CLOUDFLARE_API_TOKEN=$CLOUDFARE_API_TOKEN
```

### "This API Token does not have permission"

**Cause:** Token permissions are too restrictive

**Fix:**
- Go back and edit the token
- Ensure **Account** permissions are set (not just Zone)
- Verify account resource is included

## Security Notes

✓ **API tokens are safer than API keys** - they have limited scope
✓ **Edit permissions are required** - read-only won't work for deployment
✓ **Token should be for your account only** - not global
✓ **Keep the token secret** - treat it like a password

## Quick Checklist

Before trying deployment again:

- [ ] New token created with "Edit Cloudflare Workers" template
- [ ] Added "Account → D1 → Edit" permission
- [ ] Token copied
- [ ] Updated in Cursor Dashboard → Cloud Agents → Secrets
- [ ] Tested with `npx wrangler whoami` - shows account info
- [ ] Ready to continue from QUICKSTART.md Step 2

## Next Steps

Once token is updated:

1. Resume from **QUICKSTART.md Step 2**
2. Create D1 database (should work now!)
3. Continue deployment steps
4. Test on workers.dev domain

---

**Links:**
- Create Token: https://dash.cloudflare.com/profile/api-tokens
- Cursor Secrets: Go to Cursor Dashboard → Cloud Agents → Secrets
- Documentation: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
