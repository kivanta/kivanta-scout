/*
 * Handle Cloudflare Investigation Queue Batch Test
 *
 * Tests:
 *
 *   handleCloudflareInvestigationQueueBatch()
 *
 *
 * This is an infrastructure adapter test.
 *
 * It does NOT contact real Cloudflare Queues.
 *
 *
 * We verify:
 *
 * 1. missing delivery handler is rejected
 * 2. invalid batch is rejected
 * 3. empty batch succeeds
 *
 * ACK behavior:
 *
 * 4. application ACK calls message.ack()
 * 5. application ACK does NOT call message.retry()
 * 6. ACK result metadata is preserved
 *
 * RETRY behavior:
 *
 * 7. application RETRY calls message.retry()
 * 8. application RETRY does NOT call message.ack()
 * 9. RETRY result metadata is preserved
 *
 * Fail-safe behavior:
 *
 * 10. delivery handler throw causes retry()
 * 11. unknown application decision causes retry()
 * 12. missing ack() is reported as adapter failure
 * 13. missing retry() is reported as adapter failure
 *
 * Batch behavior:
 *
 * 14. multiple messages are processed sequentially
 * 15. mixed ACK/RETRY batch is handled
 * 16. acknowledged count is correct
 * 17. retried count is correct
 * 18. failed count is correct
 * 19. message count is correct
 *
 * Runtime wiring:
 *
 * 20. message.body reaches application layer
 * 21. repositories are forwarded
 * 22. execution lease is forwarded
 * 23. runtime controls are forwarded
 *
 *
 * IMPORTANT:
 *
 * The adapter must never silently ACK an
 * application result it does not understand.
 */

import { handleCloudflareInvestigationQueueBatch } from "./handleCloudflareInvestigationQueueBatch.js";

/*
 * ------------------------------------------------
 * Shared runtime fixtures
 * ------------------------------------------------
 */

const investigationRepository = {
  fixture: "investigationRepository",
};

const executionLease = {
  fixture: "executionLease",
};

const executionRepository = {
  fixture: "executionRepository",
};

const createLeaseToken = () => "lease_fixture";

const createExecutionId = () => "exec_fixture";

const startedAt = "2026-09-07T15:20:00.000Z";

const runtimeNow = () => "2026-09-07T15:21:00.000Z";

/*
 * ------------------------------------------------
 * Cloudflare message fixture
 * ------------------------------------------------
 */

function createCloudflareMessage({
  id,

  body,

  includeAck = true,

  includeRetry = true,
} = {}) {
  const calls = {
    ack: 0,

    retry: 0,
  };

  const message = {
    id: id || "cf_message_fixture",

    body: body || {
      version: 1,

      type: "investigation_requested",

      investigationId: "inv_fixture",
    },
  };

  if (includeAck) {
    message.ack = () => {
      calls.ack += 1;
    };
  }

  if (includeRetry) {
    message.retry = () => {
      calls.retry += 1;
    };
  }

  return {
    message,

    calls,
  };
}

/*
 * =================================================
 * TEST 1
 * Missing delivery handler
 * =================================================
 */

console.log("\n===== MISSING DELIVERY HANDLER =====");

const missingHandlerResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: {
      messages: [],
    },
  },

  {
    deliveryHandler: null,
  },
);

console.dir(missingHandlerResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 2
 * Invalid batch
 * =================================================
 */

console.log("\n===== INVALID CLOUDFLARE BATCH =====");

const invalidBatchResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: null,
  },

  {
    deliveryHandler: async () => ({
      status: "queue_delivery_ack",

      decision: "ACK",
    }),
  },
);

console.dir(invalidBatchResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 3
 * Empty batch
 * =================================================
 */

console.log("\n===== EMPTY CLOUDFLARE BATCH =====");

const emptyBatchResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: {
      messages: [],
    },
  },

  {
    deliveryHandler: async () => ({
      status: "queue_delivery_ack",

      decision: "ACK",
    }),
  },
);

