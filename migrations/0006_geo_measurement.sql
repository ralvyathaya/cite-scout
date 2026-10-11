CREATE TABLE `geo_measurement_samples` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`event_id` text,
	`observation_id` text NOT NULL,
	`analysis_id` text,
	`series` text NOT NULL,
	`cohort` text NOT NULL,
	`day` text NOT NULL,
	`sample_json` text NOT NULL,
	`frozen_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `geo_action_events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`observation_id`) REFERENCES `geo_observations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`analysis_id`) REFERENCES `geo_processing_attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `geo_measurement_sample_unique` ON `geo_measurement_samples` (`project_id`,`series`,`cohort`,`day`);
--> statement-breakpoint
CREATE TRIGGER geo_measurement_samples_immutable BEFORE UPDATE ON geo_measurement_samples
BEGIN SELECT RAISE(ABORT, 'GEO_MEASUREMENT_SAMPLE_IMMUTABLE'); END;
