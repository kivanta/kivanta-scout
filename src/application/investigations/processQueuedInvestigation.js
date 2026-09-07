/*
 * Process Queued Investigation
 *
 * Application service for one delivered
 * Cloudflare Queue message.
 *
 * This file does NOT depend directly on
 * Cloudflare Queue or Cloudflare D1.
 *
 * It works through Scout's application ports:
 *
 * - investigationRepository
 * - investigationExecutionLease
 *
 *
 * Flow:
 *
 * Queue message
 *      ↓
 * validate durable investigation ID
 *      ↓
 * load authoritative investigation from D1
 *      ↓
 * acquire execution lease
 *      ↓
 * if BUSY
 *      → another worker already owns execution
 *
 * if ACQUIRED
 *      ↓
 * QUEUED → PREPARING_REVIEW
 *      ↓
 * return investigation + lease ownership
 *
 *
 * IMPORTANT:
 *
 * A successfully acquired lease is NOT released
 * by this function.
 *
 * The future Methodology execution step will
 * continue using this lease, heartbeat it while
 * working, and release it only when execution
 * finishes or deliberately stops.
 */

import { validateInvestigationRepository } from "../ports/investigationRepository.js";

import { validateInvestigationExecutionLease } from "../ports/investigationExecutionLease.js";

/*
 * Default execution lease duration.
 *
 * Five minutes is intentionally conservative for
 * the first implementation.
 *
 * The future execution worker can heartbeat and
 * extend the lease while Methodology is running.
 */
const DEFAULT_LEASE_DURATION_MS = 5 * 60 * 1000;

/*
 * Queue message contract currently produced by:
 *
 * cloudflareInvestigationQueue.js
 */
const SUPPORTED_MESSAGE_VERSION = 1;

const SUPPORTED_MESSAGE_TYPE = "investigation_requested";

/*
 * Generate an opaque execution-ownership token.
 *
 * crypto.randomUUID() works in both modern Node
 * and Cloudflare Workers.
 */
function defaultCreateLeaseToken() {
  return crypto.randomUUID();
}

/*
 * Validate a timestamp.
 */
function isValidTimestamp(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    !Number.isNaN(Date.parse(value))
  );
}

/*
 * ------------------------------------------------
 * processQueuedInvestigation
 * ------------------------------------------------
 *
 * Expected Queue message:
 *
 * {
 *   version: 1,
 *   type: "investigation_requested",
 *   investigationId: "inv_..."
 * }
 *
 *
 * Dependencies:
 *
 * {
 *   investigationRepository,
 *   executionLease
 * }
 *
 *
 * Optional test/runtime controls:
 *
 * {
 *   now,
 *   leaseDurationMs,
 *   createLeaseToken
 * }
 */