console.dir(emptyBatchResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 4–6
 * Application ACK
 * =================================================
 */

console.log("\n===== APPLICATION ACK =====");

const ackFixture = createCloudflareMessage({
  id: "cf_ack_001",

  body: {
    version: 1,

    type: "investigation_requested",

    investigationId: "inv_ack_001",
  },
});

const ackResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: {
      messages: [ackFixture.message],
    },
  },

  {
    deliveryHandler: async () => ({
      status: "queue_delivery_ack",

      decision: "ACK",

      reason: "investigation_execution_finished",

      investigationId: "inv_ack_001",

      preparationStatus: "queued_investigation_prepared",

      executionStatus: "prepared_execution_finished",

      executionId: "exec_ack_001",

      durableExecutionStatus: "COMPLETE",
    }),
  },
);

console.dir(ackResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 7–9
 * Application RETRY
 * =================================================
 */

console.log("\n===== APPLICATION RETRY =====");

const retryFixture = createCloudflareMessage({
  id: "cf_retry_001",

  body: {
    version: 1,

    type: "investigation_requested",

    investigationId: "inv_retry_001",
  },
});

const retryResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: {
      messages: [retryFixture.message],
    },
  },

  {
    deliveryHandler: async () => ({
      status: "queue_delivery_retry",

      decision: "RETRY",

      reason: "execution_outcome_not_recorded",

      investigationId: "inv_retry_001",

      preparationStatus: "queued_investigation_prepared",

      executionStatus: "prepared_execution_state_failed",

      executionId: "exec_retry_001",

      durableExecutionStatus: "PARTIAL",
    }),
  },
);

console.dir(retryResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 10
 * Delivery handler throws
 * =================================================
 */

console.log("\n===== DELIVERY HANDLER THROW =====");

const throwFixture = createCloudflareMessage({
  id: "cf_throw_001",

  body: {
    version: 1,

    type: "investigation_requested",

    investigationId: "inv_throw_001",
  },
});

const throwResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: {
      messages: [throwFixture.message],
    },
  },

  {
    deliveryHandler: async () => {
      throw new Error("fixture application failure");
    },
  },
);

console.dir(throwResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 11
 * Unknown application decision
 * =================================================
 */

console.log("\n===== UNKNOWN APPLICATION DECISION =====");

const unknownFixture = createCloudflareMessage({
  id: "cf_unknown_001",

  body: {
    version: 1,

    type: "investigation_requested",

    investigationId: "inv_unknown_001",
  },
});

const unknownResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: {
      messages: [unknownFixture.message],
    },
  },

  {
    deliveryHandler: async () => ({
      status: "something_unknown",

      decision: "MYSTERY",

      investigationId: "inv_unknown_001",
    }),
  },
);

console.dir(unknownResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 12
 * ACK method unavailable
 * =================================================
 */

console.log("\n===== ACK METHOD UNAVAILABLE =====");

const missingAckFixture = createCloudflareMessage({
  id: "cf_missing_ack",

  includeAck: false,

  includeRetry: true,
});

const missingAckResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: {
      messages: [missingAckFixture.message],
    },
  },

  {
    deliveryHandler: async () => ({
      status: "queue_delivery_ack",

      decision: "ACK",

      reason: "fixture_ack",
    }),
  },
);

console.dir(missingAckResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 13
 * RETRY method unavailable
 * =================================================
 */

console.log("\n===== RETRY METHOD UNAVAILABLE =====");

const missingRetryFixture = createCloudflareMessage({
  id: "cf_missing_retry",

  includeAck: true,

  includeRetry: false,
});

const missingRetryResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: {
      messages: [missingRetryFixture.message],
    },
  },

  {
    deliveryHandler: async () => ({
      status: "queue_delivery_retry",

      decision: "RETRY",

      reason: "fixture_retry",
    }),
  },
);

console.dir(missingRetryResult, {
  depth: null,
});

/*
 * =================================================
 * TEST 14–19
 * Sequential mixed batch
 * =================================================
 */

console.log("\n===== SEQUENTIAL MIXED BATCH =====");

const batchMessageA = createCloudflareMessage({
  id: "cf_batch_a",

  body: {
    version: 1,

    type: "investigation_requested",

    investigationId: "inv_batch_a",
  },
});

const batchMessageB = createCloudflareMessage({
  id: "cf_batch_b",

  body: {
    version: 1,

    type: "investigation_requested",

    investigationId: "inv_batch_b",
  },
});

