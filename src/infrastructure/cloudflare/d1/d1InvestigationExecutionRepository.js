/*
 * D1 Investigation Execution Repository
 *
 * Implements Scout's durable execution-attempt
 * repository using Cloudflare D1.
 *
 *
 * This repository stores one historical row for
 * every Methodology execution attempt.
 *
 *
 * Most important safety rule:
 *
 * A worker may create or complete an execution
 * ONLY while its lease token is still the current
 * authoritative execution lease in D1.
 *
 *
 * Example:
 *
 * Worker A
 * token = abc
 * attempt = 1
 *
 *        ↓ lease expires
 *
 * Worker B
 * token = xyz
 * attempt = 2
 *
 *        ↓
 *
 * Worker A wakes up and tries to save with abc
 *
 *        ↓
 *
 * D1 conditional write matches zero rows
 *
 *        ↓
 *
 * stale worker rejected
 */

/*
 * ------------------------------------------------
 * Constants
 * ------------------------------------------------
 */

const ALLOWED_OUTCOME_STATUSES = new Set(["COMPLETE", "PARTIAL", "FAILED"]);

/*
 * Keep persisted operational failure text bounded.
 */
const MAX_FAILURE_REASON_LENGTH = 1000;

/*
 * ------------------------------------------------
 * Helpers
 * ------------------------------------------------
 */

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidTimestamp(value) {
  return isNonEmptyString(value) && !Number.isNaN(Date.parse(value));
}

function isValidAttempt(value) {
  return Number.isInteger(value) && value >= 1;
}

function getChangeCount(result) {
  return result?.meta?.changes ?? result?.changes ?? 0;
}

/*
 * Convert one persisted D1 row into the
 * application-facing execution shape.
 */
function mapExecutionRow(row) {
  if (!row) {
    return null;
  }

  let analysisOutcome = null;

  if (
    typeof row.analysis_outcome_json === "string" &&
    row.analysis_outcome_json.length > 0
  ) {
    try {
      analysisOutcome = JSON.parse(row.analysis_outcome_json);
    } catch {
      /*
       * A malformed historical row should not make
       * the whole repository read throw.
       *
       * Surface the raw JSON instead.
       */
      analysisOutcome = {
        status: "analysis_outcome_parse_failed",

        raw: row.analysis_outcome_json,
      };
    }
  }

  return {
    executionId: row.execution_id,

    investigationId: row.investigation_id,

    leaseToken: row.lease_token,

    attempt: Number(row.attempt),

    executionStatus: row.execution_status,

    startedAt: row.started_at,

    completedAt: row.completed_at ?? null,

    analysisOutcome,

    failureReason: row.failure_reason ?? null,

    createdAt: row.created_at,

    updatedAt: row.updated_at,
  };
}

/*
 * Safely serialize Methodology output.
 */
function serializeAnalysisOutcome(value) {
  if (value === undefined || value === null) {
    return {
      ok: true,
      json: null,
    };
  }

  try {
    const json = JSON.stringify(value);

    if (typeof json !== "string") {
      return {
        ok: false,
        json: null,
      };
    }

    return {
      ok: true,
      json,
    };
  } catch {
    return {
      ok: false,
      json: null,
    };
  }
}

/*
 * ------------------------------------------------
 * Adapter factory
 * ------------------------------------------------
 */

