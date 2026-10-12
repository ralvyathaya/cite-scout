ALTER TABLE `geo_processing_attempts` ADD `playbook_sync_pending` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `geo_processing_attempts` SET `playbook_sync_pending`=1 WHERE `kind`='analysis' AND `state`='completed' AND `project_id` IS NOT NULL;--> statement-breakpoint
CREATE INDEX `geo_processing_playbook_sync_idx` ON `geo_processing_attempts` (`state`,`kind`,`playbook_sync_pending`,`completed_at`);
