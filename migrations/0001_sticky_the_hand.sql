PRAGMA defer_foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_provider_call_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text,
	`project_id` text,
	`prompt_id` text,
	`scan_run_id` text,
	`provider` text NOT NULL,
	`usage_date` text NOT NULL,
	`status` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`provider_request_id` text,
	`reserved_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`scan_run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_provider_call_reservations`("id", "idempotency_key", "user_id", "project_id", "prompt_id", "scan_run_id", "provider", "usage_date", "status", "input_tokens", "output_tokens", "provider_request_id", "reserved_at", "completed_at") SELECT "id", "idempotency_key", "user_id", "project_id", "prompt_id", "scan_run_id", "provider", "usage_date", "status", "input_tokens", "output_tokens", "provider_request_id", "reserved_at", "completed_at" FROM `provider_call_reservations`;--> statement-breakpoint
DROP TABLE `provider_call_reservations`;--> statement-breakpoint
ALTER TABLE `__new_provider_call_reservations` RENAME TO `provider_call_reservations`;--> statement-breakpoint
PRAGMA defer_foreign_keys=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `provider_call_reservations_idempotency_key_unique` ON `provider_call_reservations` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `reservations_provider_date_idx` ON `provider_call_reservations` (`usage_date`,`provider`);--> statement-breakpoint
CREATE INDEX `reservations_user_date_idx` ON `provider_call_reservations` (`user_id`,`usage_date`);--> statement-breakpoint
CREATE INDEX `reservations_project_date_idx` ON `provider_call_reservations` (`project_id`,`usage_date`);--> statement-breakpoint
CREATE INDEX `reservations_status_time_idx` ON `provider_call_reservations` (`status`,`reserved_at`);