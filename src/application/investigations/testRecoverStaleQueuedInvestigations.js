/*
 * Recover Stale Queued Investigations Test
 *
 * Tests:
 *
 *   recoverStaleQueuedInvestigations()
 *
 *
 * We verify:
 *
 * 1. missing queued-recovery dependency is rejected
 * 2. missing Queue dependency is rejected
 * 3. invalid current timestamp is rejected
 * 4. queued-recovery query throw fails safely
 * 5. queued-recovery query failure is surfaced
 * 6. empty sweep succeeds
 *
 * Successful recovery:
 *
 * 7. staleBefore uses the default 30-minute grace
 * 8. current timestamp reaches the recovery query
 * 9. recovery limit reaches the recovery query
 * 10. Queue receives only investigationId
 * 11. successful Queue send records cooldown
 * 12. cooldown write receives outboxId + recoveredAt
 * 13. fully successful candidate is counted as requeued
 *
 * Failure behavior:
 *
 * 14. Queue returned failure does not write cooldown
 * 15. Queue throw does not write cooldown
 * 16. cooldown returned failure is reported separately
 * 17. cooldown throw is reported separately
 * 18. malformed investigation ID is rejected
 * 19. malformed outbox ID is rejected
 *
 * Batch behavior:
 *
 * 20. mixed batch aggregates correctly
 * 21. candidates are processed sequentially
 * 22. valid custom stale grace is honored
 * 23. invalid stale grace falls back to 30 minutes
 * 24. custom limit is forwarded
 */

import assert from "node:assert/strict";

import { recoverStaleQueuedInvestigations } from "./recoverStaleQueuedInvestigations.js";

/*
 * =================================================
 * Shared time fixtures
 * =================================================
 */

const NOW = "2026-09-07T19:00:00.000Z";

const DEFAULT_STALE_BEFORE = "2026-09-07T18:30:00.000Z";

/*
 * =================================================
 * Fixture helpers
 * =================================================
 */

function createCandidate({
  investigationId = "inv_stale_queued_001",

  outboxId = 1,

  leaseState = "MISSING",

  leaseAttempt = null,

  latestExecutionStatus = null,
} = {}) {
  return {
    investigationId,

    lifecycleState: "QUEUED",

    outboxId,

    dispatchState: "DISPATCHED",

    attemptCount: 1,

    dispatchedAt: "2026-09-07T17:50:00.000Z",

    recoveryClockAt: "2026-09-07T18:00:00.000Z",

    leaseState,

    leaseAttempt,

    leaseExpiresAt: null,

    latestExecutionStatus,
  };
}

function createQueuedRecovery({
  investigations = [],

  markResult = {
    status: "queued_recovery_dispatch_recorded",

    reason: null,

    outboxId: 1,

    dispatchState: "DISPATCHED",
  },
} = {}) {
  return {
    async getRecoverableQueuedInvestigations() {
      return {
        status: "recoverable_queued_investigations_found",

        reason: null,

        investigations,

        count: investigations.length,
      };
    },

    async markQueuedRecoveryDispatched() {
      return markResult;
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
 * Missing queued-recovery dependency
 * =================================================
 */

console.log("\n===== MISSING QUEUED RECOVERY DEPENDENCY =====");

const missingRecoveryResult = await recoverStaleQueuedInvestigations({
  queue: createQueue(),

  now: NOW,
});

console.dir(missingRecoveryResult, {
  depth: null,
});

assert.equal(missingRecoveryResult.status, "stale_queued_recovery_not_ready");

assert.equal(missingRecoveryResult.reason, "queued_recovery_not_ready");

/*
 * =================================================
 * TEST 2
 * Missing Queue dependency
 * =================================================
 */

console.log("\n===== MISSING QUEUE DEPENDENCY =====");

const missingQueueResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: createQueuedRecovery(),

  now: NOW,
});

console.dir(missingQueueResult, {
  depth: null,
});

assert.equal(missingQueueResult.status, "stale_queued_recovery_not_ready");

assert.equal(missingQueueResult.reason, "investigation_queue_not_ready");

/*
 * =================================================
 * TEST 3
 * Invalid current timestamp
 * =================================================
 */

console.log("\n===== INVALID CURRENT TIMESTAMP =====");

const invalidTimestampResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: createQueuedRecovery(),

  queue: createQueue(),

  now: "not-a-date",
});

console.dir(invalidTimestampResult, {
  depth: null,
});

assert.equal(invalidTimestampResult.status, "stale_queued_recovery_not_ready");

