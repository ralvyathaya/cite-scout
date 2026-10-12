CREATE TABLE geo_daily_outcomes (
  project_id text NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  usage_date text NOT NULL,
  status text NOT NULL CHECK(status IN ('admitted','skipped')),
  reason text,
  run_id text REFERENCES scan_runs(id) ON DELETE SET NULL,
  first_attempt_at integer NOT NULL,
  last_attempt_at integer NOT NULL,
  PRIMARY KEY(project_id,usage_date)
);
