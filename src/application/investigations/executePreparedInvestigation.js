/*
 * Execute Prepared Investigation
 *
 * Durable application orchestration for one
 * investigation that has already reached:
 *
 * PREPARING_REVIEW
 *
 *
 * Previous step:
 *
 * processQueuedInvestigation()
 *      ↓
 * investigation loaded from D1
 *      ↓
 * execution lease acquired
 *      ↓
 * lifecycle = PREPARING_REVIEW
 *
 *
 * This service:
 *
 * PREPARING_REVIEW
 *      ↓
 * create durable execution attempt = RUNNING
 *      ↓
 * execute Methodology through injected runner
 *      ↓
 * prepare persistence-safe analysis outcome
 *      ↓
 * record COMPLETE / PARTIAL / FAILED
 *      ↓
 * release execution lease
 *
 *
 * IMPORTANT:
 *
 * This file does NOT publish a public review.
 *
 * Publication remains a separate later stage.
 *
 *
 * It also does NOT import Scout's Methodology
 * implementation directly.
 *
 * The Methodology runner is injected so this
 * application layer remains separate from domain
 * and Cloudflare infrastructure concerns.
 */

import { validateInvestigationExecutionRepository } from "../ports/investigationExecutionRepository.js";

import { validateInvestigationExecutionLease } from "../ports/investigationExecutionLease.js";

/*
 * ------------------------------------------------
 * Execution IDs
 * ------------------------------------------------
 *
 * Opaque random IDs.
 */

function defaultCreateExecutionId() {
  return `exec_${crypto.randomUUID()}`;
}

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

/*
 * Convert Methodology execution status into the
 * durable execution-repository vocabulary.
 *
 * Existing Scout domain execution states use:
 *
 * complete
 * partial
 * failed
 *
 * Durable D1 execution states use:
 *
 * COMPLETE
 * PARTIAL
 * FAILED
 */
function normalizeExecutionStatus(value) {
  if (typeof value !== "string") {
    return null;
  }

  switch (value.trim().toLowerCase()) {
    case "complete":
      return "COMPLETE";

    case "partial":
      return "PARTIAL";

    case "failed":
      return "FAILED";

    default:
      return null;
  }
}

/*
 * ------------------------------------------------
 * executePreparedInvestigation
 * ------------------------------------------------
 *
 * Expected prepared result:
 *
 * {
 *   status:
 *     "queued_investigation_prepared",
 *
 *   investigationId:
 *     "inv_...",
 *
 *   investigation: {
 *     target: frozenTarget,
 *     ...
 *   },
 *
 *   execution: {
 *     leaseToken: "...",
 *     attempt: 1,
 *     acquiredAt: "...",
 *     expiresAt: "..."
 *   }
 * }
 *
 *
 * Dependencies:
 *
 * executionRepository
 *   durable execution-attempt repository
 *
 * executionLease
 *   current execution lease adapter
 *
 * runMethodology
 *   frozen-target Methodology runner
 *
 * preparePersistableOutcome
 *   converts Methodology output into a
 *   persistence-safe / redacted outcome
 *
 *
 * The separation between runMethodology and
 * preparePersistableOutcome is deliberate.
 *
 * Raw Methodology output must not automatically
 * become durable public or private state.
 */
