/*
 * Recover Stranded Investigations Test
 *
 * Tests:
 *
 *   recoverStrandedInvestigations()
 *
 *
 * We verify:
 *
 * 1. missing recovery dependency is rejected
 * 2. missing Queue dependency is rejected
 * 3. invalid timestamp is rejected
 * 4. recovery query throw fails safely
 * 5. recovery query failure is surfaced
 * 6. empty recovery sweep succeeds
 * 7. recoverable investigation is requeued
 * 8. Queue failure leaves recovery retryable
 * 9. Queue throw leaves recovery retryable
 * 10. malformed recovery record is rejected safely
 * 11. mixed sweep aggregates correctly
 * 12. recovery query receives now + limit
 * 13. Queue receives only investigationId
 * 14. processing remains sequential
 */

import assert from "node:assert/strict";

import { recoverStrandedInvestigations } from "./recoverStrandedInvestigations.js";

/*
 * =================================================
 * SHARED FIXTURES
 * =================================================
 */

const NOW = "2026-09-07T18:30:00.000Z";

function createRecoveryCandidate({
  investigationId = "inv_recovery_001",

  leaseState = "EXPIRED",

  leaseAttempt = 1,

  leaseExpiresAt = "2026-09-07T18:20:00.000Z",

  latestExecutionStatus = "RUNNING",
} = {}) {
  return {
    investigationId,

    lifecycleState: "PREPARING_REVIEW",

    leaseState,

    leaseAttempt,

    leaseExpiresAt,

    latestExecutionStatus,
  };
}

function createRecovery({ investigations = [] } = {}) {
  return {
    async getRecoverableInvestigations() {
      return {
        status: "recoverable_investigations_found",

        reason: null,

        investigations,

        count: investigations.length,
      };
    },
  };
}

function createQueue({
  result = {
    status: "investigation_queued",

    reason: null,
  },
} = {}) {
  return {
    async sendInvestigation() {
      return result;
    },
  };
}

/*
 * =================================================
 * TEST 1
 * Missing recovery dependency
 * =================================================
 */

console.log("\n===== MISSING RECOVERY DEPENDENCY =====");

const missingRecoveryResult = await recoverStrandedInvestigations({
  queue: createQueue(),

  now: NOW,
});

console.dir(missingRecoveryResult, {
  depth: null,
});

assert.equal(missingRecoveryResult.status, "recovery_not_ready");

assert.equal(missingRecoveryResult.reason, "execution_recovery_not_ready");

/*
 * =================================================
 * TEST 2
 * Missing Queue dependency
 * =================================================
 */

console.log("\n===== MISSING QUEUE DEPENDENCY =====");

const missingQueueResult = await recoverStrandedInvestigations({
  recovery: createRecovery(),

  now: NOW,
});

console.dir(missingQueueResult, {
  depth: null,
});

assert.equal(missingQueueResult.status, "recovery_not_ready");

assert.equal(missingQueueResult.reason, "investigation_queue_not_ready");

/*
 * =================================================
 * TEST 3
 * Invalid timestamp
 * =================================================
 */

console.log("\n===== INVALID RECOVERY TIMESTAMP =====");

const invalidTimestampResult = await recoverStrandedInvestigations({
  recovery: createRecovery(),

  queue: createQueue(),

  now: "not-a-date",
});

console.dir(invalidTimestampResult, {
  depth: null,
});

assert.equal(invalidTimestampResult.status, "recovery_not_ready");

assert.equal(invalidTimestampResult.reason, "valid_now_timestamp_required");

/*
 * =================================================
 * TEST 4
 * Recovery query throws
 * =================================================
 */

console.log("\n===== RECOVERY QUERY THROW =====");

const queryThrowResult = await recoverStrandedInvestigations({
  recovery: {
    async getRecoverableInvestigations() {
      throw new Error("fixture query failure");
    },
  },

  queue: createQueue(),

  now: NOW,
});

console.dir(queryThrowResult, {
  depth: null,
});

assert.equal(queryThrowResult.status, "recovery_sweep_failed");

assert.equal(queryThrowResult.reason, "recoverable_investigation_query_threw");

/*
 * =================================================
 * TEST 5
 * Recovery query returns failure
 * =================================================
 */

console.log("\n===== RECOVERY QUERY FAILURE =====");

const queryFailureResult = await recoverStrandedInvestigations({
  recovery: {
    async getRecoverableInvestigations() {
      return {
        status: "recoverable_investigations_query_failed",

        reason: "d1_recoverable_investigations_query_failed",

        investigations: [],

        count: 0,
      };
    },
  },

  queue: createQueue(),

  now: NOW,
});

console.dir(queryFailureResult, {
  depth: null,
});