export function createD1InvestigationExecutionRepository(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("A valid Cloudflare D1 binding is required.");
  }

  /*
   * ------------------------------------------------
   * getExecution
   * ------------------------------------------------
   */

  async function getExecution(executionId) {
    if (!isNonEmptyString(executionId)) {
      return {
        status: "execution_query_failed",

        reason: "execution_id_required",

        execution: null,
      };
    }

    const normalizedExecutionId = executionId.trim();

    try {
      const row = await db
        .prepare(
          `
          SELECT
            execution_id,
            investigation_id,
            lease_token,
            attempt,
            execution_status,
            started_at,
            completed_at,
            analysis_outcome_json,
            failure_reason,
            created_at,
            updated_at
          FROM investigation_executions
          WHERE execution_id = ?
        `,
        )
        .bind(normalizedExecutionId)
        .first();

      if (!row) {
        return {
          status: "execution_not_found",

          reason: null,

          execution: null,
        };
      }

      return {
        status: "execution_found",

        reason: null,

        execution: mapExecutionRow(row),
      };
    } catch (error) {
      return {
        status: "execution_query_failed",

        reason: "d1_execution_query_failed",

        execution: null,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * createExecution
   * ------------------------------------------------
   *
   * Creates one RUNNING execution attempt.
   *
   *
   * IMPORTANT:
   *
   * The INSERT itself checks the CURRENT lease.
   *
   * We do NOT:
   *
   * SELECT lease
   *      ↓
   * return to JavaScript
   *      ↓
   * INSERT execution
   *
   * because ownership could change in between.
   *
   *
   * Instead:
   *
   * INSERT ... SELECT ...
   * WHERE EXISTS(current matching lease)
   *
   * happens inside one SQLite statement.
   */

  async function createExecution(input = {}) {
    const { executionId, investigationId, leaseToken, attempt, startedAt } =
      input;

    if (!isNonEmptyString(executionId)) {
      return {
        status: "execution_not_created",

        reason: "execution_id_required",
      };
    }

    if (!isNonEmptyString(investigationId)) {
      return {
        status: "execution_not_created",

        reason: "investigation_id_required",
      };
    }

    if (!isNonEmptyString(leaseToken)) {
      return {
        status: "execution_not_created",

        reason: "lease_token_required",
      };
    }

    if (!isValidAttempt(attempt)) {
      return {
        status: "execution_not_created",

        reason: "valid_attempt_required",
      };
    }

    if (!isValidTimestamp(startedAt)) {
      return {
        status: "execution_not_created",

        reason: "valid_started_at_required",
      };
    }

    const normalizedExecutionId = executionId.trim();

    const normalizedInvestigationId = investigationId.trim();

    const normalizedLeaseToken = leaseToken.trim();

    try {
      const result = await db
        .prepare(
          `
          INSERT INTO investigation_executions (
            execution_id,
            investigation_id,
            lease_token,
            attempt,
            execution_status,
            started_at,
            completed_at,
            analysis_outcome_json,
            failure_reason,
            created_at,
            updated_at
          )

          SELECT
            ?,
            ?,
            ?,
            ?,
            'RUNNING',
            ?,
            NULL,
            NULL,
            NULL,
            ?,
            ?

          WHERE EXISTS (
            SELECT 1
            FROM investigation_execution_leases
            WHERE investigation_id = ?
              AND lease_token = ?
              AND attempt = ?
              AND released_at IS NULL
              AND expires_at > ?
          )
        `,
        )
        .bind(
          normalizedExecutionId,
          normalizedInvestigationId,
          normalizedLeaseToken,
          attempt,
          startedAt,
          startedAt,
          startedAt,

          normalizedInvestigationId,
          normalizedLeaseToken,
          attempt,
          startedAt,
        )
        .run();

      const changes = getChangeCount(result);

      /*
       * No inserted row means the worker does not
       * currently own a valid matching lease.
       */
      if (changes === 0) {
        return {
          status: "execution_not_created",

          reason: "stale_execution_lease",

          investigationId: normalizedInvestigationId,

          attempt,
        };
      }

      const executionResult = await getExecution(normalizedExecutionId);

      if (executionResult.status !== "execution_found") {
        return {
          status: "execution_not_created",

          reason: "created_execution_could_not_be_reloaded",

          investigationId: normalizedInvestigationId,

          executionId: normalizedExecutionId,
        };
      }

      return {
        status: "execution_created",

        reason: null,

        execution: executionResult.execution,
      };
    } catch (error) {
      /*
       * A UNIQUE constraint can legitimately reject:
       *
       * - duplicate execution ID
       * - duplicate investigation + attempt
       * - duplicate lease token
       *
       * Do not silently create another attempt.
       */

      return {
        status: "execution_not_created",

        reason: "execution_identity_conflict",

        investigationId: normalizedInvestigationId,

        executionId: normalizedExecutionId,

        attempt,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * recordExecutionOutcome
   * ------------------------------------------------
   *
   * Completes one RUNNING execution.
   *
   *
   * The authoritative UPDATE itself verifies:
   *
   * - execution identity
   * - investigation identity
   * - execution lease token
   * - execution is still RUNNING
   * - CURRENT lease token still matches
   * - CURRENT lease attempt still matches
   * - lease is not released
   * - lease has not expired
   *
   *
   * This is the stale-worker write barrier.
   */

  async function recordExecutionOutcome(input = {}) {
    const {
      executionId,
      investigationId,
      leaseToken,
      executionStatus,
      completedAt,
      analysisOutcome = null,
      failureReason = null,
    } = input;

    if (
      !isNonEmptyString(executionId) ||
      !isNonEmptyString(investigationId) ||
      !isNonEmptyString(leaseToken)
    ) {
      return {
        status: "execution_outcome_not_recorded",

        reason: "execution_investigation_and_lease_required",
      };
    }

    if (!ALLOWED_OUTCOME_STATUSES.has(executionStatus)) {
      return {
        status: "execution_outcome_not_recorded",

        reason: "invalid_execution_outcome_status",
      };
    }

    if (!isValidTimestamp(completedAt)) {
      return {
        status: "execution_outcome_not_recorded",

        reason: "valid_completed_at_required",
      };
    }

    const serializedOutcome = serializeAnalysisOutcome(analysisOutcome);

    if (!serializedOutcome.ok) {
      return {
        status: "execution_outcome_not_recorded",

        reason: "analysis_outcome_not_serializable",
      };
    }

    const normalizedExecutionId = executionId.trim();

    const normalizedInvestigationId = investigationId.trim();

    const normalizedLeaseToken = leaseToken.trim();

    const boundedFailureReason =
      failureReason === null || failureReason === undefined
        ? null
        : String(failureReason).slice(0, MAX_FAILURE_REASON_LENGTH);

    try {
      const result = await db
        .prepare(
          `
          UPDATE investigation_executions
          SET
            execution_status = ?,
            completed_at = ?,
            analysis_outcome_json = ?,
            failure_reason = ?,
            updated_at = ?

          WHERE execution_id = ?
            AND investigation_id = ?
            AND lease_token = ?
            AND execution_status = 'RUNNING'

            AND EXISTS (
              SELECT 1
              FROM investigation_execution_leases AS lease
              WHERE
                lease.investigation_id =
                  investigation_executions.investigation_id

                AND lease.lease_token =
                  investigation_executions.lease_token

                AND lease.attempt =
                  investigation_executions.attempt

                AND lease.released_at IS NULL

                AND lease.expires_at > ?
            )
        `,
        )
        .bind(
          executionStatus,
          completedAt,
          serializedOutcome.json,
          boundedFailureReason,
          completedAt,

          normalizedExecutionId,
          normalizedInvestigationId,
          normalizedLeaseToken,

          completedAt,
        )
        .run();

      const changes = getChangeCount(result);

      /*
       * This can mean:
       *
       * - stale lease
       * - wrong token
       * - already completed execution
       * - execution does not exist
       *
       * We deliberately fail closed.
       */
      if (changes === 0) {
        return {
          status: "execution_outcome_not_recorded",

          reason: "stale_execution_lease_or_execution_not_running",

          executionId: normalizedExecutionId,

          investigationId: normalizedInvestigationId,
        };
      }

      const executionResult = await getExecution(normalizedExecutionId);

      if (executionResult.status !== "execution_found") {
        return {
          status: "execution_outcome_not_recorded",

          reason: "completed_execution_could_not_be_reloaded",

          executionId: normalizedExecutionId,

          investigationId: normalizedInvestigationId,
        };
      }

      return {
        status: "execution_outcome_recorded",

        reason: null,

        execution: executionResult.execution,
      };
    } catch (error) {
      return {
        status: "execution_outcome_not_recorded",

        reason: "d1_execution_outcome_update_failed",

        executionId: normalizedExecutionId,

        investigationId: normalizedInvestigationId,

        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /*
   * ------------------------------------------------
   * Application-facing repository
   * ------------------------------------------------
   */

  return {
    createExecution,
    getExecution,
    recordExecutionOutcome,
  };
}
