CREATE TABLE `pilot_enrollments` (
	`user_id` text PRIMARY KEY NOT NULL,
	`qualified_at` integer NOT NULL,
	`manual_check_at` integer NOT NULL,
	`role` text NOT NULL,
	`authority_confirmed` integer NOT NULL,
	`example_verified` integer NOT NULL,
	`policy_version` text DEFAULT 'pilot-v2-1' NOT NULL,
	`frozen_question_ids_json` text,
	`frozen_context_json` text,
	`trial_started_at` integer,
	`expires_at` integer,
	`baseline_closed_at` integer,
	`followup_due_at` integer,
	`paid_starts_at` integer,
	`trial_state` text DEFAULT 'eligible' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `product_events` (
	`id` text PRIMARY KEY NOT NULL,
	`dedupe_key` text NOT NULL,
	`schema_version` integer DEFAULT 1 NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text,
	`question_id` text,
	`observation_id` text,
	`compare_to_id` text,
	`received_at` integer NOT NULL,
	`occurred_at` integer NOT NULL,
	`source` text NOT NULL,
	`assisted` integer,
	`properties_json` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_events_dedupe_key_unique` ON `product_events` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `events_cohort_idx` ON `product_events` (`user_id`,`name`,`received_at`);--> statement-breakpoint
CREATE TABLE `scan_run_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`phase` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts_used` integer DEFAULT 0 NOT NULL,
	`due_at` integer NOT NULL,
	`terminal_reason` text,
	FOREIGN KEY (`run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `run_items_question_unique` ON `scan_run_items` (`run_id`,`prompt_id`);--> statement-breakpoint
CREATE INDEX `run_items_due_idx` ON `scan_run_items` (`status`,`due_at`);--> statement-breakpoint
ALTER TABLE `competitors` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `context_version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `projects` ADD `v2_enabled_at` integer;--> statement-breakpoint
ALTER TABLE `projects` ADD `creation_key` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `creation_hash` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `mutation_key` text;--> statement-breakpoint
ALTER TABLE `prompts` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `prompts` ADD `replaces_question_id` text;--> statement-breakpoint
ALTER TABLE `provider_call_reservations` ADD `item_id` text;--> statement-breakpoint
ALTER TABLE `provider_call_reservations` ADD `request_context_json` text;--> statement-breakpoint
ALTER TABLE `provider_call_reservations` ADD `lease_token` text;--> statement-breakpoint
ALTER TABLE `provider_call_reservations` ADD `lease_until` integer;--> statement-breakpoint
ALTER TABLE `provider_call_reservations` ADD `failure_code` text;--> statement-breakpoint
ALTER TABLE `provider_call_reservations` ADD `provider_status` text;--> statement-breakpoint
ALTER TABLE `provider_call_reservations` ADD `provider_response_json` text;--> statement-breakpoint
ALTER TABLE `provider_call_reservations` ADD `reported_cost` text;--> statement-breakpoint
ALTER TABLE `scan_results` ADD `evidence_version` text DEFAULT 'legacy-normalized' NOT NULL;--> statement-breakpoint
ALTER TABLE `scan_results` ADD `request_context_json` text;--> statement-breakpoint
ALTER TABLE `scan_results` ADD `evidence_json` text;--> statement-breakpoint
ALTER TABLE `scan_results` ADD `received_at` integer;--> statement-breakpoint
ALTER TABLE `scan_results` ADD `reported_cost` text;--> statement-breakpoint
ALTER TABLE `scan_runs` ADD `intent_key` text;--> statement-breakpoint
ALTER TABLE `scan_runs` ADD `phase` text;--> statement-breakpoint
ALTER TABLE `scan_runs` ADD `context_version` integer;--> statement-breakpoint
ALTER TABLE `scan_runs` ADD `due_at` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `scan_runs_intent_key_unique` ON `scan_runs` (`intent_key`);
--> statement-breakpoint
-- Preserve existing evidence and route future checks through the v2 scheduler.
UPDATE projects SET v2_enabled_at=unixepoch()*1000 WHERE v2_enabled_at IS NULL;
