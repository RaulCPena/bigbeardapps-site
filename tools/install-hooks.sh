#!/usr/bin/env bash
# Install the pre-push guard. Git can't version hooks, so run this once per
# clone:   ./tools/install-hooks.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOOK="$ROOT/.git/hooks/pre-push"

cat > "$HOOK" <<'HOOK_EOF'
#!/usr/bin/env bash
# Guards the deploy. A push to main IS a deploy on this host.
# Bypass (rarely needed):  git push --no-verify
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

# HARD GATE: generated chrome must match data/. This is the guarantee that
# makes hand-editing a managed region impossible to ship by accident.
if ! python3 tools/sync.py --check; then
  echo >&2
  echo "push blocked: run 'python3 tools/sync.py' and commit the result." >&2
  exit 1
fi

# SOFT GATE: the site audit. Still reports known-outstanding work
# (missing canonicals/descriptions until those are generated), so it warns
# rather than blocks. Flip this to a hard gate once `audit.py` is green.
if ! python3 tools/audit.py --quiet; then
  echo >&2
  echo "warning: audit reported problems (not blocking yet)." >&2
fi
HOOK_EOF

chmod +x "$HOOK"
echo "installed: .git/hooks/pre-push"
echo "  hard gate: tools/sync.py --check"
echo "  soft gate: tools/audit.py  (make it blocking once green)"
