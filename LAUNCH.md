# Launch day runbook

When an app is approved. Works for one app at a time — they can go live
independently.

## 1. Flip the site (2 minutes)

Edit `data/apps.json`, find the app, set three fields:

```jsonc
"status": "live",
"app_store_url": "https://apps.apple.com/us/app/<name>/id<APPLE_ID>",
"release_date": "29 July 2026",
```

Then:

```bash
python3 tools/sync.py && python3 tools/audit.py && python3 tools/snapshot.py check
```

`snapshot check` will report changes — that is expected here, they're the launch
flip. Read them, confirm they're only badges/press rows/status line, then:

```bash
python3 tools/snapshot.py save
git add -A && git commit -m "launch: <App> is live on the App Store"
git checkout main && git merge --ff-only <branch> && git push origin main
```

That single data edit updates, everywhere at once:

| Surface | Before | After |
|---|---|---|
| Homepage showcase pill | "Coming soon to the App Store" | link → "Download on the App Store" |
| App page badge | same | same link |
| Press kit — App Store row | "Link added on launch day" | the real URL |
| Press kit — Release date | "Pending App Review" | the date |
| About aggregate line | "All four coming soon…" | handles partial launches automatically |

## 2. Things sync does NOT do

- **About build log** — add an entry by hand (`about.html`, `.log` section). It's
  a narrative, not a status.
- **Org README** — `~/Projects/big-beard-apps/org-profile/profile/README.md`,
  change that app's Status cell to `**Live**` with the App Store link, commit, push.
- **App page copy** — anything phrased as "coming soon" in prose (check
  `reeltalk/index.html`'s meta description).

Run this to catch stragglers:

```bash
grep -rn -i "coming soon\|in review\|pending" --include=*.html . | grep -v bba:
```

## 3. Announce

Post per app, not all at once — four launch posts across a week beats one.
Attach the demo video every time (`~/Downloads/<app>-preview-886x1920.mov`,
`~/Desktop/ReelTalk-Demo.mp4`).

**Rules that cost a delete-and-repost when forgotten:**
- Write the **full `https://` URL** — Mastodon does not linkify a bare domain.
- Use the canonical **trailing-slash** URL (`/reeltalk/`) — it is a different
  link-preview cache key than the redirecting `/reeltalk`.
- Hashtags are **Mastodon only**; they push X over 280.

### Feastmark
```
Feastmark is live on the App Store 🍽️

Save a recipe video from Instagram, TikTok, or YouTube and it becomes a real recipe in your cookbook — even when the recipe is only spoken out loud.

No account. No ads. Everything stays on your device.

https://bigbeardapps.com/feastmark/
```

### PayoffPilot
```
PayoffPilot is live on the App Store 📊

Compare Snowball vs. Avalanche on your real numbers, run what-ifs, and see your actual debt-free date.

No bank login. No subscription — pay once or never.

https://bigbeardapps.com/payoffpilot/
```

### ReelTalk
```
ReelTalk is live on the App Store 🎣

30 original fishing pun stickers for iMessage. Big Bass Energy. Zero Fish Given. Trout of Office.

99 cents, one time. No ads, no tracking, no network access at all.

https://bigbeardapps.com/reeltalk/
```

### Gunmark

**Not on this runbook's path yet.** Gunmark is at `status: "beta"` — in
TestFlight, not submitted — with signups on gunmark.app. Step 1 still works
when it is approved (same three fields, same sync), but there is no approval to
announce yet, so there is no post here.

**When it goes from beta to submitted, set `status` to `"review"`.** That one
edit is what makes the site say four apps are in App Review instead of three,
and swaps its pills from "Beta signups open" back to "Coming soon to the App
Store" and its press release-date row from "In TestFlight beta" to "Pending App
Review". Leaving it on `beta` after submitting understates the queue; moving it
early overstates it, which is the bug that existed until it was caught on
Gunmark's own page.

Write the announce copy when it has a real App Store URL, not before. Until
then the roll-up below stays at three, because that is what "all out" means for
the apps that are actually in the queue.

### When all three App Store apps are out
```
Three apps. One bearded guy. All live on the App Store 🧔

🍽️ Feastmark — recipe videos → your cookbook
📊 PayoffPilot — plan your way out of debt
🎣 ReelTalk — fishing pun stickers

Privacy-first, every one. No ads, no tracking, no accounts.

https://bigbeardapps.com/
```

Mastodon versions: append `#iOSDev #IndieDev #BuildInPublic` (plus `#Cooking`
for Feastmark, `#PersonalFinance` for PayoffPilot, `#Fishing` for ReelTalk).

## 4. After

- Check the App Store link actually resolves before announcing.
- Re-share the link once the preview card looks right; caches are per-URL and
  effectively unpurgeable, so get it right the first time.
- Submit `sitemap.xml` in Google Search Console if you haven't.