const batchMessageC = createCloudflareMessage({
  id: "cf_batch_c",

  body: {
    version: 1,

    type: "investigation_requested",

    investigationId: "inv_batch_c",
  },
});

const sequentialOrder = [];

const mixedBatchResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: {
      messages: [
        batchMessageA.message,
        batchMessageB.message,
        batchMessageC.message,
      ],
    },
  },

  {
    deliveryHandler: async ({ message }) => {
      sequentialOrder.push(`start:${message.investigationId}`);

      if (message.investigationId === "inv_batch_a") {
        await Promise.resolve();

        sequentialOrder.push(`end:${message.investigationId}`);

        return {
          status: "queue_delivery_ack",

          decision: "ACK",

          reason: "investigation_execution_finished",

          investigationId: message.investigationId,
        };
      }

      if (message.investigationId === "inv_batch_b") {
        await Promise.resolve();

        sequentialOrder.push(`end:${message.investigationId}`);

        return {
          status: "queue_delivery_retry",

          decision: "RETRY",

          reason: "execution_outcome_not_recorded",

          investigationId: message.investigationId,
        };
      }

      await Promise.resolve();

      sequentialOrder.push(`end:${message.investigationId}`);

      return {
        status: "queue_delivery_ack",

        decision: "ACK",

        reason: "investigation_failure_recorded",

        investigationId: message.investigationId,

        durableExecutionStatus: "FAILED",
      };
    },
  },
);

console.dir(mixedBatchResult, {
  depth: null,
});

console.log("\n===== SEQUENTIAL ORDER =====");

console.dir(sequentialOrder, {
  depth: null,
});

/*
 * =================================================
 * TEST 20–23
 * Runtime wiring
 * =================================================
 */

console.log("\n===== RUNTIME WIRING =====");

const wiringFixture = createCloudflareMessage({
  id: "cf_wiring",

  body: {
    version: 1,

    type: "investigation_requested",

    investigationId: "inv_wiring",
  },
});

const wiringInputs = [];

const wiringResult = await handleCloudflareInvestigationQueueBatch(
  {
    batch: {
      messages: [wiringFixture.message],
    },

    investigationRepository,

    executionLease,

    executionRepository,

    now: runtimeNow,

    leaseDurationMs: 300000,

    createLeaseToken,

    createExecutionId,

    startedAt,
  },

  {
    deliveryHandler: async (input) => {
      wiringInputs.push(input);

      return {
        status: "queue_delivery_ack",

        decision: "ACK",

        reason: "investigation_execution_finished",

        investigationId: "inv_wiring",
      };
    },
  },
);

console.dir(wiringResult, {
  depth: null,
});

console.log("\n===== DELIVERY HANDLER INPUT =====");

