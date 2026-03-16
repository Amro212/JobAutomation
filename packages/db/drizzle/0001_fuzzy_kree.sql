CREATE TABLE `discovery_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`source_kind` text NOT NULL,
	`source_key` text NOT NULL,
	`label` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `discovery_sources_identity_idx` ON `discovery_sources` (`source_kind`,`source_key`);--> statement-breakpoint
ALTER TABLE `discovery_runs` ADD `run_kind` text DEFAULT 'single-source' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_runs` ADD `trigger_kind` text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE `discovery_runs` ADD `discovery_source_id` text REFERENCES discovery_sources(id);