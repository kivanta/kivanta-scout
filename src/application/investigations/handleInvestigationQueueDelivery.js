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
 * Flow:
 *
 * Queue message
 *      ↓
 * terminal-execution preflight
 *      │
 *      ├─ terminal execution already exists
 *      │      ↓
 *      │   reconcile parent lifecycle
 *      │      ↓
 *      │   ACK without rerunning Methodology
 *      │
 *      └─ no terminal execution
 *             ↓
 * processQueuedInvestigation()
 *             ↓
 * executePreparedScoutInvestigation()
 *             ↓
 * persist terminal execution
 *             ↓
 * reconcile parent lifecycle
 *             ↓
 * ACK
 *
 *
 * IMPORTANT TRUST RULE:
 *
 * A Queue delivery may ACK a terminal execution
 * only after:
 *
 * 1. the execution outcome is durable
 *
 * AND
 *
 * 2. the parent investigation lifecycle is
 *    durably reconciled.
 *
 *
 * If execution persistence succeeded but parent
 * lifecycle reconciliation did not, the Queue
 * delivery RETRIES.
 *
 * On that retry, terminal-execution preflight
 * discovers the existing durable outcome and
 * reconciles the parent WITHOUT creating another
 * Methodology execution attempt.
 */

import { processQueuedInvestigation } from "./processQueuedInvestigation.js";

import { executePreparedScoutInvestigation } from "./executePreparedScoutInvestigation.js";

/*
 * ------------------------------------------------
 * Constants
 * ------------------------------------------------
 */

const TERMINAL_EXECUTION_STATUSES = new Set(["COMPLETE", "PARTIAL", "FAILED"]);

const SUPPORTED_MESSAGE_VERSION = 1;

const SUPPORTED_MESSAGE_TYPE = "investigation_requested";

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

