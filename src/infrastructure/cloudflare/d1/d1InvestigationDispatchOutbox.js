/*
 * D1 Investigation Dispatch Outbox Adapter
 *
 * Implements Scout's application dispatch-outbox
 * port using Cloudflare D1.
 *
 * D1 remains authoritative.
 *
 * Flow:
 *
 * PENDING outbox row
 *       ↓
 * dispatcher
 *       ↓
 * Cloudflare Queue send succeeds
 *       ↓
 * D1 atomically:
 *   - marks outbox DISPATCHED
 *   - moves investigation to QUEUED
 *
 * If Queue sending fails:
 *   - outbox remains PENDING
 *   - attempt count increases
 *   - retry time moves forward
 *   - bounded error is stored
 */

/*
 * Keep persisted operational errors bounded.
 *
 * We do not want large upstream error objects
 * filling D1 rows.
 */
const MAX_ERROR_LENGTH = 500;

/*
 * Convert a D1 outbox row into the shape used
 * by the Scout application layer.
 */
function mapDispatchRow(row) {
  if (!row) {
    return null;
  }

  return {
    outboxId: row.outbox_id,
    investigationId: row.investigation_id,

    eventType: row.event_type,

    dispatchState: row.dispatch_state,

    attemptCount: row.attempt_count,

    availableAt: row.available_at,

    createdAt: row.created_at,

    updatedAt: row.updated_at,

    dispatchedAt: row.dispatched_at ?? null,

    lastError: row.last_error ?? null,
  };
}

/*
 * Cloudflare D1 returns mutation metadata under
 * result.meta.changes.
 *
 * This helper also makes our later local tests
 * easier to keep compatible.
 */
function getChangeCount(result) {
  return result?.meta?.changes ?? result?.changes ?? 0;
}

/*
 * Validate a timestamp supplied by the
 * application layer.
 */