export async function executePreparedInvestigation({
  prepared,

  executionRepository,

  executionLease,

  runMethodology,

  preparePersistableOutcome,

  createExecutionId = defaultCreateExecutionId,

  startedAt = new Date().toISOString(),

  now = () => new Date().toISOString(),
} = {}) {
  /*
   * =================================================
   * Validate execution repository
   * =================================================
   */

  const repositoryValidation =
    validateInvestigationExecutionRepository(executionRepository);

  if (repositoryValidation.status !== "execution_repository_ready") {
    return {
      status: "prepared_execution_not_ready",

      reason: "execution_repository_not_ready",

      details: repositoryValidation,
    };
  }

  /*
   * =================================================
   * Validate execution lease
   * =================================================
   */

  const leaseValidation = validateInvestigationExecutionLease(executionLease);

  if (leaseValidation.status !== "execution_lease_ready") {
    return {
      status: "prepared_execution_not_ready",

      reason: "execution_lease_not_ready",

      details: leaseValidation,
    };
  }

  /*
   * =================================================
   * Validate injected Methodology boundary
   * =================================================
   */

  if (typeof runMethodology !== "function") {
    return {
      status: "prepared_execution_not_ready",

      reason: "methodology_runner_required",
    };
  }

  /*
   * Persistence-safe output preparation is
   * mandatory.
   *
   * We deliberately do NOT default this to an
   * identity function.
   *
   * That prevents raw Methodology output from
   * being persisted accidentally.
   */
  if (typeof preparePersistableOutcome !== "function") {
    return {
      status: "prepared_execution_not_ready",

      reason: "persistable_outcome_preparer_required",
    };
  }

  /*
   * =================================================
   * Validate prepared investigation
   * =================================================
   */

  if (
    !prepared ||
    typeof prepared !== "object" ||
    prepared.status !== "queued_investigation_prepared"
  ) {
    return {
      status: "prepared_execution_rejected",

      reason: "prepared_investigation_required",
    };
  }

  const investigationId = prepared.investigationId;

  if (!isNonEmptyString(investigationId)) {
    return {
      status: "prepared_execution_rejected",

      reason: "investigation_id_required",
    };
  }

  const normalizedInvestigationId = investigationId.trim();

  const investigation = prepared.investigation;

  if (!investigation || typeof investigation !== "object") {
    return {
      status: "prepared_execution_rejected",

      reason: "investigation_record_required",

      investigationId: normalizedInvestigationId,
    };
  }

  /*
   * Only PREPARING_REVIEW may enter this service.
   */
  if (prepared.lifecycleState !== "PREPARING_REVIEW") {
    return {
      status: "prepared_execution_rejected",

      reason: "investigation_not_preparing_review",

      investigationId: normalizedInvestigationId,

      lifecycleState: prepared.lifecycleState ?? null,
    };
  }

  const leaseToken = prepared.execution?.leaseToken;

  const attempt = prepared.execution?.attempt;

  if (
    !isNonEmptyString(leaseToken) ||
    !Number.isInteger(attempt) ||
    attempt < 1
  ) {
    return {
      status: "prepared_execution_rejected",

      reason: "valid_execution_lease_required",

      investigationId: normalizedInvestigationId,
    };
  }

  const normalizedLeaseToken = leaseToken.trim();

  if (!isValidTimestamp(startedAt)) {
    return {
      status: "prepared_execution_not_ready",

      reason: "valid_execution_start_timestamp_required",

      investigationId: normalizedInvestigationId,
    };
  }

  /*
   * =================================================
   * Generate durable execution ID
   * =================================================
   */

  let executionId;

  try {
    executionId = createExecutionId();
  } catch (error) {
    return {
      status: "prepared_execution_not_ready",

      reason: "execution_id_generation_failed",

      investigationId: normalizedInvestigationId,

      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (!isNonEmptyString(executionId)) {
    return {
      status: "prepared_execution_not_ready",

      reason: "valid_execution_id_required",

      investigationId: normalizedInvestigationId,
    };
  }

  const normalizedExecutionId = executionId.trim();

  /*
   * =================================================
   * Create durable RUNNING execution
   * =================================================
   *
   * The D1 repository itself verifies that this
   * lease token + attempt still owns execution.
   */

  const createResult = await executionRepository.createExecution({
    executionId: normalizedExecutionId,

    investigationId: normalizedInvestigationId,

    leaseToken: normalizedLeaseToken,

    attempt,

    startedAt,
  });

  if (createResult.status !== "execution_created") {
    return {
      status: "prepared_execution_not_started",

      reason: "durable_execution_not_created",

      investigationId: normalizedInvestigationId,

      executionId: normalizedExecutionId,

      createResult,
    };
  }

  /*
   * =================================================
   * Heartbeat callback
   * =================================================
   *
   * The frozen-target Methodology adapter may call
   * this during longer execution.
   *
   * We preserve the original lease duration when
   * extending ownership.
   */

  const originalAcquiredAt = prepared.execution?.acquiredAt;

  const originalExpiresAt = prepared.execution?.expiresAt;

  let leaseDurationMs = 5 * 60 * 1000;

  if (
    isValidTimestamp(originalAcquiredAt) &&
    isValidTimestamp(originalExpiresAt)
  ) {
    const calculatedDuration =
      Date.parse(originalExpiresAt) - Date.parse(originalAcquiredAt);

    if (calculatedDuration > 0) {
      leaseDurationMs = calculatedDuration;
    }
  }

  async function heartbeat() {
    const heartbeatAt = now();

    if (!isValidTimestamp(heartbeatAt)) {
      return {
        status: "execution_lease_not_renewed",

        reason: "invalid_heartbeat_timestamp",
      };
    }

    const expiresAt = new Date(
      Date.parse(heartbeatAt) + leaseDurationMs,
    ).toISOString();

    return executionLease.heartbeatExecutionLease({
      investigationId: normalizedInvestigationId,

      leaseToken: normalizedLeaseToken,

      heartbeatAt,

      expiresAt,
    });
  }

  /*
   * =================================================
   * Run Methodology
   * =================================================
   *
   * The runner receives only durable/frozen
   * application context.
   *
   * It may use heartbeat() between expensive
   * Methodology stages.
   */

  let methodologyResult;

  let methodologyError = null;

  try {
    methodologyResult = await runMethodology({
      investigationId: normalizedInvestigationId,

      executionId: normalizedExecutionId,

      attempt,

      investigation,

      target: investigation.target,

      executionLease: {
        leaseToken: normalizedLeaseToken,

        attempt,
      },

      heartbeat,
    });
  } catch (error) {
    methodologyError = error;
  }

  /*
   * =================================================
   * Operational Methodology failure
   * =================================================
   *
   * A thrown operational error is NOT converted
   * into UNKNOWN.
   *
   * It becomes durable executionStatus FAILED.
   */

  if (methodologyError) {
    const completedAt = now();

    const outcomeResult = await executionRepository.recordExecutionOutcome({
      executionId: normalizedExecutionId,

      investigationId: normalizedInvestigationId,

      leaseToken: normalizedLeaseToken,

      executionStatus: "FAILED",

      completedAt,

      analysisOutcome: null,

      failureReason: "methodology_execution_failed",
    });

    const releaseResult = await executionLease.releaseExecutionLease({
      investigationId: normalizedInvestigationId,

      leaseToken: normalizedLeaseToken,

      releasedAt: completedAt,
    });

    return {
      status: "prepared_execution_failed",

      reason: "methodology_execution_failed",

      investigationId: normalizedInvestigationId,

      executionId: normalizedExecutionId,

      error:
        methodologyError instanceof Error
          ? methodologyError.message
          : String(methodologyError),

      outcomeResult,

      releaseResult,
    };
  }

  /*
   * =================================================
   * Interpret Methodology execution status
   * =================================================
   */

  const durableExecutionStatus = normalizeExecutionStatus(
    methodologyResult?.executionStatus,
  );

  if (!durableExecutionStatus) {
    const completedAt = now();

    const outcomeResult = await executionRepository.recordExecutionOutcome({
      executionId: normalizedExecutionId,

      investigationId: normalizedInvestigationId,

      leaseToken: normalizedLeaseToken,

      executionStatus: "FAILED",

      completedAt,

      analysisOutcome: null,

      failureReason: "methodology_execution_status_unrecognized",
    });

    const releaseResult = await executionLease.releaseExecutionLease({
      investigationId: normalizedInvestigationId,

      leaseToken: normalizedLeaseToken,

      releasedAt: completedAt,
    });

    return {
      status: "prepared_execution_failed",

      reason: "methodology_execution_status_unrecognized",

      investigationId: normalizedInvestigationId,

      executionId: normalizedExecutionId,

      methodologyResult,

      outcomeResult,

      releaseResult,
    };
  }

  /*
   * =================================================
   * Prepare persistence-safe Methodology outcome
   * =================================================
   *
   * Redaction / projection MUST occur before D1.
   */

  let persistableResult;

  try {
    persistableResult = await preparePersistableOutcome({
      methodologyResult,

      investigation,

      investigationId: normalizedInvestigationId,

      executionId: normalizedExecutionId,

      attempt,
    });
  } catch (error) {
    persistableResult = {
      status: "persistable_outcome_failed",

      reason: "persistable_outcome_preparation_threw",

      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (persistableResult?.status !== "persistable_outcome_ready") {
    const completedAt = now();

    const outcomeResult = await executionRepository.recordExecutionOutcome({
      executionId: normalizedExecutionId,

      investigationId: normalizedInvestigationId,

      leaseToken: normalizedLeaseToken,

      executionStatus: "FAILED",

      completedAt,

      analysisOutcome: null,

      failureReason: "analysis_outcome_preparation_failed",
    });

    const releaseResult = await executionLease.releaseExecutionLease({
      investigationId: normalizedInvestigationId,

      leaseToken: normalizedLeaseToken,

      releasedAt: completedAt,
    });

    return {
      status: "prepared_execution_failed",

      reason: "analysis_outcome_preparation_failed",

      investigationId: normalizedInvestigationId,

      executionId: normalizedExecutionId,

      persistableResult,

      outcomeResult,

      releaseResult,
    };
  }

  /*
   * =================================================
   * Record authoritative execution outcome
   * =================================================
   *
   * The D1 repository performs the final
   * current-lease-token check inside the UPDATE.
   */

  const completedAt = now();

  const outcomeResult = await executionRepository.recordExecutionOutcome({
    executionId: normalizedExecutionId,

    investigationId: normalizedInvestigationId,

    leaseToken: normalizedLeaseToken,

    executionStatus: durableExecutionStatus,

    completedAt,

    analysisOutcome: persistableResult.outcome,

    failureReason:
      durableExecutionStatus === "FAILED"
        ? (persistableResult.failureReason ?? "methodology_execution_failed")
        : null,
  });

  /*
   * Release ownership after the authoritative
   * execution write attempt.
   *
   * If ownership was already lost, the lease
   * adapter will safely reject the stale release.
   */

  const releaseResult = await executionLease.releaseExecutionLease({
    investigationId: normalizedInvestigationId,

    leaseToken: normalizedLeaseToken,

    releasedAt: completedAt,
  });

  /*
   * Outcome persistence failed.
   *
   * Do not pretend the Methodology result is
   * durable.
   */
  if (outcomeResult.status !== "execution_outcome_recorded") {
    return {
      status: "prepared_execution_state_failed",

      reason: "execution_outcome_not_recorded",

      investigationId: normalizedInvestigationId,

      executionId: normalizedExecutionId,

      executionStatus: durableExecutionStatus,

      outcomeResult,

      releaseResult,
    };
  }

  /*
   * =================================================
   * Success
   * =================================================
   */

  return {
    status: "prepared_execution_finished",

    reason: null,

    investigationId: normalizedInvestigationId,

    executionId: normalizedExecutionId,

    attempt,

    executionStatus: durableExecutionStatus,

    execution: outcomeResult.execution,

    releaseResult,

    /*
     * Still not a published review.
     */
    publicationState: "NOT_PUBLISHED",
  };
}
