ALTER TABLE `geo_processing_attempts` ADD `usage_date` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `geo_processing_attempts` SET `usage_date`=strftime('%Y-%m-%d',`created_at`/1000.0,'unixepoch');--> statement-breakpoint
CREATE INDEX `geo_processing_usage_idx` ON `geo_processing_attempts` (`usage_date`,`project_id`);
