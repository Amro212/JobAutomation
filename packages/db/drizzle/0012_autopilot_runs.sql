CREATE TABLE `autopilot_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`trigger_kind` text NOT NULL,
	`status` text NOT NULL,
	`current_step` text NOT NULL,
	`discovery_run_id` text REFERENCES discovery_runs(id) ON DELETE set null,
	`discovered_job_count` integer DEFAULT 0 NOT NULL,
	`eligible_job_count` integer DEFAULT 0 NOT NULL,
	`skipped_job_count` integer DEFAULT 0 NOT NULL,
	`submitted_count` integer DEFAULT 0 NOT NULL,
	`blocked_count` integer DEFAULT 0 NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`error_message` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `application_runs` ADD `autopilot_run_id` text REFERENCES autopilot_runs(id) ON DELETE set null;
--> statement-breakpoint
CREATE INDEX `autopilot_runs_status_idx` ON `autopilot_runs` (`status`);
--> statement-breakpoint
CREATE INDEX `autopilot_runs_created_at_idx` ON `autopilot_runs` (`created_at`);
--> statement-breakpoint
CREATE INDEX `autopilot_runs_discovery_run_idx` ON `autopilot_runs` (`discovery_run_id`);
--> statement-breakpoint
CREATE INDEX `application_runs_autopilot_run_idx` ON `application_runs` (`autopilot_run_id`);
