-- Additive migration for Stats tab (safe to re-run)

CREATE TABLE IF NOT EXISTS metrics (
    id TEXT PRIMARY KEY,
    app_id TEXT,
    metric TEXT NOT NULL,
    value REAL NOT NULL,
    period_date TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'manual',
    note TEXT,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_metrics_date ON metrics(period_date);
CREATE INDEX IF NOT EXISTS idx_metrics_app ON metrics(app_id);
