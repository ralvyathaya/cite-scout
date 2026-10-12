CREATE TABLE `geo_observations` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`run_id` text NOT NULL,
	`item_id` text NOT NULL,
	`prompt_version_id` text NOT NULL,
	`engine` text NOT NULL,
	`model` text,
	`status` text NOT NULL,
	`context_json` text NOT NULL,
	`capture_json` text NOT NULL,
	`answer_text` text NOT NULL,
	`captured_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`item_id`) REFERENCES `geo_run_items`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_version_id`) REFERENCES `geo_prompt_versions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geo_observation_item_unique` ON `geo_observations` (`item_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `geo_observation_scope_unique` ON `geo_observations` (`run_id`,`prompt_version_id`,`engine`);--> statement-breakpoint
CREATE INDEX `geo_observation_history_idx` ON `geo_observations` (`project_id`,`engine`,`captured_at`);--> statement-breakpoint
CREATE TABLE `geo_prompt_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`prompt_ids_json` text NOT NULL,
	`prompt_version_ids_json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `geo_prompt_sets_project_idx` ON `geo_prompt_sets` (`project_id`);--> statement-breakpoint
CREATE TABLE `geo_prompt_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `geo_prompt_versions_prompt_idx` ON `geo_prompt_versions` (`prompt_id`);--> statement-breakpoint
CREATE TRIGGER geo_observations_immutable BEFORE UPDATE ON geo_observations
BEGIN SELECT RAISE(ABORT, 'GEO_OBSERVATION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TRIGGER geo_prompt_versions_immutable BEFORE UPDATE ON geo_prompt_versions
BEGIN SELECT RAISE(ABORT, 'GEO_PROMPT_VERSION_IMMUTABLE'); END;
--> statement-breakpoint
CREATE TABLE `geo_run_items` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`project_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`prompt_version_id` text NOT NULL,
	`engine` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`context_json` text NOT NULL,
	`reservation_id` text NOT NULL,
	`provider_task_id` text,
	`attempts_used` integer DEFAULT 1 NOT NULL,
	`due_at` integer NOT NULL,
	`lease_token` text,
	`lease_until` integer,
	`submitted_at` integer,
	`terminal_reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_version_id`) REFERENCES `geo_prompt_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reservation_id`) REFERENCES `provider_call_reservations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geo_item_scope_unique` ON `geo_run_items` (`run_id`,`prompt_version_id`,`engine`);--> statement-breakpoint
CREATE INDEX `geo_items_due_idx` ON `geo_run_items` (`status`,`due_at`);--> statement-breakpoint
CREATE INDEX `geo_items_scope_idx` ON `geo_run_items` (`project_id`,`prompt_id`,`engine`);--> statement-breakpoint
CREATE TABLE `geo_run_snapshots` (
	`run_id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`request_id` text NOT NULL,
	`payload_hash` text NOT NULL,
	`snapshot_hash` text NOT NULL,
	`context_json` text NOT NULL,
	`settings_revision` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geo_run_request_unique` ON `geo_run_snapshots` (`project_id`,`request_id`);--> statement-breakpoint
CREATE TABLE `geo_settings` (
	`project_id` text PRIMARY KEY NOT NULL,
	`engines_json` text NOT NULL,
	`daily_enabled` integer DEFAULT false NOT NULL,
	`language_code` text NOT NULL,
	`location_code` integer NOT NULL,
	`device` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
