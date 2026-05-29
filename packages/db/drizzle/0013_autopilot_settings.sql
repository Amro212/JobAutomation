CREATE TABLE `autopilot_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`config_json` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `autopilot_runs` ADD `config_json` text;
