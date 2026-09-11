# Big Beard Ops

Lean solo-dev ops board on Cloudflare Workers (free tier).

**Live:** https://ops.bigbeardapps.com  
**Auth:** Cloudflare Access (email) + app password

## What it is (v1)

Four jobs only — no fluff:

1. **Apps** — command center for Feastmark, PayoffPilot, ReelTalk, Gunmark, HuntMark  
   Status, next action, App Store/site links, per-app checklist
2. **Notes** — private scratchpad for decisions and reminders
3. **Links** — one board for App Store Connect, Cloudflare, GitHub, etc.
4. **Stats** — live site traffic charts from Cloudflare Analytics (free) + App Store units from local `asc-metrics` JSON import (or manual paste)

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
npx wrangler secret put CF_API_TOKEN   # needs Analytics:Read for live traffic charts
```

`CF_ZONE_ID` / `CF_ZONES` are set in `wrangler.toml`.

### Stats notes

- **Site traffic:** pulled live via Cloudflare GraphQL (`httpRequests1dGroups`) — works on the Free plan.
- **App Store numbers:** run `asc-metrics` on your Mac (keys stay local), then either:
  - Paste `uv run asc-metrics report --json` into the Stats tab, or
  - `OPS_COOKIE='session=…' ./scripts/push-asc-report.sh`
- Import hits `POST /api/stats/asc-import` and replaces the previous `source=asc` snapshot in D1.
- No third-party analytics scripts on the marketing site.

See [CREDENTIALS.md](CREDENTIALS.md) for login details.
