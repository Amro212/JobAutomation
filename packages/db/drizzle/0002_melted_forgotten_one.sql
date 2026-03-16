CREATE TABLE `discovery_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`cron_expression` text NOT NULL,
	`timezone` text NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `discovery_runs` ADD `schedule_id` text REFERENCES discovery_schedules(id);