assert.equal(invalidTimestampResult.reason, "valid_now_timestamp_required");

/*
 * =================================================
 * TEST 4
 * Recovery query throws
 * =================================================
 */

console.log("\n===== STALE QUEUED QUERY THROW =====");

const queryThrowResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: {
    async getRecoverableQueuedInvestigations() {
      throw new Error("fixture stale query exception");
    },

    async markQueuedRecoveryDispatched() {
      return {
        status: "queued_recovery_dispatch_recorded",
      };
    },
  },

  queue: createQueue(),

  now: NOW,
});

console.dir(queryThrowResult, {
  depth: null,
});

assert.equal(queryThrowResult.status, "stale_queued_recovery_failed");

assert.equal(queryThrowResult.reason, "recoverable_queued_query_threw");

/*
 * =================================================
 * TEST 5
 * Recovery query returns failure
 * =================================================
 */

console.log("\n===== STALE QUEUED QUERY FAILURE =====");

const queryFailureResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: {
    async getRecoverableQueuedInvestigations() {
      return {
        status: "recoverable_queued_investigations_query_failed",

        reason: "d1_recoverable_queued_investigations_query_failed",

        investigations: [],

        count: 0,
      };
    },

    async markQueuedRecoveryDispatched() {
      return {
        status: "queued_recovery_dispatch_recorded",
      };
    },
  },

  queue: createQueue(),

  now: NOW,
});

console.dir(queryFailureResult, {
  depth: null,
});

assert.equal(queryFailureResult.status, "stale_queued_recovery_failed");

assert.equal(queryFailureResult.reason, "recoverable_queued_query_failed");

/*
 * =================================================
 * TEST 6
 * Empty sweep
 * =================================================
 */

console.log("\n===== EMPTY STALE QUEUED SWEEP =====");

const emptyQueryInputs = [];

const emptyResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: {
    async getRecoverableQueuedInvestigations(input) {
      emptyQueryInputs.push(input);

      return {
        status: "recoverable_queued_investigations_found",

        reason: null,

        investigations: [],

        count: 0,
      };
    },

    async markQueuedRecoveryDispatched() {
      throw new Error("should not be called");
    },
  },

  queue: createQueue(),

  now: NOW,
});

console.dir(emptyResult, {
  depth: null,
});

assert.equal(emptyResult.status, "stale_queued_recovery_complete");

assert.equal(emptyResult.checked, 0);

/*
 * =================================================
 * TEST 7–13
 * Successful recovery + wiring
 * =================================================
 */

console.log("\n===== SUCCESSFUL STALE QUEUED RECOVERY =====");

const successQueryInputs = [];

const successQueueInputs = [];

const successCooldownInputs = [];

const successCandidate = createCandidate({
  investigationId: "inv_success",

  outboxId: 101,

  leaseState: "EXPIRED",

  leaseAttempt: 1,

  latestExecutionStatus: "RUNNING",
});

const successfulResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: {
    async getRecoverableQueuedInvestigations(input) {
      successQueryInputs.push(input);

      return {
        status: "recoverable_queued_investigations_found",

        reason: null,

        investigations: [successCandidate],

        count: 1,
      };
    },

    async markQueuedRecoveryDispatched(input) {
      successCooldownInputs.push(input);

      return {
        status: "queued_recovery_dispatch_recorded",

        reason: null,

        outboxId: input.outboxId,

        dispatchState: "DISPATCHED",

        recoveryClockAt: input.recoveredAt,
      };
    },
  },

  queue: {
    async sendInvestigation(input) {
      successQueueInputs.push(input);

      return {
        status: "investigation_queued",

        reason: null,

        investigationId: input.investigationId,
      };
    },
  },

  now: NOW,

  limit: 17,
});

console.dir(successfulResult, {
  depth: null,
});

assert.equal(successfulResult.status, "stale_queued_recovery_complete");

assert.equal(successfulResult.checked, 1);

assert.equal(successfulResult.requeued, 1);

assert.equal(successfulResult.queueFailures, 0);

assert.equal(successfulResult.stateFailures, 0);

assert.equal(successQueryInputs.length, 1);

assert.equal(successQueryInputs[0].now, NOW);

assert.equal(successQueryInputs[0].staleBefore, DEFAULT_STALE_BEFORE);

assert.equal(successQueryInputs[0].limit, 17);

assert.deepEqual(successQueueInputs, [
  {
    investigationId: "inv_success",
  },
]);

assert.deepEqual(successCooldownInputs, [
  {
    outboxId: 101,

    recoveredAt: NOW,
  },
]);

