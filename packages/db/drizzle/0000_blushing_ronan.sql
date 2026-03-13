CREATE TABLE `applicant_profile` (
	`id` text PRIMARY KEY NOT NULL,
	`full_name` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`reusable_context` text DEFAULT '' NOT NULL,
	`linkedin_url` text DEFAULT '' NOT NULL,
	`website_url` text DEFAULT '' NOT NULL,
	`base_resume_file_name` text DEFAULT '' NOT NULL,
	`base_resume_tex` text DEFAULT '' NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `application_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `artifacts` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`discovery_run_id` text,
	`kind` text NOT NULL,
	`format` text NOT NULL,
	`file_name` text NOT NULL,
	`storage_path` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`discovery_run_id`) REFERENCES `discovery_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `artifacts_job_idx` ON `artifacts` (`job_id`);--> statement-breakpoint
CREATE TABLE `discovery_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_kind` text NOT NULL,
	`status` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	`job_count` integer DEFAULT 0 NOT NULL,
	`new_job_count` integer DEFAULT 0 NOT NULL,
	`updated_job_count` integer DEFAULT 0 NOT NULL,
	`error_message` text
);
--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`source_kind` text NOT NULL,
	`source_id` text NOT NULL,
	`source_url` text NOT NULL,
	`company_name` text NOT NULL,
	`title` text NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`remote_type` text DEFAULT 'unknown' NOT NULL,
	`employment_type` text,
	`compensation_text` text,
	`description_text` text DEFAULT '' NOT NULL,
	`raw_payload` text,
	`discovery_run_id` text,
	`status` text DEFAULT 'discovered' NOT NULL,
	`discovered_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`discovery_run_id`) REFERENCES `discovery_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `jobs_source_identity_idx` ON `jobs` (`source_kind`,`source_id`);--> statement-breakpoint
CREATE INDEX `jobs_updated_at_idx` ON `jobs` (`updated_at`);--> statement-breakpoint
CREATE TABLE `log_events` (
	`id` text PRIMARY KEY NOT NULL,
	`discovery_run_id` text,
	`job_id` text,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`details_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`discovery_run_id`) REFERENCES `discovery_runs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `jobs`(`id`) ON UPDATE no action ON DELETE set null
);
