-- Additive: preserve all existing results as explicitly legacy evidence.
ALTER TABLE projects ADD COLUMN context_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE projects ADD COLUMN v2_enabled_at INTEGER;
ALTER TABLE projects ADD COLUMN creation_key TEXT;
ALTER TABLE projects ADD COLUMN creation_hash TEXT;
ALTER TABLE prompts ADD COLUMN archived_at INTEGER;
ALTER TABLE prompts ADD COLUMN replaces_question_id TEXT;
ALTER TABLE competitors ADD COLUMN archived_at INTEGER;
ALTER TABLE scan_runs ADD COLUMN intent_key TEXT;
ALTER TABLE scan_runs ADD COLUMN phase TEXT;
ALTER TABLE scan_runs ADD COLUMN context_version INTEGER;
ALTER TABLE scan_runs ADD COLUMN due_at INTEGER;
CREATE UNIQUE INDEX scan_runs_intent_unique ON scan_runs(intent_key);
ALTER TABLE scan_results ADD COLUMN evidence_version TEXT NOT NULL DEFAULT 'legacy-normalized';
ALTER TABLE scan_results ADD COLUMN request_context_json TEXT;
-- Versioned envelope includes raw JSON, text parts, sources, links and entity matches.
ALTER TABLE scan_results ADD COLUMN evidence_json TEXT;
ALTER TABLE scan_results ADD COLUMN received_at INTEGER;
ALTER TABLE scan_results ADD COLUMN reported_cost TEXT;
CREATE INDEX results_v2_history_idx ON scan_results(project_id,prompt_id,received_at,id);
ALTER TABLE provider_call_reservations ADD COLUMN item_id TEXT;
ALTER TABLE provider_call_reservations ADD COLUMN request_context_json TEXT;
ALTER TABLE provider_call_reservations ADD COLUMN lease_token TEXT;
ALTER TABLE provider_call_reservations ADD COLUMN lease_until INTEGER;
ALTER TABLE provider_call_reservations ADD COLUMN failure_code TEXT;
ALTER TABLE provider_call_reservations ADD COLUMN provider_status TEXT;
ALTER TABLE provider_call_reservations ADD COLUMN provider_response_json TEXT;
ALTER TABLE provider_call_reservations ADD COLUMN reported_cost TEXT;
CREATE TABLE pilot_enrollments (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 qualified_at INTEGER NOT NULL, manual_check_at INTEGER NOT NULL, role TEXT NOT NULL,
 authority_confirmed INTEGER NOT NULL, example_verified INTEGER NOT NULL,
 policy_version TEXT NOT NULL DEFAULT 'pilot-v2-1', frozen_question_ids_json TEXT,
 frozen_context_json TEXT, trial_started_at INTEGER, expires_at INTEGER,
 baseline_closed_at INTEGER, followup_due_at INTEGER, paid_starts_at INTEGER,
 trial_state TEXT NOT NULL DEFAULT 'eligible'
);
CREATE TABLE scan_run_items (
 id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES scan_runs(id) ON DELETE CASCADE,
 prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE, phase TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', attempts_used INTEGER NOT NULL DEFAULT 0,
 due_at INTEGER NOT NULL, terminal_reason TEXT
);
CREATE UNIQUE INDEX run_items_question_unique ON scan_run_items(run_id,prompt_id);
CREATE INDEX run_items_due_idx ON scan_run_items(status,due_at);
CREATE TABLE product_events (
 id TEXT PRIMARY KEY, dedupe_key TEXT NOT NULL UNIQUE, schema_version INTEGER NOT NULL DEFAULT 1,
 name TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
 question_id TEXT, observation_id TEXT, compare_to_id TEXT,
 received_at INTEGER NOT NULL, occurred_at INTEGER NOT NULL, source TEXT NOT NULL,
 assisted INTEGER, properties_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX events_cohort_idx ON product_events(user_id,name,received_at);
