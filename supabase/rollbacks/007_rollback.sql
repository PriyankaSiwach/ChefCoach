-- Rollback for migrations/007_scan_usage.sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Removes the record_scan_usage function and the scan_usage table (every
-- server-side free scan count is deleted).
--
-- Deploy a server WITHOUT the Stage 4 quota check first: that server needs this
-- table and answers 503 for free users' scans while it is missing.
-- ─────────────────────────────────────────────────────────────────────────────

begin;

drop function if exists public.record_scan_usage(uuid, text);
drop table if exists public.scan_usage;

commit;
