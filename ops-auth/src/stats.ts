/**
 * Stats: Cloudflare zone traffic (GraphQL) + manual App Store-style metrics
 * Free-tier friendly — httpRequests1dGroups works on Free plans.
 */

export interface StatsEnv {
  DB: D1Database;
  CF_API_TOKEN?: string;
  CF_ZONE_ID?: string;
  /** JSON array: [{ "name": "example.com", "id": "zone-id" }] */
  CF_ZONES?: string;
}

export type ZoneRef = { name: string; id: string };

export type ZoneTraffic = {
  name: string;
  id: string;
  available: boolean;
  reason?: string;
  days: TrafficDay[];
  totals: {
    requests: number;
    pageViews: number;
    uniques: number;
    threats: number;
    bytes: number;
  };
};

export type TrafficDay = {
  date: string;
  requests: number;
  pageViews: number;
  uniques: number;
  threats: number;
  bytes: number;
  cachedRequests: number;
};

export type ManualMetric = {
  id: string;
  app_id: string | null;
  metric: string;
  value: number;
  period_date: string;
  source: string;
  note: string | null;
  created_at: number;
};

function lastNDates(n: number): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(end.getUTCDate() - (n - 1));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10)
  };
}

function parseZones(env: StatsEnv): ZoneRef[] {
  if (env.CF_ZONES) {
    try {
      const parsed = JSON.parse(env.CF_ZONES) as ZoneRef[];
      if (Array.isArray(parsed) && parsed.length) {
        return parsed.filter(z => z && z.name && z.id);
      }
    } catch {
      // fall through
    }
  }
  if (env.CF_ZONE_ID) {
    return [{ name: 'bigbeardapps.com', id: env.CF_ZONE_ID }];
  }
  return [];
}

function emptyTotals() {
  return { requests: 0, pageViews: 0, uniques: 0, threats: 0, bytes: 0 };
}

function sumDays(days: TrafficDay[]) {
  return days.reduce(
    (acc, d) => {
      acc.requests += d.requests;
      acc.pageViews += d.pageViews;
      acc.uniques += d.uniques;
      acc.threats += d.threats;
      acc.bytes += d.bytes;
      return acc;
    },
    emptyTotals()
  );
}

export async function fetchZoneTraffic(
  env: StatsEnv,
  zone: ZoneRef,
  days = 14
): Promise<ZoneTraffic> {
  if (!env.CF_API_TOKEN) {
    return {
      name: zone.name,
      id: zone.id,
      available: false,
      reason: 'Set CF_API_TOKEN secret to enable live traffic.',
      days: [],
      totals: emptyTotals()
    };
  }

  const { start, end } = lastNDates(days);
  const query = `
    query($zoneTag: string, $start: Date, $end: Date) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(
            orderBy: [date_ASC]
            limit: 40
            filter: { date_geq: $start, date_leq: $end }
          ) {
            dimensions { date }
            sum { requests pageViews cachedRequests threats bytes }
            uniq { uniques }
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      variables: { zoneTag: zone.id, start, end }
    })
  });

  if (!res.ok) {
    return {
      name: zone.name,
      id: zone.id,
      available: false,
      reason: `Cloudflare API HTTP ${res.status}`,
      days: [],
      totals: emptyTotals()
    };
  }

  const payload = await res.json() as {
    errors?: Array<{ message: string }>;
    data?: {
      viewer?: {
        zones?: Array<{
          httpRequests1dGroups?: Array<{
            dimensions: { date: string };
            sum: {
              requests: number;
              pageViews: number;
              cachedRequests: number;
              threats: number;
              bytes: number;
            };
            uniq: { uniques: number };
          }>;
        }>;
      };
    };
  };

  if (payload.errors?.length) {
    return {
      name: zone.name,
      id: zone.id,
      available: false,
      reason: payload.errors.map(e => e.message).join('; '),
      days: [],
      totals: emptyTotals()
    };
  }

  const groups = payload.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
  const daysData = groups.map(g => ({
    date: g.dimensions.date,
    requests: g.sum.requests || 0,
    pageViews: g.sum.pageViews || 0,
    uniques: g.uniq.uniques || 0,
    threats: g.sum.threats || 0,
    bytes: g.sum.bytes || 0,
    cachedRequests: g.sum.cachedRequests || 0
  }));

  return {
    name: zone.name,
    id: zone.id,
    available: true,
    days: daysData,
    totals: sumDays(daysData)
  };
}

export async function fetchCloudflareTraffic(env: StatsEnv, days = 14): Promise<{
  available: boolean;
  reason?: string;
  days: TrafficDay[];
}> {
  const zones = parseZones(env);
  const primary = zones[0] || (env.CF_ZONE_ID ? { name: 'bigbeardapps.com', id: env.CF_ZONE_ID } : null);
  if (!primary) {
    return {
      available: false,
      reason: 'Set CF_ZONE_ID or CF_ZONES to enable live traffic.',
      days: []
    };
  }
  const result = await fetchZoneTraffic(env, primary, days);
  return {
    available: result.available,
    reason: result.reason,
    days: result.days
  };
}

export async function fetchAllZonesTraffic(env: StatsEnv, days = 14): Promise<ZoneTraffic[]> {
  const zones = parseZones(env);
  if (!zones.length) return [];
  return Promise.all(zones.map(z => fetchZoneTraffic(env, z, days)));
}

export async function listManualMetrics(env: StatsEnv): Promise<ManualMetric[]> {
  const result = await env.DB.prepare(
    'SELECT * FROM metrics ORDER BY period_date DESC, created_at DESC LIMIT 100'
  ).all<ManualMetric>();
  return result.results || [];
}

export async function createManualMetric(
  env: StatsEnv,
  input: {
    app_id?: string | null;
    metric: string;
    value: number;
    period_date: string;
    note?: string;
  }
): Promise<ManualMetric> {
  const id = `met-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const created_at = Date.now();
  await env.DB.prepare(
    `INSERT INTO metrics (id, app_id, metric, value, period_date, source, note, created_at)
     VALUES (?, ?, ?, ?, ?, 'manual', ?, ?)`
  ).bind(
    id,
    input.app_id || null,
    input.metric,
    input.value,
    input.period_date,
    input.note || null,
    created_at
  ).run();

  const row = await env.DB.prepare('SELECT * FROM metrics WHERE id = ?').bind(id).first<ManualMetric>();
  return row!;
}

