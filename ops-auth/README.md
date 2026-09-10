# Big Beard Ops - Authentication Service

Multi-site Cloudflare analytics dashboard for solo indie developers.

## Stack

- **Runtime:** Cloudflare Workers
- **Framework:** Hono
- **Database:** D1 (SQLite)
- **Language:** TypeScript (strict mode)
- **Authentication:** Custom session-based auth with PBKDF2 password hashing

## Features

- Secure password hashing (PBKDF2-SHA256, 210,000 iterations)
- Session-based authentication with HttpOnly cookies
- Rate limiting on login endpoint (5 attempts per 15 minutes)
- Bootstrap admin user via environment variables
- Security headers (X-Frame-Options, CSP, etc.)
- Public registration disabled by default

## Local Development

### Prerequisites

- Node.js 18+
- Wrangler CLI

### Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.dev.vars` from the example:

```bash
cp .dev.vars.example .dev.vars
```

3. Edit `.dev.vars` and set your local secrets:

```env
SESSION_SECRET=generate-a-long-random-string-here
BOOTSTRAP_ADMIN_EMAIL=your@email.com
BOOTSTRAP_ADMIN_PASSWORD=your-strong-password
APP_URL=http://127.0.0.1:8787
```

4. Run local migrations:

```bash
npm run db:migrate
```

5. Start dev server:

```bash
npm run dev
```

6. Visit `http://127.0.0.1:8787` and sign in with your bootstrap credentials.

## Production Deployment

### 1. Create D1 Database

```bash
npx wrangler d1 create ops-auth-db
```

Copy the `database_id` from the output and replace it in `wrangler.toml`.

### 2. Run Remote Migrations

```bash
npm run db:migrate:remote
```

### 3. Set Production Secrets

Generate a strong session secret (at least 48 random bytes):

```bash
npx wrangler secret put SESSION_SECRET
# Paste: output from `openssl rand -base64 48`

npx wrangler secret put BOOTSTRAP_ADMIN_EMAIL
# Paste: your@bigbeardapps.com

npx wrangler secret put BOOTSTRAP_ADMIN_PASSWORD
# Paste: strong unique password
```

### 4. Deploy

```bash
npm run deploy
```

### 5. Attach Custom Domain

Via Cloudflare Dashboard:

1. Go to **Workers & Pages** → `ops-auth`
2. Click **Domains & Routes**
3. Add custom domain: `ops.bigbeardapps.com`

Or via CLI (if supported in your Wrangler version):

```bash
npx wrangler domains add ops.bigbeardapps.com
```

### 6. Verify

Visit `https://ops.bigbeardapps.com` and test:

- Sign in with bootstrap credentials
- Check `/api/me` returns authenticated user
- Sign out
- Verify cookie is `HttpOnly`, `Secure`, `SameSite=Lax`

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Optional | HTML login UI |
| GET | `/api/health` | None | Health check |
| GET | `/api/me` | Session | Get current user |
| POST | `/api/login` | None | Sign in (rate limited) |
| POST | `/api/logout` | Optional | Sign out |
| POST | `/api/register` | N/A | Always returns 403 (disabled) |

## Security

- Passwords: PBKDF2-SHA256, 210,000 iterations, 16-byte salt
- Sessions: 32-byte random tokens, HMAC-SHA256 hashed in DB
- Session TTL: 14 days
- Cookie: HttpOnly, Secure (on HTTPS), SameSite=Lax, Domain=.bigbeardapps.com
- Rate limiting: 5 login attempts per IP per 15 minutes
- Security headers: X-Frame-Options, X-Content-Type-Options, etc.

## Environment Variables

### Required Secrets (via `wrangler secret put`)

- `SESSION_SECRET` - Secret key for session token HMAC (min 32 bytes recommended)

### Optional Secrets

- `BOOTSTRAP_ADMIN_EMAIL` - Auto-create admin user on first boot
- `BOOTSTRAP_ADMIN_PASSWORD` - Password for bootstrap admin

### Public Variables (in `wrangler.toml`)

- `APP_NAME` - Application display name
- `APP_URL` - Public URL (used for cookie domain/secure flag)

## Known Limitations (v1)

- No password reset flow
- No MFA/2FA
- No session revocation UI ("log out all devices")
- Rate limiting is in-memory (resets on worker restart)
- Bootstrap password changes don't update existing user hash

## Next Steps

After authentication works in production:

1. Add Cloudflare API connection (OAuth or token)
2. Implement zone sync cron job
3. Build portfolio dashboard UI
4. Add insight/improvement rules engine

## License

Proprietary - Big Beard Apps

## Support

support@bigbeardapps.com
