CREATE TABLE `geo_processing_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`observation_id` text,
	`request_id` text NOT NULL,
	`kind` text NOT NULL,
	`provider` text NOT NULL,
	`model` text,
	`rubric_version` text,
	`policy_version` text,
	`input_hash` text NOT NULL,
	`input_json` text NOT NULL,
	`state` text NOT NULL,
	`result_json` text,
	`failure_code` text,
	`lease_token` text,
	`lease_until` integer,
	`input_tokens` integer,
	`output_tokens` integer,
	`estimated_cost_usd` text,
	`latency_ms` integer,
	`created_at` integer NOT NULL,
	`due_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`observation_id`) REFERENCES `geo_observations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geo_processing_request_unique` ON `geo_processing_attempts` (`project_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `geo_processing_due_idx` ON `geo_processing_attempts` (`state`,`due_at`);--> statement-breakpoint
CREATE INDEX `geo_processing_cache_idx` ON `geo_processing_attempts` (`project_id`,`kind`,`input_hash`);
