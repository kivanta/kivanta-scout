/*
 * D1 Investigation Execution Recovery Adapter
 *
 * Implements Scout's application execution-recovery
 * port using Cloudflare D1.
 *
 *
 * Purpose:
 *
 * Find investigations that entered execution
 * preparation but became stranded after their
 * execution ownership disappeared.
 *
 *
 * Recoverable means ALL of the following are true:
 *
 * 1. investigation lifecycle is PREPARING_REVIEW
 *
 * 2. there is no currently usable execution lease
 *
 *    - lease is missing
 *      OR
 *    - lease was released
 *      OR
 *    - lease has expired
 *
 * 3. there is NO durable terminal execution
 *
 *    - COMPLETE
 *    - PARTIAL
 *    - FAILED
 *
 *
 * Historical RUNNING executions do NOT block
 * recovery.
 *
 *
 * IMPORTANT:
 *
 * This adapter performs READ-ONLY recovery
 * discovery.
 *
 * It does NOT:
 *
 * - change investigation lifecycle state
 * - alter execution leases
 * - create execution attempts
 * - send Queue messages
 * - rewrite historical execution rows
 * - publish results
 */

/*
 * ------------------------------------------------
 * Constants
 * ------------------------------------------------
 */

const DEFAULT_LIMIT = 25;

const MAX_LIMIT = 100;

/*
 * ------------------------------------------------
 * Helpers
 * ------------------------------------------------
 */

function isValidTimestamp(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function normalizeLimit(value) {
  if (!Number.isInteger(value)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(
    Math.max(value, 1),

    MAX_LIMIT,
  );
}

/*
 * Convert one D1 query row into the bounded
 * application-facing recovery shape.
 */

function mapRecoverableRow(row) {
  if (!row) {
    return null;
  }

  return {
    investigationId: row.investigation_id,

    lifecycleState: row.lifecycle_state,

    leaseState: row.lease_state,

    leaseAttempt:
      row.lease_attempt === null || row.lease_attempt === undefined
        ? null
        : Number(row.lease_attempt),

    leaseExpiresAt: row.lease_expires_at ?? null,

    latestExecutionStatus: row.latest_execution_status ?? null,
  };
}

/*
 * ------------------------------------------------
 * Adapter factory
 * ------------------------------------------------
 */

export function createD1InvestigationExecutionRecovery(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("A valid Cloudflare D1 binding is required.");
  }

  /*
   * =================================================
   * getRecoverableInvestigations
   * =================================================
   *
   * Read one bounded set of stranded investigations.
   *
   *
   * SQL safety rules:
   *
   * - PREPARING_REVIEW only
   *
   * - active unexpired leases excluded
   *
   * - ANY terminal execution excludes recovery
   *
   * - RUNNING historical execution is allowed
   *
   * - query remains bounded by LIMIT
   */

  async function getRecoverableInvestigations(options = {}) {
    const {
      now,

      limit = DEFAULT_LIMIT,
    } = options;

    /*
     * ------------------------------------------------
     * Validate timestamp
     * ------------------------------------------------
     */

    if (!isValidTimestamp(now)) {
      return {
        status: "recoverable_investigations_query_failed",

        reason: "valid_now_timestamp_required",

        investigations: [],

        count: 0,
      };
    }

    const normalizedNow = now.trim();

    const normalizedLimit = normalizeLimit(limit);

    /*
     * ------------------------------------------------
     * Recovery query
     * ------------------------------------------------
     *
     * LEFT JOIN is intentional.
     *
     * It lets Scout detect:
     *
     * - MISSING lease
     * - RELEASED lease
     * - EXPIRED lease
     *
     *
     * NOT EXISTS protects investigations that already
     * have a durable terminal execution outcome.
     *
     *
     * latestExecutionStatus is informational only.
     *
     * It does not decide recoverability.
     */

    try {
      const result = await db
        .prepare(
          `
            SELECT
              i.investigation_id,

              i.lifecycle_state,

              CASE
                WHEN lease.investigation_id IS NULL
                  THEN 'MISSING'

                WHEN lease.released_at IS NOT NULL
                  THEN 'RELEASED'

                WHEN lease.expires_at <= ?1
                  THEN 'EXPIRED'

                ELSE 'ACTIVE'
              END AS lease_state,

              lease.attempt
                AS lease_attempt,

              lease.expires_at
                AS lease_expires_at,

              (
                SELECT
                  execution.execution_status

                FROM investigation_executions
                  AS execution

                WHERE
                  execution.investigation_id =
                    i.investigation_id

                ORDER BY
                  execution.attempt DESC

                LIMIT 1
              )
                AS latest_execution_status

            FROM investigations
              AS i

            LEFT JOIN
              investigation_execution_leases
                AS lease

              ON lease.investigation_id =
                 i.investigation_id

            WHERE
              i.lifecycle_state =
                'PREPARING_REVIEW'

              AND (
                lease.investigation_id
                  IS NULL

                OR

                lease.released_at
                  IS NOT NULL

                OR

                lease.expires_at
                  <= ?1
              )

              AND NOT EXISTS (
                SELECT 1

                FROM investigation_executions
                  AS terminal_execution

                WHERE
                  terminal_execution.investigation_id =
                    i.investigation_id

                  AND terminal_execution.execution_status
                    IN (
                      'COMPLETE',
                      'PARTIAL',
                      'FAILED'
                    )
              )

            ORDER BY
              i.updated_at ASC,
              i.investigation_id ASC

            LIMIT ?2
            `,
        )
        .bind(
          normalizedNow,

          normalizedLimit,
        )
        .all();

      const rows = Array.isArray(result?.results)
        ? result.results
        : Array.isArray(result)
          ? result
          : [];

      const investigations = rows.map(mapRecoverableRow).filter(Boolean);

      return {
        status: "recoverable_investigations_found",

        reason: null,

        investigations,

        count: investigations.length,
      };
    } catch (error) {
      return {
        status: "recoverable_investigations_query_failed",

        reason: "d1_recoverable_investigations_query_failed",

        investigations: [],

        count: 0,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * Application-facing adapter
   * ------------------------------------------------
   */

  return {
    getRecoverableInvestigations,
  };
}
