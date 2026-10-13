CREATE TABLE `geo_provider_requests` (
	`operation_key` text PRIMARY KEY NOT NULL,
	`reservation_id` text,
	`processing_id` text,
	`project_id` text,
	`collector` text NOT NULL,
	`usage_date` text NOT NULL,
	`reserved_cost_usd` text NOT NULL,
	`reported_cost_usd` text,
	`estimated_cost_usd` text,
	`pricing_version` text,
	`state` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`reservation_id`) REFERENCES `provider_call_reservations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`processing_id`) REFERENCES `geo_processing_attempts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `geo_provider_usage_idx` ON `geo_provider_requests` (`collector`,`usage_date`);