export async function deleteManualMetric(env: StatsEnv, id: string): Promise<void> {
  await env.DB.prepare('DELETE FROM metrics WHERE id = ?').bind(id).run();
}

/** asc-metrics `report --json` contract (schema_version 1). */
export type AscReportJson = {
  schema_version: number;
  period_start: string;
  period_end: string;
  total_units: string | number;
  previous_units?: string | number;
  money?: Array<{ currency: string; proceeds: string | number }>;
  by_app?: Array<{ key: string; units: string | number }>;
};

export type AscImportResult = {
  imported: number;
  period_start: string;
  period_end: string;
  total_units: number;
  previous_units: number | null;
  matched: Array<{ key: string; app_id: string; units: number }>;
  unmatched: Array<{ key: string; units: number }>;
};

type OpsApp = { id: string; slug: string; name: string };

function parseNum(v: string | number | undefined | null): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function slugifyKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'unknown';
}

/** Map ASC sku / bundle key onto an ops app (slug/name heuristics). */
export function matchAscKeyToApp(apps: OpsApp[], key: string): OpsApp | null {
  const k = key.toLowerCase().trim();
  if (!k || !apps.length) return null;

  const exactSlug = apps.find(a => a.slug.toLowerCase() === k);
  if (exactSlug) return exactSlug;

  const exactName = apps.find(a => a.name.toLowerCase() === k);
  if (exactName) return exactName;

  // Prefer longer slug matches (reeltalk before reel)
  const bySlugLen = [...apps].sort((a, b) => b.slug.length - a.slug.length);
  for (const a of bySlugLen) {
    const slug = a.slug.toLowerCase();
    if (k.includes(slug) || slug.includes(k)) return a;
  }

  for (const a of apps) {
    const compact = a.name.toLowerCase().replace(/[\s–—-]+/g, '');
    if (compact && (k.includes(compact) || compact.includes(k.replace(/[\s.–—-]+/g, '')))) {
      return a;
    }
  }

  return null;
}

/**
 * Replace all source=asc metrics with a fresh snapshot from asc-metrics JSON.
 * ASC keys stay on the Mac — Ops only stores the report payload you push.
 */
