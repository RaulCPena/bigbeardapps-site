# Big Beard Ops Credentials

**Service URL:** https://ops.bigbeardapps.com

## Security Layers

### Layer 1: Cloudflare Access (Zero Trust)
- **Protected domain:** ops.bigbeardapps.com
- **Allowed users:** raul.c.pena@gmail.com (or your configured email)
- **Authentication:** Email PIN (one-time code sent to your email)
- **Configuration:** https://one.dash.cloudflare.com/ → Access → Applications

### Layer 2: Big Beard Ops Login
- **Admin password:** `BigBeardOps2026!`
- **Session duration:** 30 days
- **Stored in:** Cloudflare Worker secrets

## Login Process

1. Visit https://ops.bigbeardapps.com
2. **Cloudflare Access:** Enter your email and the PIN code sent to you
3. **Big Beard Ops:** Enter password: `BigBeardOps2026!`
4. You're in! Session lasts 30 days

## Updating Credentials

### Change Admin Password:
```bash
cd ops-auth
export CLOUDFLARE_API_TOKEN=$CLOUDFARE_API_TOKEN
echo "YOUR_NEW_PASSWORD" | npx wrangler secret put ADMIN_PASSWORD
```

### Add/Remove Allowed Emails:
1. Go to: https://one.dash.cloudflare.com/
2. Access → Applications → Big Beard Ops
3. Edit the policy to add/remove emails

## Database Access

**D1 Database:** `ops-auth-db`
**Database ID:** `9e9c7904-307c-4997-9938-a4a3416317f6`

Query the database:
```bash
npx wrangler d1 execute ops-auth-db --remote --command "SELECT * FROM sessions"
```

## Monitoring

View live logs:
```bash
cd ops-auth
npx wrangler tail
```

## Security Notes

- Cloudflare Access protects the entire site from unauthorized access
- Only your email can pass through the first authentication layer
- Admin password provides a second layer of authentication
- Sessions are stored in D1 database with automatic expiration
- All traffic is HTTPS with secure cookies (HttpOnly, SameSite=Strict)
