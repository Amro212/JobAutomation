-- Performance indexes for high-traffic queries
-- Composite index for autopilot job pool queries (status + prefilter filtering)
CREATE INDEX IF NOT EXISTS "jobs_status_prefilter_idx" ON "jobs" ("status", "prefilter_pass", "prefilter_score" DESC);
--> statement-breakpoint

-- Source kind filter index
CREATE INDEX IF NOT EXISTS "jobs_source_kind_idx" ON "jobs" ("source_kind");
--> statement-breakpoint

-- Discovery run lookup (listByDiscoveryRun)
CREATE INDEX IF NOT EXISTS "jobs_discovery_run_id_idx" ON "jobs" ("discovery_run_id");
--> statement-breakpoint

-- Company name for distinctCompanyNames queries
CREATE INDEX IF NOT EXISTS "jobs_company_name_idx" ON "jobs" ("company_name");
--> statement-breakpoint

-- Application runs: composite (job_id, status) for completedJobIds batch lookups
CREATE INDEX IF NOT EXISTS "application_runs_job_status_idx" ON "application_runs" ("job_id", "status");
--> statement-breakpoint

-- Application runs: status + updated_at for stale run recovery
CREATE INDEX IF NOT EXISTS "application_runs_status_updated_idx" ON "application_runs" ("status", "updated_at");
--> statement-breakpoint

-- Log events: discovery run lookup
CREATE INDEX IF NOT EXISTS "log_events_discovery_run_idx" ON "log_events" ("discovery_run_id");
--> statement-breakpoint

-- Discovery runs: status + completed_at for findLatestCompleted
CREATE INDEX IF NOT EXISTS "discovery_runs_status_completed_idx" ON "discovery_runs" ("status", "completed_at" DESC);
--> statement-breakpoint

-- Artifacts: discovery run lookup
CREATE INDEX IF NOT EXISTS "artifacts_discovery_run_idx" ON "artifacts" ("discovery_run_id");