assert.equal(queryFailureResult.status, "recovery_sweep_failed");

assert.equal(
  queryFailureResult.reason,
  "recoverable_investigation_query_failed",
);

/*
 * =================================================
 * TEST 6
 * Empty recovery sweep
 * =================================================
 */

console.log("\n===== EMPTY RECOVERY SWEEP =====");

const emptySweepResult = await recoverStrandedInvestigations({
  recovery: createRecovery({
    investigations: [],
  }),

  queue: createQueue(),

  now: NOW,
});

console.dir(emptySweepResult, {
  depth: null,
});

assert.equal(emptySweepResult.status, "recovery_sweep_complete");

assert.equal(emptySweepResult.checked, 0);

assert.equal(emptySweepResult.requeued, 0);

/*
 * =================================================
 * TEST 7
 * Successful requeue
 * =================================================
 */

console.log("\n===== SUCCESSFUL STRANDED RECOVERY =====");

const successfulQueueCalls = [];

const successfulCandidate = createRecoveryCandidate({
  investigationId: "inv_recovery_success",
});

const successfulResult = await recoverStrandedInvestigations({
  recovery: createRecovery({
    investigations: [successfulCandidate],
  }),

  queue: {
    async sendInvestigation(input) {
      successfulQueueCalls.push(input);

      return {
        status: "investigation_queued",

        reason: null,

        investigationId: input.investigationId,
      };
    },
  },

  now: NOW,
});

console.dir(successfulResult, {
  depth: null,
});

assert.equal(successfulResult.status, "recovery_sweep_complete");

assert.equal(successfulResult.checked, 1);

assert.equal(successfulResult.requeued, 1);

assert.equal(successfulResult.queueFailures, 0);

assert.equal(successfulQueueCalls.length, 1);

assert.deepEqual(successfulQueueCalls[0], {
  investigationId: "inv_recovery_success",
});

/*
 * =================================================
 * TEST 8
 * Queue returns failure
 * =================================================
 */

console.log("\n===== RECOVERY QUEUE FAILURE =====");

const queueFailureResult = await recoverStrandedInvestigations({
  recovery: createRecovery({
    investigations: [
      createRecoveryCandidate({
        investigationId: "inv_queue_failure",
      }),
    ],
  }),

  queue: createQueue({
    result: {
      status: "investigation_not_queued",

      reason: "cloudflare_queue_send_failed",
    },
  }),

  now: NOW,
});

console.dir(queueFailureResult, {
  depth: null,
});

assert.equal(queueFailureResult.status, "recovery_sweep_partial");

assert.equal(queueFailureResult.requeued, 0);

assert.equal(queueFailureResult.queueFailures, 1);

/*
 * =================================================
 * TEST 9
 * Queue throws
 * =================================================
 */

console.log("\n===== RECOVERY QUEUE THROW =====");

const queueThrowResult = await recoverStrandedInvestigations({
  recovery: createRecovery({
    investigations: [
      createRecoveryCandidate({
        investigationId: "inv_queue_throw",
      }),
    ],
  }),

  queue: {
    async sendInvestigation() {
      throw new Error("fixture Queue exception");
    },
  },

  now: NOW,
});

console.dir(queueThrowResult, {
  depth: null,
});

assert.equal(queueThrowResult.status, "recovery_sweep_partial");

assert.equal(queueThrowResult.queueFailures, 1);

assert.equal(queueThrowResult.results[0].reason, "recovery_queue_send_threw");

/*
 * =================================================
 * TEST 10
 * Malformed recovery row
 * =================================================
 */

console.log("\n===== INVALID RECOVERY RECORD =====");

const invalidRecordQueueCalls = [];

const invalidRecordResult = await recoverStrandedInvestigations({
  recovery: createRecovery({
    investigations: [
      {
        investigationId: "",

        lifecycleState: "PREPARING_REVIEW",

        leaseState: "EXPIRED",
      },
    ],
  }),

  queue: {
    async sendInvestigation(input) {
      invalidRecordQueueCalls.push(input);

      return {
        status: "investigation_queued",
      };
    },
  },

  now: NOW,
});

console.dir(invalidRecordResult, {
  depth: null,
});

assert.equal(invalidRecordResult.status, "recovery_sweep_partial");

assert.equal(invalidRecordResult.invalidRecords, 1);

assert.equal(invalidRecordQueueCalls.length, 0);

/*
 * =================================================
 * TEST 11–14
 * Mixed sequential sweep + wiring
 * =================================================
 */

console.log("\n===== MIXED RECOVERY SWEEP =====");

const queryInputs = [];

const queueInputs = [];

const processingOrder = [];

