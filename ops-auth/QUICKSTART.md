# Big Beard Ops - Deployment Quickstart

Authentication service for Big Beard Apps internal operations. Deployed on Cloudflare Workers with D1 database.

## Prerequisites

- Cloudflare account (Raul.c.pena@gmail.com's Account)
- `CLOUDFLARE_API_TOKEN` environment variable set
- Node.js and npm installed

## Deployment Steps

### 1. Verify Cloudflare Authentication

```bash
export CLOUDFLARE_API_TOKEN=$CLOUDFARE_API_TOKEN  # Fix typo in secret name
npx wrangler whoami
```

Expected output: Account info for `Raul.c.pena@gmail.com's Account`

### 2. Create D1 Database

```bash
cd ops-auth
npx wrangler d1 create ops-auth-db
```

This creates a new D1 database. Copy the `database_id` from the output.

### 3. Update wrangler.toml

Edit `wrangler.toml` and uncomment the `[[d1_databases]]` section, replacing `REPLACE_WITH_DATABASE_ID` with the actual database ID from step 2:

```toml
[[d1_databases]]
binding = "DB"
database_name = "ops-auth-db"
database_id = "YOUR_DATABASE_ID_HERE"
```

### 4. Run Database Migrations

```bash
npx wrangler d1 execute ops-auth-db --file=schema.sql --remote
```

This creates the `sessions` and `users` tables in the production database.

### 5. Set Production Secrets

Generate a secure session secret:

```bash
# Generate random session secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the secrets:

```bash
npx wrangler secret put SESSION_SECRET
# Paste the generated secret when prompted

npx wrangler secret put ADMIN_PASSWORD
# Enter the admin password when prompted
```

### 6. Deploy Worker

```bash
npx wrangler deploy
```

The worker will be deployed to `ops-auth.raul-c-pena-gmail-com.workers.dev` (or similar).

### 7. Attach Custom Domain

In Cloudflare dashboard or via CLI:

```bash
npx wrangler domains add ops.bigbeardapps.com --environment production
```

Alternatively, via Cloudflare dashboard:
1. Go to Workers & Pages
2. Select `ops-auth`
3. Go to Settings → Domains & Routes
4. Click "Add" → "Custom Domain"
5. Enter `ops.bigbeardapps.com`
6. Save

### 8. Test Login End-to-End

1. Visit `https://ops.bigbeardapps.com/`
2. Enter the admin password you set in step 5
3. Click "Sign In"
4. Should redirect to `/dashboard` with success message
5. Click "Sign Out"
6. Should redirect back to login page

Test the API endpoints:

```bash
# Test login
curl -X POST https://ops.bigbeardapps.com/api/login \
  -H "Content-Type: application/json" \
  -d '{"password":"YOUR_ADMIN_PASSWORD"}' \
  -v

# Verify session (use session cookie from login response)
curl https://ops.bigbeardapps.com/api/verify \
  -H "Cookie: session=YOUR_SESSION_ID"

# Test logout
curl -X POST https://ops.bigbeardapps.com/api/logout \
  -H "Cookie: session=YOUR_SESSION_ID"
```

## Architecture

- **Worker**: Handles authentication logic, session management
- **D1 Database**: Stores sessions and user data
- **No external dependencies**: Pure Cloudflare stack
- **Session duration**: 30 days
- **Security**: HttpOnly, Secure, SameSite=Strict cookies

## Files

```
ops-auth/
├── src/
│   └── index.ts           # Worker code (auth logic, UI)
├── schema.sql             # Database schema
├── wrangler.toml          # Cloudflare configuration
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
└── QUICKSTART.md          # This file
```

## Maintenance

### View logs

```bash
npx wrangler tail
```

### Query database

```bash
# List all sessions
npx wrangler d1 execute ops-auth-db --remote \
  --command "SELECT * FROM sessions"

# Clean up expired sessions
npx wrangler d1 execute ops-auth-db --remote \
  --command "DELETE FROM sessions WHERE expires_at < $(date +%s)000"
```

### Update secrets

```bash
npx wrangler secret put SESSION_SECRET
npx wrangler secret put ADMIN_PASSWORD
```

### Redeploy

```bash
npx wrangler deploy
```

## Security Notes

- Session tokens are cryptographically random (32 bytes)
- Passwords are hashed with SHA-256
- Cookies are HttpOnly, Secure, and SameSite=Strict
- Sessions expire after 30 days of inactivity
- No user registration - admin password only
- API endpoints have CORS enabled for integration

## Troubleshooting

### "You are not authenticated"

Ensure `CLOUDFLARE_API_TOKEN` is set:
```bash
echo $CLOUDFLARE_API_TOKEN
```

Note: The secret is stored as `CLOUDFARE_API_TOKEN` (typo) in Cursor secrets, so you need to export it with the correct name.

### "Database not found"

Verify the database exists:
```bash
npx wrangler d1 list
```

Check that `wrangler.toml` has the correct `database_id`.

### Domain not resolving

Check DNS:
```bash
dig ops.bigbeardapps.com
nslookup ops.bigbeardapps.com
```

Verify the domain is added in Cloudflare Workers dashboard under Settings → Domains & Routes.

### Login fails immediately

Check that secrets are set:
```bash
npx wrangler secret list
```

Should show:
- SESSION_SECRET
- ADMIN_PASSWORD

## Next Steps

Once deployed and tested:

1. ✓ Authentication service is live at `ops.bigbeardapps.com`
2. ✓ Can be used for internal tools and dashboards
3. ✓ Sessions persist for 30 days
4. Consider adding:
   - Rate limiting for login attempts
   - IP allowlisting for extra security
   - Audit logging for login events
   - Multiple user support with roles
