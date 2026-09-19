-- prisma/migrations/V49_worker_leases.sql
-- Worker leases: replaces session-scoped pg_try_advisory_lock (Section 10.3).
--
-- Why: pg_try_advisory_lock is session-scoped. Behind a connection pool the
-- acquire and release calls can be routed to DIFFERENT connections, and a
-- crashed worker leaves the lock held on a connection that returns to the
-- pool — silently disabling the job until the process exits.
--
-- A lease is a row with an expiry. It is renewed by heartbeat while the job
-- runs; if the worker dies, the lease expires and the next scheduled run
-- takes over. No manual intervention, no stuck jobs.

CREATE TABLE worker_leases (
  job_name      VARCHAR(100) PRIMARY KEY,   -- e.g. 'notifications.daily_scan'
  holder_id     UUID         NOT NULL,      -- worker instance identity
  acquired_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  heartbeat_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ  NOT NULL,      -- heartbeat_at + lease_seconds
  lease_seconds INTEGER      NOT NULL DEFAULT 300
    CONSTRAINT chk_lease_seconds CHECK (lease_seconds BETWEEN 30 AND 3600),

  CONSTRAINT chk_lease_expiry CHECK (expires_at > acquired_at)
);

CREATE INDEX idx_worker_leases_expiry ON worker_leases(expires_at);

-- Operational visibility: which jobs are currently held, by whom, and until when.
CREATE VIEW worker_lease_status AS
SELECT
  job_name,
  holder_id,
  heartbeat_at,
  expires_at,
  (expires_at < now()) AS is_expired,
  extract(epoch FROM (now() - heartbeat_at))::int AS seconds_since_heartbeat
FROM worker_leases;

COMMENT ON TABLE worker_leases IS
  'Single-writer leases for scheduled jobs. One row per job name; holder renews by heartbeat.';
