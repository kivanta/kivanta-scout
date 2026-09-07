/*
 * Handle Investigation Queue Delivery
 *
 * Application boundary for one delivered
 * investigation Queue message.
 *
 *
 * This service does NOT call Cloudflare:
 *
 *   message.ack()
 *   message.retry()
 *
 * Instead it returns a neutral decision:
 *
 *   queue_delivery_ack
 *
 * or:
 *
 *   queue_delivery_retry
 *
 *
 * The future Cloudflare Queue adapter will translate
 * that decision into the actual Queue API call.
 *
 *
 * Flow:
 *
 * Queue message
 *      ↓
 * processQueuedInvestigation()
 *      ↓
 * ACK permanent / duplicate conditions
 * RETRY transient state failures
 * CONTINUE when PREPARING_REVIEW + lease acquired
 *      ↓
 * executePreparedScoutInvestigation()
 *      ↓
 * ACK only when the durable execution outcome exists
 * RETRY when authoritative execution state was not
 * durably recorded
 *
 *
 * IMPORTANT TRUST RULE:
 *
 * A Methodology failure may be ACKed only when its
 * FAILED execution outcome was successfully persisted.
 *
 * A failure that was NOT durably recorded must RETRY.
 */

import { processQueuedInvestigation } from "./processQueuedInvestigation.js";

import { executePreparedScoutInvestigation } from "./executePreparedScoutInvestigation.js";

/*
 * ------------------------------------------------
 * Queue-processing classifications
 * ------------------------------------------------
 */

/*
 * These conditions are permanent or expected
 * duplicate-delivery states.
 *
 * Retrying the same Queue message does not improve
 * them.
 */
const PREPARATION_ACK_STATUSES = new Set([
  "queued_message_rejected",

  "queued_investigation_not_found",

  "queued_investigation_not_processable",

  "queued_investigation_already_active",
]);

/*
 * These conditions may succeed on a later Queue
 * delivery and therefore must be retried.
 */
const PREPARATION_RETRY_STATUSES = new Set([
  "queued_investigation_not_ready",

  "queued_investigation_load_failed",

  "queued_investigation_lease_failed",

  "queued_investigation_state_failed",
]);

/*
 * ------------------------------------------------
 * Helpers
 * ------------------------------------------------
 */

function cleanString(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized.length > 0 ? normalized : null;
}

function getInvestigationId(message, result) {
  return (
    cleanString(result?.investigationId) ||
    cleanString(message?.investigationId)
  );
}

/*
 * ------------------------------------------------
 * Neutral Queue decisions
 * ------------------------------------------------
 */

function createAckDecision({
  reason,

  investigationId = null,

  preparationStatus = null,

  executionStatus = null,

  executionId = null,

  durableExecutionStatus = null,
} = {}) {
  return {
    status: "queue_delivery_ack",

    decision: "ACK",

    reason,

    investigationId,

    preparationStatus,

    executionStatus,

    executionId,

    durableExecutionStatus,
  };
}

function createRetryDecision({
  reason,

  investigationId = null,

  preparationStatus = null,

  executionStatus = null,

  executionId = null,

  durableExecutionStatus = null,
} = {}) {
  return {
    status: "queue_delivery_retry",

    decision: "RETRY",

    reason,

    investigationId,

    preparationStatus,

    executionStatus,

    executionId,

    durableExecutionStatus,
  };
}

/*
 * ------------------------------------------------
 * Execution result classification
 * ------------------------------------------------
 */

function classifyExecutionResult({
  result,

  investigationId,
}) {
  if (!result || typeof result !== "object") {
    return createRetryDecision({
      reason: "scout_execution_result_required",

      investigationId,
    });
  }

  /*
   * =================================================
   * Successful durable execution
   * =================================================
   */

  if (result.status === "prepared_execution_finished") {
    return createAckDecision({
      reason: "investigation_execution_finished",

      investigationId,

      executionStatus: result.status,

      executionId: cleanString(result.executionId),

      durableExecutionStatus: cleanString(result.executionStatus),
    });
  }

  /*
   * =================================================
   * Methodology / preparation failure
   * =================================================
   *
   * executePreparedInvestigation() may return:
   *
   *   prepared_execution_failed
   *
   * for a legitimate operational failure.
   *
   * But ACK is safe ONLY if its FAILED outcome was
   * successfully recorded in the authoritative
   * execution repository.
   *
   * This distinction prevents losing work when:
   *
   *   Methodology fails
   *       ↓
   *   D1 outcome write also fails
   *
   * In that situation, retry is required.
   */

  if (result.status === "prepared_execution_failed") {
    const outcomeWasRecorded =
      result.outcomeResult?.status === "execution_outcome_recorded";

    if (outcomeWasRecorded) {
      return createAckDecision({
        reason: "investigation_failure_recorded",

        investigationId,

        executionStatus: result.status,

        executionId: cleanString(result.executionId),

        durableExecutionStatus: "FAILED",
      });
    }

    return createRetryDecision({
      reason: "investigation_failure_not_durably_recorded",

      investigationId,

      executionStatus: result.status,

      executionId: cleanString(result.executionId),

      durableExecutionStatus: "FAILED",
    });
  }

  /*
   * =================================================
   * Authoritative state write failed
   * =================================================
   */

  if (result.status === "prepared_execution_state_failed") {
    return createRetryDecision({
      reason: "execution_outcome_not_recorded",

      investigationId,

      executionStatus: result.status,

      executionId: cleanString(result.executionId),

      durableExecutionStatus: cleanString(result.executionStatus),
    });
  }

  /*
   * =================================================
   * Execution never safely started
   * =================================================
   */

  if (
    result.status === "prepared_execution_not_started" ||
    result.status === "prepared_execution_not_ready" ||
    result.status === "prepared_execution_rejected" ||
    result.status === "scout_execution_not_ready"
  ) {
    return createRetryDecision({
      reason: result.reason || "scout_execution_not_ready",

      investigationId,

      executionStatus: result.status,

      executionId: cleanString(result.executionId),

      durableExecutionStatus: cleanString(result.executionStatus),
    });
  }

  /*
   * =================================================
   * Unknown execution state
   * =================================================
   *
   * Fail safe.
   *
   * We retry rather than silently ACK an execution
   * state this Queue boundary does not understand.
   */

  return createRetryDecision({
    reason: "unrecognized_scout_execution_result",

    investigationId,

    executionStatus: cleanString(result.status),

    executionId: cleanString(result.executionId),

    durableExecutionStatus: cleanString(result.executionStatus),
  });
}