export async function importAscReport(
  env: StatsEnv,
  payload: AscReportJson
): Promise<AscImportResult> {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid ASC report body');
  }
  if (payload.schema_version !== 1) {
    throw new Error(`Unsupported schema_version (want 1, got ${payload.schema_version})`);
  }
  const period_start = String(payload.period_start || '').trim();
  const period_end = String(payload.period_end || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(period_start) || !/^\d{4}-\d{2}-\d{2}$/.test(period_end)) {
    throw new Error('period_start and period_end must be YYYY-MM-DD');
  }
  const total_units = parseNum(payload.total_units);
  if (total_units === null) throw new Error('total_units required');
  const previous_units = parseNum(payload.previous_units ?? null);

  const appsResult = await env.DB.prepare(
    'SELECT id, slug, name FROM apps ORDER BY sort_order ASC'
  ).all<OpsApp>();
  const apps = appsResult.results || [];

  const created_at = Date.now();
  const noteBase = `ASC ${period_start}→${period_end}`;
  const rows: Array<{
    id: string;
    app_id: string | null;
    metric: string;
    value: number;
    note: string;
  }> = [];

  rows.push({
    id: `asc-downloads-overall-${period_end}`,
    app_id: null,
    metric: 'downloads',
    value: total_units,
    note:
      previous_units !== null
        ? `${noteBase} · prev ${previous_units}`
        : noteBase
  });

  const matched: AscImportResult['matched'] = [];
  const unmatched: AscImportResult['unmatched'] = [];

  for (const entry of payload.by_app || []) {
    const key = String(entry.key || '').trim();
    const units = parseNum(entry.units);
    if (!key || units === null) continue;
    const app = matchAscKeyToApp(apps, key);
    if (app) {
      matched.push({ key, app_id: app.id, units });
      rows.push({
        id: `asc-downloads-${app.slug}-${period_end}`,
        app_id: app.id,
        metric: 'downloads',
        value: units,
        note: `${noteBase} · sku ${key}`
      });
    } else {
      unmatched.push({ key, units });
      rows.push({
        id: `asc-downloads-${slugifyKey(key)}-${period_end}`,
        app_id: null,
        metric: 'downloads',
        value: units,
        note: `${noteBase} · unmatched sku ${key}`
      });
    }
  }

  for (const m of payload.money || []) {
    const currency = String(m.currency || '').trim().toUpperCase();
    const proceeds = parseNum(m.proceeds);
    if (!currency || proceeds === null) continue;
    const metric = currency === 'USD' ? 'proceeds_usd' : `proceeds_${currency}`;
    rows.push({
      id: `asc-${metric}-overall-${period_end}`,
      app_id: null,
      metric,
      value: proceeds,
      note: noteBase
    });
  }

  await env.DB.prepare(`DELETE FROM metrics WHERE source = 'asc'`).run();

  // D1 batch (chunk if large — ASC by_app is small)
  const stmts = rows.map(r =>
    env.DB.prepare(
      `INSERT INTO metrics (id, app_id, metric, value, period_date, source, note, created_at)
       VALUES (?, ?, ?, ?, ?, 'asc', ?, ?)`
    ).bind(r.id, r.app_id, r.metric, r.value, period_end, r.note, created_at)
  );
  if (stmts.length) await env.DB.batch(stmts);

  return {
    imported: rows.length,
    period_start,
    period_end,
    total_units,
    previous_units,
    matched,
    unmatched
  };
}

export function summarizeAscMetrics(metrics: ManualMetric[]): {
  available: boolean;
  period_end: string | null;
  period_start: string | null;
  total_units: number | null;
  previous_units: number | null;
  imported_at: number | null;
} {
  const asc = metrics.filter(m => m.source === 'asc');
  const overall = asc.find(m => m.metric === 'downloads' && !m.app_id && m.id.includes('overall'));
  if (!overall) {
    return {
      available: false,
      period_end: null,
      period_start: null,
      total_units: null,
      previous_units: null,
      imported_at: null
    };
  }
  const note = overall.note || '';
  const range = note.match(/ASC (\d{4}-\d{2}-\d{2})→(\d{4}-\d{2}-\d{2})/);
  const prev = note.match(/prev\s+([\d.]+)/);
  return {
    available: true,
    period_end: overall.period_date,
    period_start: range ? range[1] : null,
    total_units: overall.value,
    previous_units: prev ? Number(prev[1]) : null,
    imported_at: overall.created_at
  };
}

const APP_PATHS: Array<{ key: string; label: string; match: (path: string, host: string) => boolean }> = [
  { key: 'home', label: 'bigbeardapps.com /', match: (p, h) => (h === 'bigbeardapps.com' || h === 'www.bigbeardapps.com') && (p === '/' || p === '/index.html') },
  { key: 'feastmark', label: '/feastmark', match: (p) => p.startsWith('/feastmark') },
  { key: 'payoffpilot', label: '/payoffpilot', match: (p) => p.startsWith('/payoffpilot') },
  { key: 'reeltalk', label: '/reeltalk', match: (p) => p.startsWith('/reeltalk') },
  { key: 'gunmark', label: '/gunmark', match: (p) => p.startsWith('/gunmark') },
  { key: 'huntmark', label: '/huntmark', match: (p) => p.startsWith('/huntmark') },
  { key: 'ops', label: 'ops.bigbeardapps.com', match: (_p, h) => h.startsWith('ops.') },
  { key: 'dash', label: 'dash.bigbeardapps.com', match: (_p, h) => h.startsWith('dash.') }
];

