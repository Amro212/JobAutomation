ALTER TABLE `artifacts` ADD `applicant_profile_id` text;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `applicant_profile_updated_at` integer;--> statement-breakpoint
ALTER TABLE `artifacts` ADD `version` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE INDEX `artifacts_job_kind_version_idx` ON `artifacts` (`job_id`,`kind`,`format`,`version`);