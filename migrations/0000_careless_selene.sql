CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`user_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`access_token_expires_at` integer,
	`refresh_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `accounts_user_id_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE TABLE `billing_webhook_receipts` (
	`fingerprint` text PRIMARY KEY NOT NULL,
	`provider` text DEFAULT 'lemonsqueezy' NOT NULL,
	`event_name` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`received_at` integer NOT NULL,
	`processed_at` integer
);
--> statement-breakpoint
CREATE TABLE `competitors` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`canonical_domain` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `competitors_project_name_unique` ON `competitors` (`project_id`,`normalized_name`);--> statement-breakpoint
CREATE INDEX `competitors_project_idx` ON `competitors` (`project_id`);--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`brand_name` text NOT NULL,
	`canonical_domain` text NOT NULL,
	`trial_scan_reserved_at` integer,
	`trial_scan_completed_at` integer,
	`manual_scan_last_used_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_user_id_unique` ON `projects` (`user_id`);--> statement-breakpoint
CREATE TABLE `prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`text` text NOT NULL,
	`normalized_text` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prompts_project_text_unique` ON `prompts` (`project_id`,`normalized_text`);--> statement-breakpoint
CREATE INDEX `prompts_project_enabled_idx` ON `prompts` (`project_id`,`enabled`);--> statement-breakpoint
CREATE TABLE `provider_call_reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`idempotency_key` text NOT NULL,
	`user_id` text NOT NULL,
	`project_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`scan_run_id` text NOT NULL,
	`provider` text NOT NULL,
	`usage_date` text NOT NULL,
	`status` text NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`provider_request_id` text,
	`reserved_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scan_run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_call_reservations_idempotency_key_unique` ON `provider_call_reservations` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `reservations_provider_date_idx` ON `provider_call_reservations` (`usage_date`,`provider`);--> statement-breakpoint
CREATE INDEX `reservations_user_date_idx` ON `provider_call_reservations` (`user_id`,`usage_date`);--> statement-breakpoint
CREATE INDEX `reservations_project_date_idx` ON `provider_call_reservations` (`project_id`,`usage_date`);--> statement-breakpoint
CREATE INDEX `reservations_status_time_idx` ON `provider_call_reservations` (`status`,`reserved_at`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`window_started_at` integer NOT NULL,
	`count` integer DEFAULT 1 NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rate_limits_expires_idx` ON `rate_limits` (`expires_at`);--> statement-breakpoint
CREATE TABLE `scan_results` (
	`id` text PRIMARY KEY NOT NULL,
	`scan_run_id` text NOT NULL,
	`project_id` text NOT NULL,
	`prompt_id` text NOT NULL,
	`provider` text NOT NULL,
	`provider_model` text NOT NULL,
	`provider_preset` text,
	`observation_date` text NOT NULL,
	`raw_response_text` text,
	`citation_data_json` text,
	`brand_mentioned` integer NOT NULL,
	`brand_position` integer,
	`competitor_mentions_json` text DEFAULT '[]' NOT NULL,
	`matched_terms_json` text DEFAULT '[]' NOT NULL,
	`context_classification` text NOT NULL,
	`provider_request_id` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`error_code` text,
	`error_message_safe` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`scan_run_id`) REFERENCES `scan_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`prompt_id`) REFERENCES `prompts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scan_results_daily_unique` ON `scan_results` (`project_id`,`prompt_id`,`provider`,`observation_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `scan_results_run_prompt_unique` ON `scan_results` (`scan_run_id`,`prompt_id`);--> statement-breakpoint
CREATE INDEX `scan_results_project_history_idx` ON `scan_results` (`project_id`,`observation_date`);--> statement-breakpoint
CREATE INDEX `scan_results_prompt_history_idx` ON `scan_results` (`prompt_id`,`observation_date`);--> statement-breakpoint
CREATE TABLE `scan_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`trigger_type` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`observation_date` text NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`attempted_count` integer DEFAULT 0 NOT NULL,
	`successful_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scan_runs_project_date_idx` ON `scan_runs` (`project_id`,`observation_date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`user_id` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE INDEX `sessions_user_id_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`lemon_squeezy_subscription_id` text NOT NULL,
	`lemon_squeezy_customer_id` text NOT NULL,
	`lemon_squeezy_order_id` text,
	`lemon_squeezy_store_id` text NOT NULL,
	`lemon_squeezy_product_id` text NOT NULL,
	`lemon_squeezy_variant_id` text NOT NULL,
	`status` text NOT NULL,
	`cancelled` integer DEFAULT false NOT NULL,
	`renews_at` integer,
	`ends_at` integer,
	`trial_ends_at` integer,
	`payment_processor` text,
	`card_brand` text,
	`card_last_four` text,
	`test_mode` integer NOT NULL,
	`provider_updated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_lemon_squeezy_subscription_id_unique` ON `subscriptions` (`lemon_squeezy_subscription_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `subscriptions_user_unique` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_customer_idx` ON `subscriptions` (`lemon_squeezy_customer_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_ends_idx` ON `subscriptions` (`status`,`ends_at`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false NOT NULL,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `verifications_identifier_idx` ON `verifications` (`identifier`);