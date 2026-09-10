# Big Beard Ops

Lean solo-dev ops board on Cloudflare Workers (free tier).

**Live:** https://ops.bigbeardapps.com  
**Auth:** Cloudflare Access (email) + app password

## What it is (v1)

Three jobs only — no fluff:

1. **Apps** — command center for Feastmark, PayoffPilot, ReelTalk, Gunmark, HuntMark  
   Status, next action, App Store/site links, per-app checklist
2. **Notes** — private scratchpad for decisions and reminders
3. **Links** — one board for App Store Connect, Cloudflare, GitHub, etc.

## Stack (all free-tier friendly)

- Workers + D1 + Cloudflare Access
- No KV/R2/AI required for v1

## Local / deploy

```bash
cd ops-auth
export CLOUDFLARE_API_TOKEN=$CLOUDFARE_API_TOKEN   # or CLOUDFLARE_API_TOKEN
npm install --legacy-peer-deps
npx wrangler d1 execute ops-auth-db --file=schema.sql --remote
npx wrangler d1 execute ops-auth-db --file=seed.sql --remote   # optional reseed
npx wrangler deploy
```

## Secrets

```bash
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
```

See [CREDENTIALS.md](CREDENTIALS.md) for login details.