/*
 * =================================================
 * TEST 14
 * Queue returns failure
 * =================================================
 */

console.log("\n===== QUEUE RETURNED FAILURE =====");

const queueFailureCooldownCalls = [];

const queueFailureResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: {
    async getRecoverableQueuedInvestigations() {
      return {
        status: "recoverable_queued_investigations_found",

        reason: null,

        investigations: [
          createCandidate({
            investigationId: "inv_queue_failure",

            outboxId: 201,
          }),
        ],

        count: 1,
      };
    },

    async markQueuedRecoveryDispatched(input) {
      queueFailureCooldownCalls.push(input);

      return {
        status: "queued_recovery_dispatch_recorded",
      };
    },
  },

  queue: createQueue({
    result: {
      status: "queue_send_failed",

      reason: "cloudflare_queue_send_failed",
    },
  }),

  now: NOW,
});

console.dir(queueFailureResult, {
  depth: null,
});

assert.equal(queueFailureResult.status, "stale_queued_recovery_partial");

assert.equal(queueFailureResult.queueFailures, 1);

assert.equal(queueFailureCooldownCalls.length, 0);

/*
 * =================================================
 * TEST 15
 * Queue throws
 * =================================================
 */

console.log("\n===== QUEUE THROW =====");

const queueThrowCooldownCalls = [];

const queueThrowResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: {
    async getRecoverableQueuedInvestigations() {
      return {
        status: "recoverable_queued_investigations_found",

        investigations: [
          createCandidate({
            investigationId: "inv_queue_throw",

            outboxId: 202,
          }),
        ],

        count: 1,
      };
    },

    async markQueuedRecoveryDispatched(input) {
      queueThrowCooldownCalls.push(input);

      return {
        status: "queued_recovery_dispatch_recorded",
      };
    },
  },

  queue: {
    async sendInvestigation() {
      throw new Error("fixture Queue throw");
    },
  },

  now: NOW,
});

console.dir(queueThrowResult, {
  depth: null,
});

assert.equal(queueThrowResult.status, "stale_queued_recovery_partial");

assert.equal(queueThrowResult.queueFailures, 1);

assert.equal(queueThrowCooldownCalls.length, 0);

/*
 * =================================================
 * TEST 16
 * Cooldown returns failure
 * =================================================
 */

console.log("\n===== COOLDOWN RETURNED FAILURE =====");

const stateFailureResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: {
    async getRecoverableQueuedInvestigations() {
      return {
        status: "recoverable_queued_investigations_found",

        investigations: [
          createCandidate({
            investigationId: "inv_state_failure",

            outboxId: 301,
          }),
        ],

        count: 1,
      };
    },

    async markQueuedRecoveryDispatched() {
      return {
        status: "queued_recovery_dispatch_not_recorded",

        reason: "d1_queued_recovery_dispatch_update_failed",
      };
    },
  },

  queue: createQueue(),

  now: NOW,
});

console.dir(stateFailureResult, {
  depth: null,
});

assert.equal(stateFailureResult.status, "stale_queued_recovery_partial");

assert.equal(stateFailureResult.stateFailures, 1);

assert.equal(stateFailureResult.results[0].queueAccepted, true);

/*
 * =================================================
 * TEST 17
 * Cooldown throws
 * =================================================
 */

console.log("\n===== COOLDOWN THROW =====");

const stateThrowResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: {
    async getRecoverableQueuedInvestigations() {
      return {
        status: "recoverable_queued_investigations_found",

        investigations: [
          createCandidate({
            investigationId: "inv_state_throw",

            outboxId: 302,
          }),
        ],

        count: 1,
      };
    },

    async markQueuedRecoveryDispatched() {
      throw new Error("fixture cooldown throw");
    },
  },

  queue: createQueue(),

  now: NOW,
});

console.dir(stateThrowResult, {
  depth: null,
});

assert.equal(stateThrowResult.status, "stale_queued_recovery_partial");

assert.equal(stateThrowResult.stateFailures, 1);

assert.equal(
  stateThrowResult.results[0].reason,
  "recovery_dispatch_record_threw",
);

/*
 * =================================================
 * TEST 18
 * Invalid investigation ID
 * =================================================
 */

console.log("\n===== INVALID INVESTIGATION ID =====");

const invalidInvestigationQueueCalls = [];

const invalidInvestigationResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: createQueuedRecovery({
    investigations: [
      createCandidate({
        investigationId: "",

        outboxId: 401,
      }),
    ],
  }),

  queue: {
    async sendInvestigation(input) {
      invalidInvestigationQueueCalls.push(input);

      return {
        status: "investigation_queued",
      };
    },
  },

  now: NOW,
});

console.dir(invalidInvestigationResult, {
  depth: null,
});

assert.equal(invalidInvestigationResult.invalidRecords, 1);

assert.equal(invalidInvestigationQueueCalls.length, 0);

/*
 * =================================================
 * TEST 19
 * Invalid outbox ID
 * =================================================
 */

console.log("\n===== INVALID OUTBOX ID =====");

const invalidOutboxQueueCalls = [];

const invalidOutboxResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: createQueuedRecovery({
    investigations: [
      createCandidate({
        investigationId: "inv_invalid_outbox",

        outboxId: 0,
      }),
    ],
  }),

  queue: {
    async sendInvestigation(input) {
      invalidOutboxQueueCalls.push(input);

      return {
        status: "investigation_queued",
      };
    },
  },

  now: NOW,
});

console.dir(invalidOutboxResult, {
  depth: null,
});

assert.equal(invalidOutboxResult.invalidRecords, 1);

assert.equal(invalidOutboxQueueCalls.length, 0);

/*
 * =================================================
 * TEST 20–24
 * Mixed batch + sequential behavior
 * =================================================
 */

console.log("\n===== MIXED STALE QUEUED SWEEP =====");

const mixedQueryInputs = [];

const mixedQueueInputs = [];

const mixedCooldownInputs = [];

const processingOrder = [];

const mixedCandidates = [
  createCandidate({
    investigationId: "mixed_1",

    outboxId: 501,
  }),

  createCandidate({
    investigationId: "mixed_2",

    outboxId: 502,
  }),

  createCandidate({
    investigationId: "mixed_3",

    outboxId: 503,
  }),

  createCandidate({
    investigationId: "mixed_4",

    outboxId: 504,
  }),
];

const mixedQueuedRecovery = {
  async getRecoverableQueuedInvestigations(input) {
    mixedQueryInputs.push(input);

    return {
      status: "recoverable_queued_investigations_found",

      reason: null,

      investigations: mixedCandidates,

      count: mixedCandidates.length,
    };
  },

  async markQueuedRecoveryDispatched(input) {
    mixedCooldownInputs.push(input);

    processingOrder.push(`state-start:${input.outboxId}`);

    await Promise.resolve();

    processingOrder.push(`state-end:${input.outboxId}`);

    if (input.outboxId === 503) {
      return {
        status: "queued_recovery_dispatch_not_recorded",

        reason: "fixture_state_failure",
      };
    }

    return {
      status: "queued_recovery_dispatch_recorded",

      reason: null,

      outboxId: input.outboxId,

      dispatchState: "DISPATCHED",
    };
  },
};

