CREATE TABLE `onboarding_suggestions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`source_key` text NOT NULL,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	`provider_started_at` integer,
	`model` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`reserved_cost_microusd` integer DEFAULT 10000 NOT NULL,
	`estimated_cost_microusd` integer,
	`draft_json` text,
	`error_code` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `onboarding_usage_idx` ON `onboarding_suggestions` (`created_at`,`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `onboarding_active_source` ON `onboarding_suggestions` (`user_id`,`source_key`) WHERE "onboarding_suggestions"."state"='reserved';