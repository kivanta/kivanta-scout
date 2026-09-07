/*
 * Kivanta Scout
 * Migration 0002
 *
 * Investigation Execution Leases
 *
 * Cloudflare Queues provide at-least-once delivery,
 * so the same investigation may be delivered more
 * than once.
 *
 * This table gives one worker temporary execution
 * ownership of an investigation.
 *
 * A lease contains:
 *
 * - opaque ownership token
 * - execution attempt number
 * - acquisition time
 * - latest heartbeat
 * - expiry time
 * - optional release time
 *
 * A stale worker whose token no longer matches the
 * current lease must not be allowed to renew,
 * release, or later write authoritative results.
 */


/*
 * ------------------------------------------------
 * investigation_execution_leases
 * ------------------------------------------------
 *
 * One current lease record per investigation.
 *
 * When a lease expires or is released, a later
 * worker may replace its token and increment the
 * attempt number.
 */

CREATE TABLE investigation_execution_leases (
  investigation_id TEXT NOT NULL PRIMARY KEY,

  lease_token TEXT NOT NULL UNIQUE,

  attempt INTEGER NOT NULL DEFAULT 1
    CHECK (attempt >= 1),

  acquired_at TEXT NOT NULL,

  heartbeat_at TEXT NOT NULL,

  expires_at TEXT NOT NULL,

  released_at TEXT,

  FOREIGN KEY (investigation_id)
    REFERENCES investigations(investigation_id)
    ON DELETE CASCADE
);


/*
 * Helps recovery and worker logic find leases
 * according to expiry time.
 */

CREATE INDEX idx_execution_leases_expires_at
ON investigation_execution_leases (
  expires_at
);


/*
 * Helps distinguish currently held leases from
 * explicitly released leases.
 */

CREATE INDEX idx_execution_leases_released_at
ON investigation_execution_leases (
  released_at
);