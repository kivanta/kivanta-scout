/*
 * Kivanta Scout
 * Migration 0003
 *
 * Durable Investigation Executions
 *
 * An investigation can have multiple execution
 * attempts over time.
 *
 * Example:
 *
 * investigation
 *      ↓
 * attempt 1
 *      ↓
 * worker crashes
 *      ↓
 * lease expires
 *      ↓
 * attempt 2
 *
 * Every attempt is preserved as its own historical
 * record. Later attempts must never silently
 * overwrite earlier ones.
 *
 *
 * IMPORTANT:
 *
 * execution_status is operational state.
 *
 * It is NOT automatically equivalent to a
 * Methodology finding such as:
 *
 * PASS
 * CAUTION
 * UNKNOWN
 * N/A
 */


/*
 * ------------------------------------------------
 * investigation_executions
 * ------------------------------------------------
 */

CREATE TABLE investigation_executions (
  execution_id TEXT NOT NULL PRIMARY KEY,

  investigation_id TEXT NOT NULL,

  /*
   * The execution lease token that owned this
   * attempt when it was created.
   *
   * We intentionally do NOT foreign-key this to
   * investigation_execution_leases. The current
   * lease row changes when ownership is replaced,
   * while historical execution records must remain
   * immutable.
   */
  lease_token TEXT NOT NULL,

  /*
   * Matches the durable execution-lease attempt.
   */
  attempt INTEGER NOT NULL
    CHECK (attempt >= 1),

  /*
   * Operational execution state only.
   */
  execution_status TEXT NOT NULL
    CHECK (
      execution_status IN (
        'RUNNING',
        'COMPLETE',
        'PARTIAL',
        'FAILED'
      )
    ),

  started_at TEXT NOT NULL,

  completed_at TEXT,

  /*
   * Durable Methodology output.
   *
   * Stored as JSON text.
   *
   * This is analysis output only.
   * It is NOT automatically public or published.
   */
  analysis_outcome_json TEXT,

  /*
   * Operational execution failure information.
   *
   * A FAILED execution must not automatically be
   * converted into an UNKNOWN Methodology finding.
   */
  failure_reason TEXT,

  created_at TEXT NOT NULL,

  updated_at TEXT NOT NULL,

  FOREIGN KEY (investigation_id)
    REFERENCES investigations(investigation_id)
    ON DELETE CASCADE,

  /*
   * One durable execution record per investigation
   * attempt.
   *
   * Retrying the same investigation requires the
   * execution lease to advance to a new attempt.
   */
  UNIQUE (
    investigation_id,
    attempt
  ),

  /*
   * One execution identity per lease ownership
   * token.
   *
   * This prevents duplicate creation for the same
   * worker lease.
   */
  UNIQUE (
    lease_token
  )
);


/*
 * Efficiently read all historical execution
 * attempts for one investigation.
 */

CREATE INDEX idx_investigation_executions_investigation
ON investigation_executions (
  investigation_id,
  attempt
);


/*
 * Helps recovery / operations find executions by
 * operational state.
 */

CREATE INDEX idx_investigation_executions_status
ON investigation_executions (
  execution_status,
  updated_at
);


/*
 * Helps chronological execution inspection.
 */

CREATE INDEX idx_investigation_executions_started_at
ON investigation_executions (
  started_at
);