const mixedCandidates = [
  createRecoveryCandidate({
    investigationId: "inv_mixed_1",

    leaseState: "MISSING",

    leaseAttempt: null,

    leaseExpiresAt: null,

    latestExecutionStatus: null,
  }),

  createRecoveryCandidate({
    investigationId: "inv_mixed_2",

    leaseState: "EXPIRED",

    leaseAttempt: 1,

    latestExecutionStatus: "RUNNING",
  }),

  createRecoveryCandidate({
    investigationId: "inv_mixed_3",

    leaseState: "RELEASED",

    leaseAttempt: 2,

    latestExecutionStatus: "RUNNING",
  }),
];

const mixedRecovery = {
  async getRecoverableInvestigations(input) {
    queryInputs.push(input);

    return {
      status: "recoverable_investigations_found",

      reason: null,

      investigations: mixedCandidates,

      count: mixedCandidates.length,
    };
  },
};

const mixedQueue = {
  async sendInvestigation(input) {
    queueInputs.push(input);

    processingOrder.push(`start:${input.investigationId}`);

    await Promise.resolve();

    processingOrder.push(`end:${input.investigationId}`);

    if (input.investigationId === "inv_mixed_2") {
      return {
        status: "investigation_not_queued",

        reason: "fixture_queue_failure",
      };
    }

    return {
      status: "investigation_queued",

      reason: null,

      investigationId: input.investigationId,
    };
  },
};

const mixedResult = await recoverStrandedInvestigations({
  recovery: mixedRecovery,

  queue: mixedQueue,

  now: NOW,

  limit: 12,
});

console.dir(mixedResult, {
  depth: null,
});

console.log("\n===== RECOVERY PROCESSING ORDER =====");

console.dir(processingOrder, {
  depth: null,
});

/*
 * =================================================
 * FINAL ASSERTIONS
 * =================================================
 */

const tests = {
  missingRecoveryRejected:
    missingRecoveryResult.status === "recovery_not_ready" &&
    missingRecoveryResult.reason === "execution_recovery_not_ready",

  missingQueueRejected:
    missingQueueResult.status === "recovery_not_ready" &&
    missingQueueResult.reason === "investigation_queue_not_ready",

  invalidTimestampRejected:
    invalidTimestampResult.status === "recovery_not_ready" &&
    invalidTimestampResult.reason === "valid_now_timestamp_required",

  queryThrowFailsSafely:
    queryThrowResult.status === "recovery_sweep_failed" &&
    queryThrowResult.reason === "recoverable_investigation_query_threw",

  queryFailureSurfaced:
    queryFailureResult.status === "recovery_sweep_failed" &&
    queryFailureResult.reason === "recoverable_investigation_query_failed",

  emptySweepHandled:
    emptySweepResult.status === "recovery_sweep_complete" &&
    emptySweepResult.checked === 0,

  strandedInvestigationRequeued:
    successfulResult.status === "recovery_sweep_complete" &&
    successfulResult.requeued === 1,

  onlyInvestigationIdSent:
    JSON.stringify(successfulQueueCalls[0]) ===
    JSON.stringify({
      investigationId: "inv_recovery_success",
    }),

  queueFailureRemainsRecoverable:
    queueFailureResult.status === "recovery_sweep_partial" &&
    queueFailureResult.queueFailures === 1,

  queueThrowRemainsRecoverable:
    queueThrowResult.status === "recovery_sweep_partial" &&
    queueThrowResult.queueFailures === 1,

  malformedRecordRejected:
    invalidRecordResult.invalidRecords === 1 &&
    invalidRecordQueueCalls.length === 0,

  recoveryQueryCalledOnce: queryInputs.length === 1,

  recoveryTimestampForwarded: queryInputs[0]?.now === NOW,

  recoveryLimitForwarded: queryInputs[0]?.limit === 12,

  allValidCandidatesSentToQueue: queueInputs.length === 3,

  mixedSweepAggregated:
    mixedResult.status === "recovery_sweep_partial" &&
    mixedResult.checked === 3 &&
    mixedResult.requeued === 2 &&
    mixedResult.queueFailures === 1 &&
    mixedResult.invalidRecords === 0,

  processingSequential:
    JSON.stringify(processingOrder) ===
    JSON.stringify([
      "start:inv_mixed_1",
      "end:inv_mixed_1",
      "start:inv_mixed_2",
      "end:inv_mixed_2",
      "start:inv_mixed_3",
      "end:inv_mixed_3",
    ]),

  recoveryMetadataPreserved:
    mixedResult.results[0]?.leaseState === "MISSING" &&
    mixedResult.results[2]?.leaseState === "RELEASED",
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== RECOVER STRANDED INVESTIGATIONS TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Recover stranded investigations test failed.");
}

console.log("\n===== RECOVER STRANDED INVESTIGATIONS TEST PASSED =====");
