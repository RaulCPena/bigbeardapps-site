/**
 * Stats: Cloudflare zone traffic (GraphQL) + manual App Store-style metrics
 * Free-tier friendly — httpRequests1dGroups works on Free plans.
 */

export interface StatsEnv {
  DB: D1Database;
  CF_API_TOKEN?: string;
  CF_ZONE_ID?: string;
}

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

export async function fetchCloudflareTraffic(env: StatsEnv, days = 14): Promise<{
  available: boolean;
  reason?: string;
  days: TrafficDay[];
}> {
  if (!env.CF_API_TOKEN || !env.CF_ZONE_ID) {
    return {
      available: false,
      reason: 'Set CF_API_TOKEN secret and CF_ZONE_ID var to enable live traffic.',
      days: []
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
      variables: { zoneTag: env.CF_ZONE_ID, start, end }
    })
  });

  if (!res.ok) {
    return {
      available: false,
      reason: `Cloudflare API HTTP ${res.status}`,
      days: []
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
      available: false,
      reason: payload.errors.map(e => e.message).join('; '),
      days: []
    };
  }

  const groups = payload.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];
  return {
    available: true,
    days: groups.map(g => ({
      date: g.dimensions.date,
      requests: g.sum.requests || 0,
      pageViews: g.sum.pageViews || 0,
      uniques: g.uniq.uniques || 0,
      threats: g.sum.threats || 0,
      bytes: g.sum.bytes || 0,
      cachedRequests: g.sum.cachedRequests || 0
    }))
  };
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
  const [traffic, breakdown, metrics, apps] = await Promise.all([
    fetchCloudflareTraffic(env, 14),
    fetchUrlBreakdown(env),
    listManualMetrics(env),
    env.DB.prepare('SELECT id, slug, name FROM apps ORDER BY sort_order ASC').all<{
      id: string;
      slug: string;
      name: string;
    }>()
  ]);

  const totals = traffic.days.reduce(
    (acc, d) => {
      acc.requests += d.requests;
      acc.pageViews += d.pageViews;
      acc.uniques += d.uniques;
      acc.threats += d.threats;
      acc.bytes += d.bytes;
      return acc;
    },
    { requests: 0, pageViews: 0, uniques: 0, threats: 0, bytes: 0 }
  );

  return {
    traffic,
    breakdown,
    totals,
    metrics,
    apps: apps.results || [],
    generated_at: Date.now()
  };
}
