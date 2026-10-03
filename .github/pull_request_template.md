## What changed

<!-- One or two lines. Link the Paperclip issue (e.g. BIGA-123). -->

## Deploy-on-push checklist

**Merging to `main` is a production deploy** (GitHub push webhook → Hostinger).

- [ ] Board deploy approval is recorded on the issue (no merge without it)
- [ ] `python3 tools/sync.py --check` passes (CI runs this)
- [ ] `python3 tools/audit.py` passes (CI runs this)
- [ ] Managed `bba:*` regions changed only via `data/` + `python3 tools/sync.py`
- [ ] No client-facing copy ships without board sign-off
- [ ] Merge normally — **never force-push `main`** (it desyncs Hostinger's clone)

## After merge

- [ ] Confirm the deploy landed — the webhook's 200 OK is not evidence:
      `curl -sI https://bigbeardapps.com/<changed-page>/ | grep -i last-modified`
- [ ] If `Last-Modified` did not move, follow the recovery steps in `README.md`
