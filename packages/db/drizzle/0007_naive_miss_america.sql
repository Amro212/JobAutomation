ALTER TABLE `application_runs` ADD `site_key` text NOT NULL;--> statement-breakpoint
ALTER TABLE `application_runs` ADD `current_step` text NOT NULL;--> statement-breakpoint
ALTER TABLE `application_runs` ADD `stop_reason` text;--> statement-breakpoint
ALTER TABLE `application_runs` ADD `prefilter_reasons_json` text;--> statement-breakpoint
ALTER TABLE `application_runs` ADD `review_url` text;--> statement-breakpoint
ALTER TABLE `application_runs` ADD `resume_artifact_id` text;--> statement-breakpoint
ALTER TABLE `application_runs` ADD `cover_letter_artifact_id` text;--> statement-breakpoint
ALTER TABLE `application_runs` ADD `started_at` integer;--> statement-breakpoint
ALTER TABLE `application_runs` ADD `completed_at` integer;--> statement-breakpoint
CREATE INDEX `application_runs_job_idx` ON `application_runs` (`job_id`);--> statement-breakpoint
CREATE INDEX `application_runs_status_idx` ON `application_runs` (`status`);--> statement-breakpoint
ALTER TABLE `artifacts` ADD `application_run_id` text REFERENCES application_runs(id);--> statement-breakpoint
CREATE INDEX `artifacts_application_run_idx` ON `artifacts` (`application_run_id`);--> statement-breakpoint
ALTER TABLE `log_events` ADD `application_run_id` text REFERENCES application_runs(id);--> statement-breakpoint
CREATE INDEX `log_events_application_run_idx` ON `log_events` (`application_run_id`);