#!/usr/bin/env bash
# Push local asc-metrics `report --json` into Big Beard Ops.
# ASC API keys never leave your Mac — only the JSON snapshot is uploaded.
#
# Prerequisites:
#   - asc-metrics installed (uv) and synced: `uv run asc-metrics sync`
#   - Ops session cookie (log into Ops, copy Cookie: session=… from DevTools)
#   - If using ops.bigbeardapps.com: also include Cloudflare Access CF_Authorization cookie
#
# Usage:
#   export OPS_COOKIE='session=…; CF_Authorization=…'   # Access cookie optional on workers.dev
#   ./scripts/push-asc-report.sh
#
# Env:
#   OPS_URL          default https://ops.bigbeardapps.com
#   ASC_METRICS_DIR  default ../../asc-metrics (sibling of BigBeardApps)
#   ASC_DAYS         optional days window passed to report (e.g. 30)

set -euo pipefail

OPS_URL="${OPS_URL:-https://ops.bigbeardapps.com}"
ASC_METRICS_DIR="${ASC_METRICS_DIR:-$(cd "$(dirname "$0")/../../../asc-metrics" && pwd)}"
OPS_COOKIE="${OPS_COOKIE:?Set OPS_COOKIE to your Ops session cookie (session=…)}"

if [[ ! -d "$ASC_METRICS_DIR" ]]; then
  echo "asc-metrics not found at $ASC_METRICS_DIR" >&2
  echo "Set ASC_METRICS_DIR to the repo path." >&2
  exit 1
fi

REPORT_ARGS=(report --json)
if [[ -n "${ASC_DAYS:-}" ]]; then
  REPORT_ARGS+=(--days "$ASC_DAYS")
fi

echo "Generating report from $ASC_METRICS_DIR …" >&2
REPORT="$(cd "$ASC_METRICS_DIR" && uv run asc-metrics "${REPORT_ARGS[@]}")"

echo "POSTing to $OPS_URL/api/stats/asc-import …" >&2
curl -sS -X POST "$OPS_URL/api/stats/asc-import" \
  -H "Content-Type: application/json" \
  -H "Cookie: $OPS_COOKIE" \
  -d "$REPORT" | tee /dev/stderr | python3 -c 'import json,sys; d=json.load(sys.stdin); print("\nOK: imported", d.get("imported"), "rows ·", d.get("period_start"), "→", d.get("period_end"), "·", d.get("total_units"), "units") if "imported" in d else sys.exit("Error: "+json.dumps(d))'