/*
 * ------------------------------------------------
 * handleInvestigationQueueDelivery
 * ------------------------------------------------
 *
 * Runtime dependencies:
 *
 * message
 * investigationRepository
 * executionLease
 * executionRepository
 *
 *
 * Optional deterministic controls:
 *
 * now
 * leaseDurationMs
 * createLeaseToken
 * createExecutionId
 * startedAt
 *
 *
 * Dependency seams in second argument are for tests.
 */

export async function handleInvestigationQueueDelivery(
  {
    message,

    investigationRepository,

    executionLease,

    executionRepository,

    now = () => new Date().toISOString(),

    leaseDurationMs,

    createLeaseToken,

    createExecutionId,

    startedAt,
  } = {},

  {
    queueProcessor = processQueuedInvestigation,

    scoutExecutor = executePreparedScoutInvestigation,
  } = {},
) {
  /*
   * =================================================
   * Validate composition services
   * =================================================
   */

  if (typeof queueProcessor !== "function") {
    return createRetryDecision({
      reason: "queue_processor_required",

      investigationId: getInvestigationId(message, null),
    });
  }

  if (typeof scoutExecutor !== "function") {
    return createRetryDecision({
      reason: "scout_executor_required",

      investigationId: getInvestigationId(message, null),
    });
  }

  /*
   * =================================================
   * Resolve preparation timestamp
   * =================================================
   *
   * processQueuedInvestigation() expects a concrete
   * timestamp string.
   *
   * The execution layer expects now() as a function.
   */

  let preparationNow;

  try {
    preparationNow = typeof now === "function" ? now() : now;
  } catch {
    return createRetryDecision({
      reason: "queue_runtime_clock_failed",

      investigationId: getInvestigationId(message, null),
    });
  }

  /*
   * =================================================
   * Process delivered Queue message
   * =================================================
   */

  let preparationResult;

  try {
    preparationResult = await queueProcessor({
      message,

      investigationRepository,

      executionLease,

      now: preparationNow,

      leaseDurationMs,

      createLeaseToken,
    });
  } catch {
    /*
     * Do not expose arbitrary exception text through
     * the Queue decision boundary.
     */

    return createRetryDecision({
      reason: "queued_investigation_processing_threw",

      investigationId: getInvestigationId(message, null),
    });
  }

  const investigationId = getInvestigationId(message, preparationResult);

  /*
   * =================================================
   * Permanent / duplicate Queue states
   * =================================================
   */

  if (PREPARATION_ACK_STATUSES.has(preparationResult?.status)) {
    return createAckDecision({
      reason:
        preparationResult.reason ||
        "queue_delivery_no_longer_requires_processing",

      investigationId,

      preparationStatus: preparationResult.status,
    });
  }

  /*
   * =================================================
   * Retryable preparation states
   * =================================================
   */

  if (PREPARATION_RETRY_STATUSES.has(preparationResult?.status)) {
    return createRetryDecision({
      reason:
        preparationResult.reason || "queued_investigation_preparation_failed",

      investigationId,

      preparationStatus: preparationResult.status,
    });
  }

  /*
   * =================================================
   * Unknown preparation result
   * =================================================
   */

  if (preparationResult?.status !== "queued_investigation_prepared") {
    return createRetryDecision({
      reason: "unrecognized_queue_processing_result",

      investigationId,

      preparationStatus: cleanString(preparationResult?.status),
    });
  }

  /*
   * =================================================
   * Execute prepared Scout investigation
   * =================================================
   *
   * The execution lease acquired by
   * processQueuedInvestigation() remains active and
   * is carried into this call.
   */

  let executionResult;

  try {
    executionResult = await scoutExecutor({
      prepared: preparationResult,

      executionRepository,

      executionLease,

      createExecutionId,

      startedAt,

      /*
       * Reuse the runtime clock function when one
       * was supplied.
       *
       * If the caller supplied a concrete timestamp
       * instead, provide a function returning that
       * timestamp so the lower layer retains its
       * expected function contract.
       */
      now: typeof now === "function" ? now : () => preparationNow,
    });
  } catch {
    /*
     * No durable outcome is known to exist.
     *
     * Retry the delivery.
     */

    return createRetryDecision({
      reason: "scout_execution_threw",

      investigationId,

      preparationStatus: preparationResult.status,
    });
  }

  /*
   * =================================================
   * Translate Scout execution into Queue decision
   * =================================================
   */

  const decision = classifyExecutionResult({
    result: executionResult,

    investigationId,
  });

  return {
    ...decision,

    preparationStatus: preparationResult.status,
  };
}