function isValidTimestamp(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

function getInvestigationId(message, result) {
  return (
    cleanString(result?.investigationId) ||
    cleanString(message?.investigationId)
  );
}

function isSupportedInvestigationMessage(message) {
  return (
    message &&
    typeof message === "object" &&
    message.version === SUPPORTED_MESSAGE_VERSION &&
    message.type === SUPPORTED_MESSAGE_TYPE &&
    cleanString(message.investigationId) !== null
  );
}

function normalizeTerminalExecutionStatus(value) {
  const normalized = cleanString(value)?.toUpperCase() ?? null;

  return TERMINAL_EXECUTION_STATUSES.has(normalized) ? normalized : null;
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
 * Terminal execution projection
 * ------------------------------------------------
 *
 * Convert execution-layer return values into the
 * small shape required to reconcile the parent
 * investigation.
 */

function getTerminalExecutionFromResult(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  let durableStatus = normalizeTerminalExecutionStatus(result.executionStatus);

  let execution = result.execution ?? null;

  /*
   * prepared_execution_failed carries its durable
   * execution inside outcomeResult.execution.
   */
  if (
    result.status === "prepared_execution_failed" &&
    result.outcomeResult?.status === "execution_outcome_recorded"
  ) {
    durableStatus = "FAILED";

    execution = result.outcomeResult.execution ?? execution;
  }

  if (!durableStatus) {
    return null;
  }

  return {
    executionId:
      cleanString(execution?.executionId) || cleanString(result.executionId),

    executionStatus: durableStatus,

    completedAt: cleanString(execution?.completedAt),

    failureReason:
      durableStatus === "FAILED"
        ? cleanString(execution?.failureReason) ||
          cleanString(result.reason) ||
          "execution_failed"
        : null,
  };
}

/*
 * ------------------------------------------------
 * Parent lifecycle reconciliation
 * ------------------------------------------------
 *
 * COMPLETE execution → COMPLETE investigation
 * PARTIAL execution  → PARTIAL investigation
 * FAILED execution   → FAILED investigation
 *
 *
 * This is intentionally separate from publication.
 *
 * Publication remains a later stage.
 */

async function reconcileTerminalInvestigation({
  investigationRepository,

  investigationId,

  terminalExecution,

  fallbackUpdatedAt,
}) {
  const terminalStatus = normalizeTerminalExecutionStatus(
    terminalExecution?.executionStatus,
  );

  if (!terminalStatus) {
    return {
      status: "terminal_reconciliation_not_ready",

      reason: "terminal_execution_status_required",
    };
  }

  if (
    !investigationRepository ||
    typeof investigationRepository.updateInvestigation !== "function"
  ) {
    return {
      status: "terminal_reconciliation_not_ready",

      reason: "investigation_repository_update_required",
    };
  }

  const executionCompletedAt = cleanString(terminalExecution?.completedAt);

  const updatedAt = isValidTimestamp(executionCompletedAt)
    ? executionCompletedAt
    : fallbackUpdatedAt;

  if (!isValidTimestamp(updatedAt)) {
    return {
      status: "terminal_reconciliation_not_ready",

      reason: "valid_terminal_reconciliation_timestamp_required",
    };
  }

  const failureReason =
    terminalStatus === "FAILED"
      ? cleanString(terminalExecution?.failureReason) || "execution_failed"
      : null;

  let updateResult;

  try {
    updateResult = await investigationRepository.updateInvestigation(
      investigationId,
      {
        lifecycleState: terminalStatus,

        updatedAt,

        failureReason,
      },
    );
  } catch {
    return {
      status: "terminal_reconciliation_failed",

      reason: "investigation_terminal_update_threw",
    };
  }

  if (updateResult?.status !== "investigation_updated") {
    return {
      status: "terminal_reconciliation_failed",

      reason: "investigation_terminal_state_not_recorded",

      updateResult,
    };
  }

  return {
    status: "terminal_reconciliation_complete",

    reason: null,

    investigation: updateResult.investigation ?? null,

    lifecycleState: terminalStatus,
  };
}

/*
 * ------------------------------------------------
 * Existing terminal execution preflight
 * ------------------------------------------------
 *
 * This closes the at-least-once retry gap:
 *
 * terminal execution persisted
 *        ↓
 * parent lifecycle write failed
 *        ↓
 * Queue delivery retries
 *        ↓
 * DO NOT run Methodology again
 *        ↓
 * reconcile existing terminal execution
 */

async function checkExistingTerminalExecution({
  message,

  investigationRepository,

  executionRepository,

  preparationNow,
}) {
  /*
   * Older test doubles and lower-level callers may
   * not expose the new investigation-scoped read.
   *
   * Production D1 does.
   *
   * When the capability is absent, return "not
   * enabled" and preserve the existing execution
   * flow.
   */
  if (
    !executionRepository ||
    typeof executionRepository.getLatestExecutionForInvestigation !== "function"
  ) {
    return {
      status: "terminal_preflight_not_enabled",

      reason: null,
    };
  }

  /*
   * Invalid Queue messages still belong to the
   * normal Queue-message validation path.
   *
   * Do not reconcile based on malformed messages.
   */
  if (!isSupportedInvestigationMessage(message)) {
    return {
      status: "terminal_preflight_not_applicable",

      reason: null,
    };
  }

  const investigationId = cleanString(message.investigationId);

  let latestExecutionResult;

  try {
    latestExecutionResult =
      await executionRepository.getLatestExecutionForInvestigation(
        investigationId,
      );
  } catch {
    return {
      status: "terminal_preflight_failed",

      reason: "latest_execution_query_threw",

      investigationId,
    };
  }

  if (latestExecutionResult?.status === "execution_query_failed") {
    return {
      status: "terminal_preflight_failed",

      reason: latestExecutionResult.reason || "latest_execution_query_failed",

      investigationId,
    };
  }

  if (latestExecutionResult?.status === "execution_not_found") {
    return {
      status: "terminal_preflight_clear",

      reason: null,

      investigationId,
    };
  }

  if (latestExecutionResult?.status !== "execution_found") {
    return {
      status: "terminal_preflight_failed",

      reason: "unrecognized_latest_execution_result",

      investigationId,
    };
  }

  const execution = latestExecutionResult.execution;

  const terminalStatus = normalizeTerminalExecutionStatus(
    execution?.executionStatus,
  );

  /*
   * RUNNING is historical/incomplete work.
   *
   * It does not block normal lease-based recovery.
   */
  if (!terminalStatus) {
    return {
      status: "terminal_preflight_clear",

      reason: null,

      investigationId,

      latestExecutionStatus: cleanString(execution?.executionStatus),
    };
  }

  /*
   * A durable terminal execution already exists.
   *
   * Reconcile the parent before any lease can be
   * acquired for a new attempt.
   */

  const reconciliation = await reconcileTerminalInvestigation({
    investigationRepository,

    investigationId,

    terminalExecution: execution,

    fallbackUpdatedAt: preparationNow,
  });

  if (reconciliation.status !== "terminal_reconciliation_complete") {
    return {
      status: "terminal_preflight_failed",

      reason: reconciliation.reason || "terminal_reconciliation_failed",

      investigationId,

      executionId: cleanString(execution?.executionId),

      durableExecutionStatus: terminalStatus,

      reconciliation,
    };
  }

  return {
    status: "terminal_preflight_reconciled",

    reason: null,

    investigationId,

    executionId: cleanString(execution?.executionId),

    durableExecutionStatus: terminalStatus,

    reconciliation,
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
   * A Methodology failure may ACK only when its
   * FAILED execution outcome is durable.
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
   * Authoritative execution state write failed
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
   * Terminal execution preflight
   * =================================================
   *
   * IMPORTANT:
   *
   * This runs BEFORE processQueuedInvestigation(),
   * therefore BEFORE acquiring another execution
   * lease.
   *
   * That is what prevents a retry from turning a
   * terminal attempt 1 into an unnecessary attempt 2.
   */

  const terminalPreflight = await checkExistingTerminalExecution({
    message,

    investigationRepository,

    executionRepository,

    preparationNow,
  });

  if (terminalPreflight.status === "terminal_preflight_failed") {
    return createRetryDecision({
      reason: terminalPreflight.reason,

      investigationId:
        terminalPreflight.investigationId ?? getInvestigationId(message, null),

      executionStatus: "terminal_execution_preflight",

      executionId: terminalPreflight.executionId ?? null,

      durableExecutionStatus: terminalPreflight.durableExecutionStatus ?? null,
    });
  }

  if (terminalPreflight.status === "terminal_preflight_reconciled") {
    return createAckDecision({
      reason: "terminal_execution_reconciled",

      investigationId: terminalPreflight.investigationId,

      preparationStatus: "terminal_execution_preflight",

      executionStatus: "terminal_execution_reconciliation",

      executionId: terminalPreflight.executionId,

      durableExecutionStatus: terminalPreflight.durableExecutionStatus,
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
   */

  let executionResult;

  try {
    executionResult = await scoutExecutor({
      prepared: preparationResult,

      executionRepository,

      executionLease,

      createExecutionId,

      startedAt,

      now: typeof now === "function" ? now : () => preparationNow,
    });
  } catch {
    return createRetryDecision({
      reason: "scout_execution_threw",

      investigationId,

      preparationStatus: preparationResult.status,
    });
  }

  /*
   * =================================================
   * Classify durable execution result
   * =================================================
   */

  const decision = classifyExecutionResult({
    result: executionResult,

    investigationId,
  });

  /*
   * =================================================
   * Reconcile terminal parent lifecycle
   * =================================================
   *
   * Enable this hardened reconciliation when the
   * execution repository supports the new
   * investigation-scoped latest-execution read.
   *
   * Production D1 supports it.
   *
   * This compatibility gate lets older isolated test
   * doubles continue exercising the legacy decision
   * classification without pretending they provide
   * durable terminal-history capability.
   */

  const terminalReconciliationEnabled =
    typeof executionRepository?.getLatestExecutionForInvestigation ===
    "function";

  if (
    terminalReconciliationEnabled &&
    decision.status === "queue_delivery_ack"
  ) {
    const terminalExecution = getTerminalExecutionFromResult(executionResult);

    if (terminalExecution) {
      const reconciliation = await reconcileTerminalInvestigation({
        investigationRepository,

        investigationId,

        terminalExecution,

        fallbackUpdatedAt: preparationNow,
      });

      /*
       * Execution is durable, but parent lifecycle
       * is not.
       *
       * RETRY rather than ACK.
       *
       * The retry will hit terminal preflight first
       * and will therefore NOT execute Methodology
       * again.
       */
      if (reconciliation.status !== "terminal_reconciliation_complete") {
        return createRetryDecision({
          reason:
            reconciliation.reason ||
            "investigation_terminal_state_not_recorded",

          investigationId,

          preparationStatus: preparationResult.status,

          executionStatus: decision.executionStatus,

          executionId: decision.executionId,

          durableExecutionStatus: decision.durableExecutionStatus,
        });
      }
    }
  }

  /*
   * =================================================
   * Final Queue decision
   * =================================================
   */

  return {
    ...decision,

    preparationStatus: preparationResult.status,
  };
}