/** Free-plan path/host breakdown is limited to ~1 day windows. */
export async function fetchUrlBreakdown(env: StatsEnv): Promise<{
  available: boolean;
  reason?: string;
  window_hours: number;
  hosts: Array<{ host: string; requests: number }>;
  paths: Array<{ key: string; label: string; requests: number }>;
}> {
  if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) {
    return {
      available: false,
      reason: 'Set CF_API_TOKEN and CF_ZONE_ID to enable URL breakdown.',
      window_hours: 24,
      hosts: [],
      paths: []
    };
  }

  const end = new Date();
  const start = new Date(end.getTime() - 23 * 60 * 60 * 1000);
  const query = `
    query($zoneTag: string, $start: Time, $end: Time) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequestsAdaptiveGroups(
            limit: 100
            orderBy: [count_DESC]
            filter: { datetime_geq: $start, datetime_lt: $end }
          ) {
            count
            dimensions { clientRequestPath clientRequestHTTPHost }
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      variables: {
        zoneTag: env.CF_ZONE_ID,
        start: start.toISOString().replace(/\.\d{3}Z$/, 'Z'),
        end: end.toISOString().replace(/\.\d{3}Z$/, 'Z')
      }
    })
  });

  if (!res.ok) {
    return {
      available: false,
      reason: `Cloudflare API HTTP ${res.status}`,
      window_hours: 24,
      hosts: [],
      paths: []
    };
  }

  const payload = await res.json() as {
    errors?: Array<{ message: string }>;
    data?: {
      viewer?: {
        zones?: Array<{
          httpRequestsAdaptiveGroups?: Array<{
            count: number;
            dimensions: { clientRequestPath: string; clientRequestHTTPHost: string };
          }>;
        }>;
      };
    };
  };

  if (payload.errors?.length) {
    return {
      available: false,
      reason: payload.errors.map(e => e.message).join('; '),
      window_hours: 24,
      hosts: [],
      paths: []
    };
  }

  const groups = payload.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups || [];
  const hostMap = new Map<string, number>();
  const pathMap = new Map<string, number>();
  for (const def of APP_PATHS) pathMap.set(def.key, 0);

  for (const g of groups) {
    const rawHost = (g.dimensions.clientRequestHTTPHost || '').toLowerCase();
    const host = rawHost.split(':')[0];
    const path = g.dimensions.clientRequestPath || '/';
    const count = g.count || 0;
    if (!host || host.endsWith('.')) continue;
    // skip obvious scanner noise ports already stripped; keep main hosts
    hostMap.set(host, (hostMap.get(host) || 0) + count);
    for (const def of APP_PATHS) {
      if (def.match(path, host)) {
        pathMap.set(def.key, (pathMap.get(def.key) || 0) + count);
        break;
      }
    }
  }

  const hosts = [...hostMap.entries()]
    .map(([host, requests]) => ({ host, requests }))
    .sort((a, b) => b.requests - a.requests)
    .slice(0, 12);

  const paths = APP_PATHS.map(def => ({
    key: def.key,
    label: def.label,
    requests: pathMap.get(def.key) || 0
  })).sort((a, b) => b.requests - a.requests);

  return {
    available: true,
    window_hours: 24,
    hosts,
    paths
  };
}

export async function buildStatsPayload(env: StatsEnv) {
  const [zones, breakdown, metrics, apps] = await Promise.all([
    fetchAllZonesTraffic(env, 14),
    fetchUrlBreakdown(env),
    listManualMetrics(env),
    env.DB.prepare('SELECT id, slug, name FROM apps ORDER BY sort_order ASC').all<{
      id: string;
      slug: string;
      name: string;
    }>()
  ]);

  const primary = zones.find(z => z.name === 'bigbeardapps.com') || zones[0];
  const traffic = primary
    ? { available: primary.available, reason: primary.reason, days: primary.days }
    : { available: false, reason: 'No zones configured', days: [] as TrafficDay[] };

  const totals = zones
    .filter(z => z.available)
    .reduce(
      (acc, z) => {
        acc.requests += z.totals.requests;
        acc.pageViews += z.totals.pageViews;
        acc.uniques += z.totals.uniques;
        acc.threats += z.totals.threats;
        acc.bytes += z.totals.bytes;
        return acc;
      },
      emptyTotals()
    );

  return {
    traffic,
    zones,
    breakdown,
    totals,
    metrics,
    asc: summarizeAscMetrics(metrics),
    apps: apps.results || [],
    generated_at: Date.now()
  };
}
