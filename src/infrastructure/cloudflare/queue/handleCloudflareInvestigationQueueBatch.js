/*
 * Handle Cloudflare Investigation Queue Batch
 *
 * Cloudflare infrastructure adapter for:
 *
 *   MessageBatch
 *
 * This is the thin runtime boundary between
 * Cloudflare Queues and Scout's application layer.
 *
 *
 * Flow:
 *
 * Cloudflare MessageBatch
 *        ↓
 * each Cloudflare message
 *        ↓
 * message.body
 *        ↓
 * handleInvestigationQueueDelivery()
 *        ↓
 * queue_delivery_ack
 *        → message.ack()
 *
 * queue_delivery_retry
 *        → message.retry()
 *
 *
 * IMPORTANT:
 *
 * This file does NOT contain:
 *
 * - Methodology logic
 * - D1 SQL
 * - source verification
 * - persistence projection
 * - ACK / RETRY business policy
 *
 * Those decisions already belong to:
 *
 *   handleInvestigationQueueDelivery()
 *
 *
 * This adapter only translates the neutral
 * application decision into Cloudflare Queue APIs.
 */

import { handleInvestigationQueueDelivery } from "../../../application/investigations/handleInvestigationQueueDelivery.js";

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

/*
 * Cloudflare Queue messages normally contain an
 * opaque message id.
 *
 * We use it only for bounded adapter observability.
 *
 * We never include the full Queue body in the
 * returned summary.
 */

function getCloudflareMessageId(message) {
  return cleanString(message?.id) || null;
}

/*
 * ------------------------------------------------
 * Cloudflare Queue action helpers
 * ------------------------------------------------
 */

function acknowledgeMessage(message) {
  if (!message || typeof message.ack !== "function") {
    return {
      status: "cloudflare_message_not_acknowledged",

      reason: "cloudflare_message_ack_required",
    };
  }

  try {
    message.ack();

    return {
      status: "cloudflare_message_acknowledged",

      reason: null,
    };
  } catch {
    /*
     * Do not expose arbitrary runtime exception text.
     */

    return {
      status: "cloudflare_message_not_acknowledged",

      reason: "cloudflare_message_ack_failed",
    };
  }
}

function retryMessage(message) {
  if (!message || typeof message.retry !== "function") {
    return {
      status: "cloudflare_message_not_retried",

      reason: "cloudflare_message_retry_required",
    };
  }

  try {
    message.retry();

    return {
      status: "cloudflare_message_retried",

      reason: null,
    };
  } catch {
    /*
     * Do not expose arbitrary runtime exception text.
     */

    return {
      status: "cloudflare_message_not_retried",

      reason: "cloudflare_message_retry_failed",
    };
  }
}

/*
 * ------------------------------------------------
 * Process one Cloudflare Queue message
 * ------------------------------------------------
 */

