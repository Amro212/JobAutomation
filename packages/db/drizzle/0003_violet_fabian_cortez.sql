ALTER TABLE `jobs` ADD `review_notes` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `jobs` ADD `review_summary` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `review_score` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `review_score_reasoning` text;--> statement-breakpoint
ALTER TABLE `jobs` ADD `review_updated_at` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `review_score_updated_at` integer;--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);