const mixedQueue = {
  async sendInvestigation(input) {
    mixedQueueInputs.push(input);

    processingOrder.push(`queue-start:${input.investigationId}`);

    await Promise.resolve();

    processingOrder.push(`queue-end:${input.investigationId}`);

    if (input.investigationId === "mixed_2") {
      return {
        status: "queue_send_failed",

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

const mixedResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: mixedQueuedRecovery,

  queue: mixedQueue,

  now: NOW,

  /*
   * Custom grace:
   *
   * 20 minutes
   *
   * 19:00 - 20 min = 18:40
   */
  staleGraceMs: 20 * 60 * 1000,

  limit: 9,
});

console.dir(mixedResult, {
  depth: null,
});

console.log("\n===== MIXED PROCESSING ORDER =====");

console.dir(processingOrder, {
  depth: null,
});

/*
 * =================================================
 * Invalid grace fallback
 * =================================================
 */

const invalidGraceQueryInputs = [];

const invalidGraceResult = await recoverStaleQueuedInvestigations({
  queuedRecovery: {
    async getRecoverableQueuedInvestigations(input) {
      invalidGraceQueryInputs.push(input);

      return {
        status: "recoverable_queued_investigations_found",

        investigations: [],

        count: 0,
      };
    },

    async markQueuedRecoveryDispatched() {
      return {
        status: "queued_recovery_dispatch_recorded",
      };
    },
  },

  queue: createQueue(),

  now: NOW,

  staleGraceMs: -10,
});

assert.equal(invalidGraceResult.status, "stale_queued_recovery_complete");

/*
 * =================================================
 * FINAL ASSERTIONS
 * =================================================
 */

const tests = {
  missingRecoveryRejected:
    missingRecoveryResult.status === "stale_queued_recovery_not_ready" &&
    missingRecoveryResult.reason === "queued_recovery_not_ready",

  missingQueueRejected:
    missingQueueResult.status === "stale_queued_recovery_not_ready" &&
    missingQueueResult.reason === "investigation_queue_not_ready",

  invalidTimestampRejected:
    invalidTimestampResult.status === "stale_queued_recovery_not_ready" &&
    invalidTimestampResult.reason === "valid_now_timestamp_required",

  queryThrowFailsSafely:
    queryThrowResult.status === "stale_queued_recovery_failed" &&
    queryThrowResult.reason === "recoverable_queued_query_threw",

  queryFailureSurfaced:
    queryFailureResult.status === "stale_queued_recovery_failed" &&
    queryFailureResult.reason === "recoverable_queued_query_failed",

  emptySweepHandled:
    emptyResult.status === "stale_queued_recovery_complete" &&
    emptyResult.checked === 0,

  defaultGraceProducesThirtyMinuteThreshold:
    emptyQueryInputs[0]?.staleBefore === DEFAULT_STALE_BEFORE,

  successfulNowForwarded: successQueryInputs[0]?.now === NOW,

  successfulThresholdForwarded:
    successQueryInputs[0]?.staleBefore === DEFAULT_STALE_BEFORE,

  successfulLimitForwarded: successQueryInputs[0]?.limit === 17,

  queueReceivesOnlyInvestigationId:
    JSON.stringify(successQueueInputs[0]) ===
    JSON.stringify({
      investigationId: "inv_success",
    }),

  cooldownReceivesOutboxAndTime:
    JSON.stringify(successCooldownInputs[0]) ===
    JSON.stringify({
      outboxId: 101,

      recoveredAt: NOW,
    }),

  successfulCandidateRequeued:
    successfulResult.requeued === 1 &&
    successfulResult.queueFailures === 0 &&
    successfulResult.stateFailures === 0,

  queueFailureSkipsCooldown:
    queueFailureResult.queueFailures === 1 &&
    queueFailureCooldownCalls.length === 0,

  queueThrowSkipsCooldown:
    queueThrowResult.queueFailures === 1 &&
    queueThrowCooldownCalls.length === 0,

  stateFailureTrackedSeparately:
    stateFailureResult.stateFailures === 1 &&
    stateFailureResult.queueFailures === 0 &&
    stateFailureResult.results[0].queueAccepted === true,

  stateThrowTrackedSeparately:
    stateThrowResult.stateFailures === 1 &&
    stateThrowResult.results[0].reason === "recovery_dispatch_record_threw",

  malformedInvestigationRejected:
    invalidInvestigationResult.invalidRecords === 1 &&
    invalidInvestigationQueueCalls.length === 0,

  malformedOutboxRejected:
    invalidOutboxResult.invalidRecords === 1 &&
    invalidOutboxQueueCalls.length === 0,

  mixedQueryCalledOnce: mixedQueryInputs.length === 1,

  customGraceHonored:
    mixedQueryInputs[0]?.staleBefore === "2026-09-07T18:40:00.000Z",

  customLimitForwarded: mixedQueryInputs[0]?.limit === 9,

  mixedBatchAggregated:
    mixedResult.status === "stale_queued_recovery_partial" &&
    mixedResult.checked === 4 &&
    mixedResult.requeued === 2 &&
    mixedResult.queueFailures === 1 &&
    mixedResult.stateFailures === 1 &&
    mixedResult.invalidRecords === 0,

  queueFailureHasNoStateWrite: !mixedCooldownInputs.some(
    (input) => input.outboxId === 502,
  ),

  processingSequential:
    JSON.stringify(processingOrder) ===
    JSON.stringify([
      "queue-start:mixed_1",
      "queue-end:mixed_1",
      "state-start:501",
      "state-end:501",

      "queue-start:mixed_2",
      "queue-end:mixed_2",

      "queue-start:mixed_3",
      "queue-end:mixed_3",
      "state-start:503",
      "state-end:503",

      "queue-start:mixed_4",
      "queue-end:mixed_4",
      "state-start:504",
      "state-end:504",
    ]),

  invalidGraceFallsBackToDefault:
    invalidGraceQueryInputs[0]?.staleBefore === DEFAULT_STALE_BEFORE,
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== RECOVER STALE QUEUED INVESTIGATIONS TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Recover stale queued investigations test failed.");
}

console.log("\n===== RECOVER STALE QUEUED INVESTIGATIONS TEST PASSED =====");
