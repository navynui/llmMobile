-- Migration 001: Add vram_gb column and normalize status values
-- Run against the active SQLite database (llm_bench.db)
-- Idempotent: safe to run multiple times.

-- Add vram_gb column if it doesn't already exist.
-- Note: SQLite does not support IF NOT EXISTS on ALTER TABLE ADD COLUMN,
-- so this is a no-op if the column was added previously.
ALTER TABLE models ADD COLUMN vram_gb REAL;

-- Normalize status values to lowercase for API consistency.
UPDATE models SET status = 'testing' WHERE UPPER(status) IN ('TESTING', 'PENDING');
UPDATE models SET status = 'failed'   WHERE UPPER(status) IN ('FAILED', 'ERROR');
UPDATE models SET status = 'completed'WHERE UPPER(status) IN ('COMPLETED', 'DONE');
UPDATE models SET status = 'good'     WHERE UPPER(status) IN ('GOOD', 'READY');
