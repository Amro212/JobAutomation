ALTER TABLE `jobs` ADD `prefilter_pass` integer;--> statement-breakpoint
ALTER TABLE `jobs` ADD `prefilter_reasons_json` text;--> statement-breakpoint
CREATE INDEX `jobs_prefilter_pass_idx` ON `jobs` (`prefilter_pass`);