function isValidTimestamp(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

/*
 * Validate an outbox ID.
 */
function isValidOutboxId(value) {
  return Number.isInteger(value) && value > 0;
}

/*
 * Create the D1 implementation of Scout's
 * investigation dispatch-outbox port.
 */
export function createD1InvestigationDispatchOutbox(db) {
  /*
   * We need prepare() for reads/updates and
   * batch() so a successful dispatch can update
   * both durable records atomically.
   */
  if (
    !db ||
    typeof db.prepare !== "function" ||
    typeof db.batch !== "function"
  ) {
    throw new Error("A valid Cloudflare D1 binding is required.");
  }

  /*
   * ------------------------------------------------
   * getPendingDispatches
   * ------------------------------------------------
   *
   * Finds PENDING outbox events whose retry time
   * has arrived.
   */
  async function getPendingDispatches(options = {}) {
    const { now, limit = 25 } = options;

    if (!isValidTimestamp(now)) {
      return {
        status: "pending_dispatches_query_failed",
        reason: "valid_now_timestamp_required",
        dispatches: [],
      };
    }

    /*
     * Keep each dispatch sweep bounded.
     */
    const normalizedLimit = Number.isInteger(limit)
      ? Math.min(Math.max(limit, 1), 100)
      : 25;

    try {
      const statement = db.prepare(`
          SELECT
            outbox_id,
            investigation_id,
            event_type,
            dispatch_state,
            attempt_count,
            available_at,
            created_at,
            updated_at,
            dispatched_at,
            last_error
          FROM investigation_dispatch_outbox
          WHERE dispatch_state = 'PENDING'
            AND available_at <= ?
          ORDER BY
            available_at ASC,
            outbox_id ASC
          LIMIT ?
        `);

      const result = await statement.bind(now, normalizedLimit).all();

      const rows = Array.isArray(result?.results)
        ? result.results
        : Array.isArray(result)
          ? result
          : [];

      const dispatches = rows.map(mapDispatchRow);

      return {
        status: "pending_dispatches_found",
        reason: null,
        dispatches,
        count: dispatches.length,
      };
    } catch (error) {
      return {
        status: "pending_dispatches_query_failed",
        reason: "d1_pending_dispatch_query_failed",
        dispatches: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * markDispatchSucceeded
   * ------------------------------------------------
   *
   * IMPORTANT:
   *
   * This is called only AFTER Queue.send(...)
   * succeeds.
   *
   * Both durable D1 changes happen in one batch:
   *
   * 1. outbox → DISPATCHED
   * 2. investigation → QUEUED
   *
   * We deliberately do not expose QUEUED before
   * the Queue send has succeeded.
   */
  async function markDispatchSucceeded(input = {}) {
    const { outboxId, dispatchedAt, updatedAt } = input;

    if (!isValidOutboxId(outboxId)) {
      return {
        status: "dispatch_success_not_recorded",
        reason: "valid_outbox_id_required",
        outboxId: null,
      };
    }

    if (!isValidTimestamp(dispatchedAt) || !isValidTimestamp(updatedAt)) {
      return {
        status: "dispatch_success_not_recorded",
        reason: "valid_timestamp_required",
        outboxId,
      };
    }

    try {
      /*
       * D1 batch() is transactional.
       *
       * If either statement fails, the batch
       * is rolled back.
       */
      const results = await db.batch([
        /*
         * Mark the durable outbox event as sent.
         */
        db
          .prepare(
            `
            UPDATE investigation_dispatch_outbox
            SET
              dispatch_state = 'DISPATCHED',
              attempt_count =
                attempt_count + 1,
              dispatched_at = ?,
              last_error = NULL,
              updated_at = ?
            WHERE outbox_id = ?
              AND dispatch_state = 'PENDING'
          `,
          )
          .bind(dispatchedAt, updatedAt, outboxId),

        /*
         * Only after Queue success do we expose
         * the investigation as QUEUED.
         *
         * The investigation ID is resolved from
         * the authoritative outbox row itself.
         */
        db
          .prepare(
            `
            UPDATE investigations
            SET
              lifecycle_state = 'QUEUED',
              updated_at = ?
            WHERE investigation_id = (
              SELECT investigation_id
              FROM investigation_dispatch_outbox
              WHERE outbox_id = ?
            )
              AND lifecycle_state = 'CREATED'
          `,
          )
          .bind(updatedAt, outboxId),
      ]);

      const outboxChanges = getChangeCount(results?.[0]);

      const investigationChanges = getChangeCount(results?.[1]);

      /*
       * A zero-change outbox update means this
       * call did not transition a PENDING event.
       *
       * That can happen if the row does not exist
       * or was already processed.
       */
      if (outboxChanges === 0) {
        return {
          status: "dispatch_success_not_recorded",
          reason: "pending_dispatch_not_found",
          outboxId,
          outboxChanges,
          investigationChanges,
        };
      }

      return {
        status: "dispatch_succeeded",
        reason: null,
        outboxId,
        dispatchState: "DISPATCHED",
        lifecycleState: "QUEUED",
        outboxChanges,
        investigationChanges,
      };
    } catch (error) {
      return {
        status: "dispatch_success_not_recorded",
        reason: "d1_dispatch_success_update_failed",
        outboxId,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * markDispatchFailed
   * ------------------------------------------------
   *
   * Queue sending failed.
   *
   * The row remains PENDING so the dispatcher or
   * scheduled recovery can retry it later.
   */
  async function markDispatchFailed(input = {}) {
    const { outboxId, error, availableAt, updatedAt } = input;

    if (!isValidOutboxId(outboxId)) {
      return {
        status: "dispatch_failure_not_recorded",
        reason: "valid_outbox_id_required",
        outboxId: null,
      };
    }

    if (!isValidTimestamp(availableAt) || !isValidTimestamp(updatedAt)) {
      return {
        status: "dispatch_failure_not_recorded",
        reason: "valid_timestamp_required",
        outboxId,
      };
    }

    /*
     * Store only a small, plain-text operational
     * error.
     */
    const boundedError = String(error ?? "queue send failed").slice(
      0,
      MAX_ERROR_LENGTH,
    );

    try {
      const result = await db
        .prepare(
          `
          UPDATE investigation_dispatch_outbox
          SET
            dispatch_state = 'PENDING',
            attempt_count =
              attempt_count + 1,
            available_at = ?,
            updated_at = ?,
            last_error = ?,
            dispatched_at = NULL
          WHERE outbox_id = ?
            AND dispatch_state = 'PENDING'
        `,
        )
        .bind(availableAt, updatedAt, boundedError, outboxId)
        .run();

      const changes = getChangeCount(result);

      if (changes === 0) {
        return {
          status: "dispatch_failure_not_recorded",
          reason: "pending_dispatch_not_found",
          outboxId,
        };
      }

      return {
        status: "dispatch_retry_scheduled",
        reason: null,
        outboxId,
        dispatchState: "PENDING",
        availableAt,
      };
    } catch (databaseError) {
      return {
        status: "dispatch_failure_not_recorded",
        reason: "d1_dispatch_failure_update_failed",
        outboxId,
        error:
          databaseError instanceof Error
            ? databaseError.message
            : String(databaseError),
      };
    }
  }

  /*
   * Return the application-facing adapter.
   */
  return {
    getPendingDispatches,
    markDispatchSucceeded,
    markDispatchFailed,
  };
}