export async function processQueuedInvestigation({
  message,

  investigationRepository,

  executionLease,

  now = new Date().toISOString(),

  leaseDurationMs = DEFAULT_LEASE_DURATION_MS,

  createLeaseToken = defaultCreateLeaseToken,
} = {}) {
  /*
   * =================================================
   * Validate application dependencies
   * =================================================
   */

  const repositoryValidation = validateInvestigationRepository(
    investigationRepository,
  );

  if (repositoryValidation.status !== "repository_ready") {
    return {
      status: "queued_investigation_not_ready",

      reason: "investigation_repository_not_ready",

      details: repositoryValidation,
    };
  }

  const leaseValidation = validateInvestigationExecutionLease(executionLease);

  if (leaseValidation.status !== "execution_lease_ready") {
    return {
      status: "queued_investigation_not_ready",

      reason: "execution_lease_not_ready",

      details: leaseValidation,
    };
  }

  /*
   * =================================================
   * Validate Queue message
   * =================================================
   */

  if (!message || typeof message !== "object") {
    return {
      status: "queued_message_rejected",

      reason: "queue_message_required",
    };
  }

  if (message.version !== SUPPORTED_MESSAGE_VERSION) {
    return {
      status: "queued_message_rejected",

      reason: "unsupported_queue_message_version",

      messageVersion: message.version ?? null,
    };
  }

  if (message.type !== SUPPORTED_MESSAGE_TYPE) {
    return {
      status: "queued_message_rejected",

      reason: "unsupported_queue_message_type",

      messageType: message.type ?? null,
    };
  }

  if (
    typeof message.investigationId !== "string" ||
    message.investigationId.trim().length === 0
  ) {
    return {
      status: "queued_message_rejected",

      reason: "investigation_id_required",
    };
  }

  const investigationId = message.investigationId.trim();

  /*
   * Validate runtime timestamp.
   */
  if (!isValidTimestamp(now)) {
    return {
      status: "queued_investigation_not_ready",

      reason: "valid_now_timestamp_required",

      investigationId,
    };
  }

  /*
   * Keep lease duration bounded and positive.
   */
  if (!Number.isInteger(leaseDurationMs) || leaseDurationMs <= 0) {
    return {
      status: "queued_investigation_not_ready",

      reason: "valid_lease_duration_required",

      investigationId,
    };
  }

  /*
   * =================================================
   * Load authoritative investigation from D1
   * =================================================
   *
   * Queue messages deliberately contain only the
   * investigation ID.
   *
   * The frozen target itself is always reloaded
   * from authoritative D1 state.
   */

  const investigationResult =
    await investigationRepository.getInvestigation(investigationId);

  if (investigationResult.status === "investigation_not_found") {
    return {
      status: "queued_investigation_not_found",

      reason: "investigation_record_not_found",

      investigationId,
    };
  }

  if (investigationResult.status !== "investigation_found") {
    return {
      status: "queued_investigation_load_failed",

      reason: "investigation_repository_read_failed",

      investigationId,

      investigationResult,
    };
  }

  const investigation = investigationResult.investigation;

  /*
   * Only work states that can legitimately enter
   * or resume preparation are accepted here.
   *
   * PREPARING_REVIEW is allowed because:
   *
   * Worker A can die after moving the state to
   * PREPARING_REVIEW.
   *
   * After its lease expires, Worker B must be able
   * to acquire attempt 2 and resume safely.
   */
  const resumableStates = new Set(["QUEUED", "PREPARING_REVIEW"]);

  if (!resumableStates.has(investigation?.lifecycleState)) {
    return {
      status: "queued_investigation_not_processable",

      reason: "investigation_lifecycle_not_resumable",

      investigationId,

      lifecycleState: investigation?.lifecycleState ?? null,
    };
  }

  /*
   * =================================================
   * Acquire execution ownership
   * =================================================
   */

  let leaseToken;

  try {
    leaseToken = createLeaseToken();
  } catch (error) {
    return {
      status: "queued_investigation_not_ready",

      reason: "lease_token_generation_failed",

      investigationId,

      error: error instanceof Error ? error.message : String(error),
    };
  }

  if (typeof leaseToken !== "string" || leaseToken.trim().length === 0) {
    return {
      status: "queued_investigation_not_ready",

      reason: "valid_lease_token_required",

      investigationId,
    };
  }

  const normalizedLeaseToken = leaseToken.trim();

  const expiresAt = new Date(Date.parse(now) + leaseDurationMs).toISOString();

  const leaseResult = await executionLease.acquireExecutionLease({
    investigationId,

    leaseToken: normalizedLeaseToken,

    acquiredAt: now,

    expiresAt,
  });

  /*
   * Duplicate Queue delivery while another worker
   * owns an active lease.
   *
   * This is expected behavior, not an execution
   * failure.
   */
  if (leaseResult.status === "execution_lease_busy") {
    return {
      status: "queued_investigation_already_active",

      reason: "active_execution_lease_exists",

      investigationId,

      activeAttempt: leaseResult.attempt ?? null,

      activeLeaseExpiresAt: leaseResult.expiresAt ?? null,
    };
  }

  if (leaseResult.status !== "execution_lease_acquired") {
    return {
      status: "queued_investigation_lease_failed",

      reason: "execution_lease_acquisition_failed",

      investigationId,

      leaseResult,
    };
  }

  /*
   * =================================================
   * Transition QUEUED → PREPARING_REVIEW
   * =================================================
   *
   * Only do the write when the investigation is
   * still QUEUED.
   *
   * A recovered PREPARING_REVIEW investigation
   * already has the correct durable state.
   */

  let lifecycleResult = null;

  if (investigation.lifecycleState === "QUEUED") {
    lifecycleResult = await investigationRepository.updateInvestigation(
      investigationId,
      {
        lifecycleState: "PREPARING_REVIEW",

        updatedAt: now,

        failureReason: null,
      },
    );

    /*
     * We acquired a lease but failed to persist
     * PREPARING_REVIEW.
     *
     * Release our lease so we do not leave the
     * investigation unnecessarily blocked.
     */
    if (lifecycleResult.status !== "investigation_updated") {
      const releaseResult = await executionLease.releaseExecutionLease({
        investigationId,

        leaseToken: normalizedLeaseToken,

        releasedAt: now,
      });

      return {
        status: "queued_investigation_state_failed",

        reason: "preparing_review_state_not_recorded",

        investigationId,

        leaseResult,

        lifecycleResult,

        releaseResult,
      };
    }
  }

  /*
   * =================================================
   * Success
   * =================================================
   *
   * IMPORTANT:
   *
   * The lease remains ACTIVE.
   *
   * The future Methodology execution layer will
   * receive this ownership information and use it
   * for heartbeat + stale-worker protection.
   */

  return {
    status: "queued_investigation_prepared",

    reason: null,

    investigationId,

    lifecycleState: "PREPARING_REVIEW",

    resumed: investigation.lifecycleState === "PREPARING_REVIEW",

    investigation,

    execution: {
      leaseToken: normalizedLeaseToken,

      attempt: leaseResult.attempt,

      acquiredAt: leaseResult.acquiredAt,

      expiresAt: leaseResult.expiresAt,
    },

    lifecycleResult,
  };
}