async function handleOneCloudflareMessage({
  cloudflareMessage,

  investigationRepository,

  executionLease,

  executionRepository,

  now,

  leaseDurationMs,

  createLeaseToken,

  createExecutionId,

  startedAt,

  deliveryHandler,
}) {
  const cloudflareMessageId = getCloudflareMessageId(cloudflareMessage);

  /*
   * =================================================
   * Validate Cloudflare message envelope
   * =================================================
   */

  if (!cloudflareMessage || typeof cloudflareMessage !== "object") {
    return {
      status: "cloudflare_queue_message_failed",

      reason: "cloudflare_queue_message_required",

      cloudflareMessageId,

      decision: null,
    };
  }

  /*
   * The body is intentionally passed to the
   * application layer.
   *
   * Queue transport metadata remains here.
   */

  const applicationMessage = cloudflareMessage.body;

  /*
   * =================================================
   * Ask application layer for ACK / RETRY decision
   * =================================================
   */

  let deliveryDecision;

  try {
    deliveryDecision = await deliveryHandler({
      message: applicationMessage,

      investigationRepository,

      executionLease,

      executionRepository,

      now,

      leaseDurationMs,

      createLeaseToken,

      createExecutionId,

      startedAt,
    });
  } catch {
    /*
     * Infrastructure fail-safe:
     *
     * if the application boundary unexpectedly throws,
     * do not ACK and lose the work.
     *
     * Ask Cloudflare to redeliver it.
     */

    const retryResult = retryMessage(cloudflareMessage);

    return {
      status:
        retryResult.status === "cloudflare_message_retried"
          ? "cloudflare_queue_message_retried"
          : "cloudflare_queue_message_failed",

      reason:
        retryResult.status === "cloudflare_message_retried"
          ? "queue_delivery_handler_threw"
          : retryResult.reason,

      cloudflareMessageId,

      decision: "RETRY",

      investigationId: cleanString(applicationMessage?.investigationId),

      applicationStatus: null,

      queueAction: retryResult,
    };
  }

  const investigationId =
    cleanString(deliveryDecision?.investigationId) ||
    cleanString(applicationMessage?.investigationId);

  /*
   * =================================================
   * Application says ACK
   * =================================================
   */

  if (
    deliveryDecision?.status === "queue_delivery_ack" &&
    deliveryDecision?.decision === "ACK"
  ) {
    const ackResult = acknowledgeMessage(cloudflareMessage);

    if (ackResult.status !== "cloudflare_message_acknowledged") {
      return {
        status: "cloudflare_queue_message_failed",

        reason: ackResult.reason,

        cloudflareMessageId,

        decision: "ACK",

        investigationId,

        applicationStatus: deliveryDecision.status,

        applicationReason: cleanString(deliveryDecision.reason),

        queueAction: ackResult,
      };
    }

    return {
      status: "cloudflare_queue_message_acknowledged",

      reason: cleanString(deliveryDecision.reason),

      cloudflareMessageId,

      decision: "ACK",

      investigationId,

      applicationStatus: deliveryDecision.status,

      preparationStatus: cleanString(deliveryDecision.preparationStatus),

      executionStatus: cleanString(deliveryDecision.executionStatus),

      executionId: cleanString(deliveryDecision.executionId),

      durableExecutionStatus: cleanString(
        deliveryDecision.durableExecutionStatus,
      ),

      queueAction: ackResult,
    };
  }

  /*
   * =================================================
   * Application says RETRY
   * =================================================
   */

  if (
    deliveryDecision?.status === "queue_delivery_retry" &&
    deliveryDecision?.decision === "RETRY"
  ) {
    const retryResult = retryMessage(cloudflareMessage);

    if (retryResult.status !== "cloudflare_message_retried") {
      return {
        status: "cloudflare_queue_message_failed",

        reason: retryResult.reason,

        cloudflareMessageId,

        decision: "RETRY",

        investigationId,

        applicationStatus: deliveryDecision.status,

        applicationReason: cleanString(deliveryDecision.reason),

        queueAction: retryResult,
      };
    }

    return {
      status: "cloudflare_queue_message_retried",

      reason: cleanString(deliveryDecision.reason),

      cloudflareMessageId,

      decision: "RETRY",

      investigationId,

      applicationStatus: deliveryDecision.status,

      preparationStatus: cleanString(deliveryDecision.preparationStatus),

      executionStatus: cleanString(deliveryDecision.executionStatus),

      executionId: cleanString(deliveryDecision.executionId),

      durableExecutionStatus: cleanString(
        deliveryDecision.durableExecutionStatus,
      ),

      queueAction: retryResult,
    };
  }

  /*
   * =================================================
   * Unknown application decision
   * =================================================
   *
   * Fail safe.
   *
   * Scout must never ACK a Queue delivery when the
   * application layer returned something this adapter
   * does not understand.
   */

  const retryResult = retryMessage(cloudflareMessage);

  return {
    status:
      retryResult.status === "cloudflare_message_retried"
        ? "cloudflare_queue_message_retried"
        : "cloudflare_queue_message_failed",

    reason:
      retryResult.status === "cloudflare_message_retried"
        ? "unrecognized_queue_delivery_decision"
        : retryResult.reason,

    cloudflareMessageId,

    decision: "RETRY",

    investigationId,

    applicationStatus: cleanString(deliveryDecision?.status),

    applicationReason: cleanString(deliveryDecision?.reason),

    queueAction: retryResult,
  };
}

