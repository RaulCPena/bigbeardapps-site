# bigbeardapps.com

Static marketing site for Big Beard Apps. Plain HTML — no framework, no build step.

**A push to `main` is a deploy.** Never force-push. Never push unless Raul asks.

Studio conventions: `../AGENTS.md`. Status: `TODO.md`.

## Shipping changes (PR-first)

`main` is protected and Hostinger deploys whatever lands on it. Merging a PR is the deploy.

1. Branch off `main`. Never commit to `main` directly.
2. Run `./tools/install-hooks.sh` once per clone. Before opening the PR, run `python3 tools/sync.py --check`, `python3 tools/audit.py`, and `python3 tools/snapshot.py check`.
3. Open a PR. Fill in the PR template; add before/after notes for any client-facing copy.
4. Get **board approval to deploy** on the Paperclip issue. A PR review alone is not deploy approval.
5. Merge (or push `main`) only after that approval. Never use `--no-verify`. Never force-push.
6. Verify the deploy and paste the output in the issue:
   ```bash
   curl -sI https://bigbeardapps.com/ | grep -i last-modified
   curl -sI https://bigbeardapps.com/<changed-page>/ | grep -i last-modified
   python3 tools/audit.py --quiet
   ```
   `Last-Modified` must be after the merge time. A webhook 200 does not prove a deploy.
7. If the site did not update, do **not** force-push or re-push. Use the Hostinger recovery path in `README.md`.


## Session memory (Cursor + Claude)

- **Start:** read this file and `TODO.md`.
- **Before you finish** any session that changed the repo: update `TODO.md` (`Last updated`, Now, Next, Blocked). Do not rewrite this AGENTS.md unless commands, architecture, or gotchas changed.
- Cursor and Claude Code both follow **AGENTS.md**. `CLAUDE.md` is a pointer only — never a second architecture doc.
