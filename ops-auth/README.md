# Big Beard Ops Authentication Service

Internal authentication service for Big Beard Apps operations tools. Deployed on Cloudflare Workers with D1 database storage.

## What It Does

- **Simple password authentication** for internal tools
- **Session management** with secure HttpOnly cookies
- **30-day sessions** with automatic expiration
- **Beautiful login UI** with the Big Beard branding
- **API endpoints** for integration with other services

## Live URL (after deployment)

- **Testing:** `https://ops-auth.<your-subdomain>.workers.dev/` (default Worker URL)
- **Production (future):** `https://ops.bigbeardapps.com/` (custom domain, after testing)

## Quick Links

- **[QUICKSTART.md](QUICKSTART.md)** - Full deployment guide
- **[PERMISSIONS.md](PERMISSIONS.md)** - Fix API token permissions (start here if deployment fails)
- **[schema.sql](schema.sql)** - Database schema

## Current Status

✅ **Code complete and ready to deploy**

⚠️ **Blocked on API token permissions** - the Cloudflare API token needs additional permissions to create D1 databases. See [PERMISSIONS.md](PERMISSIONS.md) for details.

## Endpoints

### Web Pages
- `GET /` - Login page
- `GET /dashboard` - Dashboard (requires authentication)

### API
- `POST /api/login` - Authenticate with password
- `POST /api/logout` - End session
- `GET /api/verify` - Check if session is valid

## Architecture

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │
       │ HTTPS
       │
┌──────▼──────────────────────┐
│  Cloudflare Worker          │
│  (ops-auth)                 │
│                             │
│  - Authentication logic     │
│  - Session management       │
│  - Login UI                 │
└──────┬──────────────────────┘
       │
       │ SQL
       │
┌──────▼──────────────────────┐
│  D1 Database                │
│  (ops-auth-db)              │
│                             │
│  - sessions table           │
│  - users table              │
└─────────────────────────────┘
```

## Tech Stack

- **Cloudflare Workers** - Serverless compute at the edge
- **D1** - Cloudflare's SQL database (SQLite-based)
- **TypeScript** - Type-safe worker code
- **Wrangler** - Cloudflare CLI for deployment

## Security Features

- **HttpOnly cookies** - Not accessible via JavaScript
- **Secure flag** - Only transmitted over HTTPS
- **SameSite=Strict** - CSRF protection
- **SHA-256 password hashing** - Passwords never stored in plain text
- **Cryptographically random session IDs** - 32 bytes of entropy
- **Automatic session expiration** - Cleanup expired sessions

## Files

```
ops-auth/
├── src/
│   └── index.ts           # Worker code (2.5KB, includes auth + UI)
├── schema.sql             # Database schema (sessions, users tables)
├── wrangler.toml          # Cloudflare configuration
├── package.json           # Dependencies
├── tsconfig.json          # TypeScript config
├── .gitignore            # Git ignore rules
├── README.md             # This file
├── QUICKSTART.md         # Deployment guide
└── PERMISSIONS.md        # Fix API token permissions
```

## Development

```bash
cd ops-auth

# Install dependencies
npm install

# Run locally (requires D1 database)
npx wrangler dev

# Deploy to production
npx wrangler deploy
```

## Next Steps

1. **Fix API token permissions** - See [PERMISSIONS.md](PERMISSIONS.md)
2. **Deploy** - Follow [QUICKSTART.md](QUICKSTART.md)
3. **Test** - Visit `https://ops.bigbeardapps.com/` and log in
4. **Integrate** - Use the API endpoints in your internal tools

## Maintenance

```bash
# View live logs
npx wrangler tail

# Query database
npx wrangler d1 execute ops-auth-db --remote --command "SELECT * FROM sessions"

# Update secrets
npx wrangler secret put ADMIN_PASSWORD

# Redeploy after code changes
npx wrangler deploy
```

## Future Enhancements

- [ ] Rate limiting for login attempts
- [ ] IP allowlisting
- [ ] Audit logging for security events
- [ ] Multi-user support with roles
- [ ] Two-factor authentication
- [ ] OAuth integration (GitHub, Google)

## Support

For issues or questions, contact: raul.c.pena@gmail.com

---

**Big Beard Apps** 🧔  
Privacy-first mobile apps and internal tools.
