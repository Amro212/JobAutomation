ALTER TABLE `jobs` ADD `prefilter_score` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `prefilter_signals_json` text;--> statement-breakpoint
CREATE INDEX `jobs_prefilter_score_idx` ON `jobs` (`prefilter_score`);
