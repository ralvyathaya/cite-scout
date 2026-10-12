CREATE TABLE `geo_action_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`action_id` text NOT NULL,
	`request_id` text NOT NULL,
	`body_hash` text NOT NULL,
	`kind` text NOT NULL,
	`details_json` text NOT NULL,
	`scope_json` text NOT NULL,
	`evidence_json` text NOT NULL,
	`recorded_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`action_id`) REFERENCES `geo_actions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geo_action_event_request_unique` ON `geo_action_events` (`project_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `geo_action_event_history_idx` ON `geo_action_events` (`action_id`,`recorded_at`,`id`);--> statement-breakpoint
CREATE TABLE `geo_action_evidence` (
	`id` text PRIMARY KEY NOT NULL,
	`action_id` text NOT NULL,
	`observation_id` text NOT NULL,
	`analysis_id` text NOT NULL,
	`scope_json` text NOT NULL,
	`evidence_ids_json` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`action_id`) REFERENCES `geo_actions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`observation_id`) REFERENCES `geo_observations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_id`) REFERENCES `geo_processing_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geo_action_proof_unique` ON `geo_action_evidence` (`action_id`,`analysis_id`);--> statement-breakpoint
CREATE INDEX `geo_action_proof_cursor_idx` ON `geo_action_evidence` (`action_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `geo_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`candidate_json` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`checked_ids_json` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geo_action_dedupe_unique` ON `geo_actions` (`project_id`,`dedupe_key`);--> statement-breakpoint
CREATE INDEX `geo_processing_observation_idx` ON `geo_processing_attempts` (`observation_id`,`kind`,`state`,`created_at`);
--> statement-breakpoint
CREATE TRIGGER geo_action_events_immutable BEFORE UPDATE ON geo_action_events
BEGIN SELECT RAISE(ABORT, 'GEO_ACTION_EVENT_IMMUTABLE'); END;
