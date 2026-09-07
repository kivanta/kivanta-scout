/*
 * D1 Investigation Queued Recovery Adapter
 *
 * Recovers investigations that remain QUEUED
 * after their Queue delivery becomes stale.
 *
 *
 * Candidate rule:
 *
 * investigation = QUEUED
 * + outbox = DISPATCHED
 * + outbox updated_at <= staleBefore
 * + no usable execution lease at now
 * + no terminal execution
 *
 *
 * After a recovery Queue send succeeds:
 *
 * - outbox remains DISPATCHED
 * - original dispatched_at is preserved
 * - attempt_count increments
 * - updated_at becomes the new cooldown clock
 *
 *
 * D1 remains authoritative.
 */

/*
 * =================================================
 * Helpers
 * =================================================
 */

function isValidTimestamp(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isValidOutboxId(value) {
  return Number.isInteger(value) && value > 0;
}

function normalizeLimit(value) {
  if (!Number.isInteger(value)) {
    return 25;
  }

  return Math.min(Math.max(value, 1), 100);
}

function getChangeCount(result) {
  return result?.meta?.changes ?? result?.changes ?? 0;
}

function mapQueuedRecoveryRow(row) {
  if (!row) {
    return null;
  }

  return {
    investigationId: row.investigation_id,

    lifecycleState: row.lifecycle_state,

    outboxId: Number(row.outbox_id),

    dispatchState: row.dispatch_state,

    attemptCount: Number(row.attempt_count),

    dispatchedAt: row.dispatched_at ?? null,

    recoveryClockAt: row.recovery_clock_at ?? null,

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
 * =================================================
 * Factory
 * =================================================
 */

export function createD1InvestigationQueuedRecovery(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("A valid Cloudflare D1 binding is required.");
  }

  /*
   * =================================================
   * getRecoverableQueuedInvestigations
   * =================================================
   */

  async function getRecoverableQueuedInvestigations(options = {}) {
    const { now, staleBefore, limit = 25 } = options;

    /*
     * now:
     * determines whether a lease is usable today.
     *
     * staleBefore:
     * determines whether Queue activity is old
     * enough for recovery.
     */

    if (!isValidTimestamp(now) || !isValidTimestamp(staleBefore)) {
      return {
        status: "recoverable_queued_investigations_query_failed",

        reason: "valid_recovery_timestamps_required",

        investigations: [],

        count: 0,
      };
    }

    const normalizedNow = now.trim();

    const normalizedStaleBefore = staleBefore.trim();

    if (Date.parse(normalizedStaleBefore) > Date.parse(normalizedNow)) {
      return {
        status: "recoverable_queued_investigations_query_failed",

        reason: "stale_before_must_not_exceed_now",

        investigations: [],

        count: 0,
      };
    }

    const normalizedLimit = normalizeLimit(limit);

    try {
      const statement = db.prepare(`
          SELECT
            i.investigation_id,
            i.lifecycle_state,

            o.outbox_id,
            o.dispatch_state,
            o.attempt_count,
            o.dispatched_at,

            o.updated_at
              AS recovery_clock_at,

            CASE
              WHEN lease.investigation_id IS NULL
                THEN 'MISSING'

              WHEN lease.released_at IS NOT NULL
                THEN 'RELEASED'

              WHEN lease.expires_at <= ?
                THEN 'EXPIRED'

              ELSE 'ACTIVE'
            END
              AS lease_state,

            lease.attempt
              AS lease_attempt,

            lease.expires_at
              AS lease_expires_at,

            (
              SELECT execution.execution_status
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

          FROM investigations AS i

          INNER JOIN
            investigation_dispatch_outbox AS o

            ON
              o.investigation_id =
                i.investigation_id

          LEFT JOIN
            investigation_execution_leases AS lease

            ON
              lease.investigation_id =
                i.investigation_id

          WHERE
            i.lifecycle_state =
              'QUEUED'

            AND o.event_type =
              'INVESTIGATION_REQUESTED'

            AND o.dispatch_state =
              'DISPATCHED'

            AND o.updated_at <= ?

            AND (
              lease.investigation_id IS NULL

              OR lease.released_at IS NOT NULL

              OR lease.expires_at <= ?
            )

            AND NOT EXISTS (
              SELECT 1

              FROM investigation_executions
                AS terminal

              WHERE
                terminal.investigation_id =
                  i.investigation_id

                AND terminal.execution_status IN (
                  'COMPLETE',
                  'PARTIAL',
                  'FAILED'
                )
            )

          ORDER BY
            o.updated_at ASC,
            o.outbox_id ASC

          LIMIT ?
        `);

      const result = await statement
        .bind(
          normalizedNow,
          normalizedStaleBefore,
          normalizedNow,
          normalizedLimit,
        )
        .all();

      const rows = Array.isArray(result?.results)
        ? result.results
        : Array.isArray(result)
          ? result
          : [];

      const investigations = rows.map(mapQueuedRecoveryRow).filter(Boolean);

      return {
        status: "recoverable_queued_investigations_found",

        reason: null,

        investigations,

        count: investigations.length,
      };
    } catch (error) {
      return {
        status: "recoverable_queued_investigations_query_failed",

        reason: "d1_recoverable_queued_investigations_query_failed",

        investigations: [],

        count: 0,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * =================================================
   * markQueuedRecoveryDispatched
   * =================================================
   *
   * Called only AFTER Queue.send() succeeds.
   *
   * Keep:
   *
   * dispatch_state = DISPATCHED
   * dispatched_at  = original first dispatch
   *
   * Change:
   *
   * attempt_count += 1
   * updated_at = recoveredAt
   */

  async function markQueuedRecoveryDispatched(input = {}) {
    const { outboxId, recoveredAt } = input;

    if (!isValidOutboxId(outboxId)) {
      return {
        status: "queued_recovery_dispatch_not_recorded",

        reason: "valid_outbox_id_required",

        outboxId: null,
      };
    }

    if (!isValidTimestamp(recoveredAt)) {
      return {
        status: "queued_recovery_dispatch_not_recorded",

        reason: "valid_recovered_at_timestamp_required",

        outboxId,
      };
    }

    const normalizedRecoveredAt = recoveredAt.trim();

    try {
      const result = await db
        .prepare(
          `
            UPDATE investigation_dispatch_outbox

            SET
              attempt_count =
                attempt_count + 1,

              updated_at = ?,

              last_error = NULL

            WHERE
              outbox_id = ?

              AND event_type =
                'INVESTIGATION_REQUESTED'

              AND dispatch_state =
                'DISPATCHED'
          `,
        )
        .bind(normalizedRecoveredAt, outboxId)
        .run();

      const changes = getChangeCount(result);

      if (changes === 0) {
        return {
          status: "queued_recovery_dispatch_not_recorded",

          reason: "dispatched_outbox_not_found",

          outboxId,
        };
      }

      return {
        status: "queued_recovery_dispatch_recorded",

        reason: null,

        outboxId,

        dispatchState: "DISPATCHED",

        recoveryClockAt: normalizedRecoveredAt,
      };
    } catch (error) {
      return {
        status: "queued_recovery_dispatch_not_recorded",

        reason: "d1_queued_recovery_dispatch_update_failed",

        outboxId,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  return {
    getRecoverableQueuedInvestigations,
    markQueuedRecoveryDispatched,
  };
}