/*
 * ------------------------------------------------
 * Main batch handler
 * ------------------------------------------------
 *
 * Runtime inputs:
 *
 * batch
 *   Cloudflare MessageBatch
 *
 * investigationRepository
 * executionLease
 * executionRepository
 *
 *
 * Optional deterministic/runtime controls:
 *
 * now
 * leaseDurationMs
 * createLeaseToken
 * createExecutionId
 * startedAt
 *
 *
 * Dependency seam:
 *
 * deliveryHandler
 *   defaults to:
 *
 *   handleInvestigationQueueDelivery()
 */

export async function handleCloudflareInvestigationQueueBatch(
  {
    batch,

    investigationRepository,

    executionLease,

    executionRepository,

    now = () => new Date().toISOString(),

    leaseDurationMs,

    createLeaseToken,

    createExecutionId,

    startedAt,
  } = {},

  { deliveryHandler = handleInvestigationQueueDelivery } = {},
) {
  /*
   * =================================================
   * Validate application adapter
   * =================================================
   */

  if (typeof deliveryHandler !== "function") {
    return {
      status: "cloudflare_queue_batch_not_ready",

      reason: "queue_delivery_handler_required",

      messageCount: 0,

      acknowledgedCount: 0,

      retriedCount: 0,

      failedCount: 0,

      results: [],
    };
  }

  /*
   * =================================================
   * Validate Cloudflare batch
   * =================================================
   */

  if (!batch || typeof batch !== "object" || !Array.isArray(batch.messages)) {
    return {
      status: "cloudflare_queue_batch_rejected",

      reason: "cloudflare_message_batch_required",

      messageCount: 0,

      acknowledgedCount: 0,

      retriedCount: 0,

      failedCount: 0,

      results: [],
    };
  }

  /*
   * Empty batch is harmless.
   */

  if (batch.messages.length === 0) {
    return {
      status: "cloudflare_queue_batch_handled",

      reason: null,

      messageCount: 0,

      acknowledgedCount: 0,

      retriedCount: 0,

      failedCount: 0,

      results: [],
    };
  }

  /*
   * =================================================
   * Process sequentially
   * =================================================
   *
   * We deliberately do NOT use Promise.all().
   *
   * One Scout investigation can perform multiple
   * upstream reads and durable writes.
   *
   * Sequential processing is the conservative V1
   * runtime policy while we validate real Queue and
   * Worker behavior.
   */

  const results = [];

  for (const cloudflareMessage of batch.messages) {
    const result = await handleOneCloudflareMessage({
      cloudflareMessage,

      investigationRepository,

      executionLease,

      executionRepository,

      now,

      leaseDurationMs,

      createLeaseToken,

      createExecutionId,

      startedAt,

      deliveryHandler,
    });

    results.push(result);
  }

  /*
   * =================================================
   * Bounded batch summary
   * =================================================
   */

  const acknowledgedCount = results.filter(
    (result) => result.status === "cloudflare_queue_message_acknowledged",
  ).length;

  const retriedCount = results.filter(
    (result) => result.status === "cloudflare_queue_message_retried",
  ).length;

  const failedCount = results.filter(
    (result) => result.status === "cloudflare_queue_message_failed",
  ).length;

  /*
   * We do not throw merely because one individual
   * message requested retry.
   *
   * Each message has already received its explicit
   * Cloudflare Queue action.
   */

  return {
    status:
      failedCount > 0
        ? "cloudflare_queue_batch_partially_handled"
        : "cloudflare_queue_batch_handled",

    reason: failedCount > 0 ? "one_or_more_queue_actions_failed" : null,

    messageCount: batch.messages.length,

    acknowledgedCount,

    retriedCount,

    failedCount,

    results,
  };
}