console.dir(wiringInputs, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const ackMessageResult = ackResult.results?.[0];

const retryMessageResult = retryResult.results?.[0];

const throwMessageResult = throwResult.results?.[0];

const unknownMessageResult = unknownResult.results?.[0];

const missingAckMessageResult = missingAckResult.results?.[0];

const missingRetryMessageResult = missingRetryResult.results?.[0];

const wiringInput = wiringInputs[0];

const tests = {
  /*
   * Validation
   */
  missingDeliveryHandlerRejected:
    missingHandlerResult.status === "cloudflare_queue_batch_not_ready" &&
    missingHandlerResult.reason === "queue_delivery_handler_required",

  invalidBatchRejected:
    invalidBatchResult.status === "cloudflare_queue_batch_rejected" &&
    invalidBatchResult.reason === "cloudflare_message_batch_required",

  emptyBatchHandled:
    emptyBatchResult.status === "cloudflare_queue_batch_handled" &&
    emptyBatchResult.messageCount === 0,

  /*
   * ACK
   */
  ackMessageAcknowledged: ackFixture.calls.ack === 1,

  ackMessageNotRetried: ackFixture.calls.retry === 0,

  ackAdapterResultCorrect:
    ackMessageResult?.status === "cloudflare_queue_message_acknowledged" &&
    ackMessageResult?.decision === "ACK",

  ackMetadataPreserved:
    ackMessageResult?.cloudflareMessageId === "cf_ack_001" &&
    ackMessageResult?.investigationId === "inv_ack_001" &&
    ackMessageResult?.executionId === "exec_ack_001" &&
    ackMessageResult?.durableExecutionStatus === "COMPLETE",

  /*
   * RETRY
   */
  retryMessageRetried: retryFixture.calls.retry === 1,

  retryMessageNotAcknowledged: retryFixture.calls.ack === 0,

  retryAdapterResultCorrect:
    retryMessageResult?.status === "cloudflare_queue_message_retried" &&
    retryMessageResult?.decision === "RETRY",

  retryMetadataPreserved:
    retryMessageResult?.cloudflareMessageId === "cf_retry_001" &&
    retryMessageResult?.investigationId === "inv_retry_001" &&
    retryMessageResult?.executionId === "exec_retry_001" &&
    retryMessageResult?.durableExecutionStatus === "PARTIAL",

  /*
   * Handler throw
   */
  handlerThrowRetries:
    throwFixture.calls.retry === 1 && throwFixture.calls.ack === 0,

  handlerThrowReasonSafe:
    throwMessageResult?.reason === "queue_delivery_handler_threw",

  /*
   * Unknown decision
   */
  unknownDecisionRetries:
    unknownFixture.calls.retry === 1 && unknownFixture.calls.ack === 0,

  unknownDecisionFailsSafe:
    unknownMessageResult?.reason === "unrecognized_queue_delivery_decision",

  /*
   * Missing Queue APIs
   */
  missingAckReported:
    missingAckMessageResult?.status === "cloudflare_queue_message_failed" &&
    missingAckMessageResult?.reason === "cloudflare_message_ack_required",

  missingRetryReported:
    missingRetryMessageResult?.status === "cloudflare_queue_message_failed" &&
    missingRetryMessageResult?.reason === "cloudflare_message_retry_required",

  /*
   * Mixed batch
   */
  mixedBatchHandled:
    mixedBatchResult.status === "cloudflare_queue_batch_handled",

  mixedBatchMessageCountCorrect: mixedBatchResult.messageCount === 3,

  mixedBatchAcknowledgedCountCorrect: mixedBatchResult.acknowledgedCount === 2,

  mixedBatchRetriedCountCorrect: mixedBatchResult.retriedCount === 1,

  mixedBatchFailedCountCorrect: mixedBatchResult.failedCount === 0,

  firstMixedMessageAcked:
    batchMessageA.calls.ack === 1 && batchMessageA.calls.retry === 0,

  secondMixedMessageRetried:
    batchMessageB.calls.retry === 1 && batchMessageB.calls.ack === 0,

  thirdMixedMessageAcked:
    batchMessageC.calls.ack === 1 && batchMessageC.calls.retry === 0,

  /*
   * Sequential execution
   */
  messagesProcessedSequentially:
    JSON.stringify(sequentialOrder) ===
    JSON.stringify([
      "start:inv_batch_a",
      "end:inv_batch_a",
      "start:inv_batch_b",
      "end:inv_batch_b",
      "start:inv_batch_c",
      "end:inv_batch_c",
    ]),

  /*
   * Runtime wiring
   */
  wiringHandlerCalledOnce: wiringInputs.length === 1,

  messageBodyForwarded: wiringInput?.message?.investigationId === "inv_wiring",

  investigationRepositoryForwarded:
    wiringInput?.investigationRepository === investigationRepository,

  executionLeaseForwarded: wiringInput?.executionLease === executionLease,

  executionRepositoryForwarded:
    wiringInput?.executionRepository === executionRepository,

  runtimeClockForwarded: wiringInput?.now === runtimeNow,

  leaseDurationForwarded: wiringInput?.leaseDurationMs === 300000,

  leaseTokenFactoryForwarded:
    wiringInput?.createLeaseToken === createLeaseToken,

  executionIdFactoryForwarded:
    wiringInput?.createExecutionId === createExecutionId,

  startedAtForwarded: wiringInput?.startedAt === startedAt,

  wiringMessageAcked:
    wiringFixture.calls.ack === 1 && wiringFixture.calls.retry === 0,
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== HANDLE CLOUDFLARE INVESTIGATION QUEUE BATCH TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Handle Cloudflare investigation Queue batch test failed.");
}

console.log(
  "\n===== HANDLE CLOUDFLARE INVESTIGATION QUEUE BATCH TEST PASSED =====",
);
