/*
 * Process Queued Investigation Test
 *
 * Tests the application service that handles
 * one delivered investigation Queue message.
 *
 * This test uses application fakes only.
 *
 * It does NOT contact Cloudflare Queue or D1.
 *
 *
 * We verify:
 *
 * 1. missing dependencies are rejected
 * 2. malformed Queue messages are rejected
 * 3. missing investigation records are handled
 * 4. non-resumable lifecycle states are blocked
 * 5. QUEUED investigation acquires a lease
 * 6. QUEUED -> PREPARING_REVIEW is persisted
 * 7. duplicate delivery with active lease stops safely
 * 8. PREPARING_REVIEW can resume after an expired worker
 * 9. lifecycle update failure releases the acquired lease
 */

import { processQueuedInvestigation } from "./processQueuedInvestigation.js";

/*
 * ------------------------------------------------
 * Shared fixture values
 * ------------------------------------------------
 */

const now = "2026-09-07T11:00:00.000Z";

const investigationId = "inv_queue_process_001";

const queueMessage = {
  version: 1,

  type: "investigation_requested",

  investigationId,
};

/*
 * Create a normal investigation fixture.
 */
function createInvestigation(lifecycleState = "QUEUED") {
  return {
    investigationId,

    createdAt: "2026-09-07T10:55:00.000Z",

    updatedAt: "2026-09-07T10:55:00.000Z",

    lifecycleState,

    reviewKey: {
      provider: "github",

      repositoryId: "repo_queue_process",

      commitSha: "dddddddddddddddddddddddddddddddddddddddd",

      methodologyId: "kivanta-scout-methodology",

      methodologyVersion: "1.0",
    },

    target: {
      status: "target_frozen",
    },
  };
}

/*
 * ------------------------------------------------
 * TEST 1
 * Missing dependencies.
 * ------------------------------------------------
 */

console.log("\n===== MISSING DEPENDENCIES =====");

const missingDependenciesResult = await processQueuedInvestigation({
  message: queueMessage,

  now,
});

console.dir(missingDependenciesResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 2
 * Invalid Queue message.
 * ------------------------------------------------
 */

const basicRepository = {
  async claimActiveInvestigation() {
    return null;
  },

  async getInvestigation() {
    return {
      status: "investigation_found",

      investigation: createInvestigation(),
    };
  },

  async updateInvestigation() {
    return {
      status: "investigation_updated",
    };
  },
};

const basicLease = {
  async acquireExecutionLease() {
    return {
      status: "execution_lease_acquired",

      attempt: 1,

      acquiredAt: now,

      expiresAt: "2026-09-07T11:05:00.000Z",
    };
  },

  async getExecutionLease() {
    return {
      status: "execution_lease_not_found",

      lease: null,
    };
  },

  async heartbeatExecutionLease() {
    return {
      status: "execution_lease_renewed",
    };
  },

  async releaseExecutionLease() {
    return {
      status: "execution_lease_released",
    };
  },
};

console.log("\n===== INVALID QUEUE MESSAGE =====");

const invalidMessageResult = await processQueuedInvestigation({
  message: {
    version: 999,

    type: "investigation_requested",

    investigationId,
  },

  investigationRepository: basicRepository,

  executionLease: basicLease,

  now,
});

console.dir(invalidMessageResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 3
 * Investigation does not exist.
 * ------------------------------------------------
 */

const missingInvestigationRepository = {
  async claimActiveInvestigation() {
    return null;
  },

  async getInvestigation() {
    return {
      status: "investigation_not_found",

      investigation: null,
    };
  },

  async updateInvestigation() {
    throw new Error("Should not be called.");
  },
};

console.log("\n===== INVESTIGATION NOT FOUND =====");

const missingInvestigationResult = await processQueuedInvestigation({
  message: queueMessage,

  investigationRepository: missingInvestigationRepository,

  executionLease: basicLease,

  now,
});

console.dir(missingInvestigationResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 4
 * Investigation lifecycle is not resumable.
 *
 * CREATED should not be executed directly by
 * the Queue consumer.
 *
 * Dispatch must move it to QUEUED first.
 * ------------------------------------------------
 */

const nonResumableRepository = {
  async claimActiveInvestigation() {
    return null;
  },

  async getInvestigation() {
    return {
      status: "investigation_found",

      investigation: createInvestigation("CREATED"),
    };
  },

  async updateInvestigation() {
    throw new Error("Should not be called.");
  },
};

console.log("\n===== NON-RESUMABLE LIFECYCLE =====");

const nonResumableResult = await processQueuedInvestigation({
  message: queueMessage,

  investigationRepository: nonResumableRepository,

  executionLease: basicLease,

  now,
});

console.dir(nonResumableResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 5
 * Happy path.
 *
 * QUEUED
 *   ↓
 * acquire lease
 *   ↓
 * PREPARING_REVIEW
 * ------------------------------------------------
 */

const happyUpdates = [];

const happyAcquireInputs = [];

const happyRepository = {
  async claimActiveInvestigation() {
    return null;
  },

  async getInvestigation() {
    return {
      status: "investigation_found",

      investigation: createInvestigation("QUEUED"),
    };
  },

  async updateInvestigation(id, update) {
    happyUpdates.push({
      investigationId: id,
      update,
    });

    return {
      status: "investigation_updated",

      investigationId: id,

      lifecycleState: update.lifecycleState,
    };
  },
};

const happyLease = {
  async acquireExecutionLease(input) {
    happyAcquireInputs.push(input);

    return {
      status: "execution_lease_acquired",

      reason: null,

      investigationId: input.investigationId,

      leaseToken: input.leaseToken,

      attempt: 1,

      acquiredAt: input.acquiredAt,

      expiresAt: input.expiresAt,
    };
  },

  async getExecutionLease() {
    return {
      status: "execution_lease_found",

      lease: null,
    };
  },

  async heartbeatExecutionLease() {
    return {
      status: "execution_lease_renewed",
    };
  },

  async releaseExecutionLease() {
    throw new Error("Happy path must keep lease active.");
  },
};

console.log("\n===== QUEUED HAPPY PATH =====");

const happyResult = await processQueuedInvestigation({
  message: queueMessage,

  investigationRepository: happyRepository,

  executionLease: happyLease,

  now,

  leaseDurationMs: 5 * 60 * 1000,

  createLeaseToken: () => "lease_happy_path",
});

console.dir(happyResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 6
 * Duplicate Queue delivery.
 *
 * Another worker already owns the lease.
 *
 * We must NOT update lifecycle state.
 * ------------------------------------------------
 */

let duplicateUpdateCalled = false;

const duplicateRepository = {
  async claimActiveInvestigation() {
    return null;
  },

  async getInvestigation() {
    return {
      status: "investigation_found",

      investigation: createInvestigation("QUEUED"),
    };
  },

  async updateInvestigation() {
    duplicateUpdateCalled = true;

    throw new Error("Duplicate delivery must not update state.");
  },
};

const busyLease = {
  async acquireExecutionLease() {
    return {
      status: "execution_lease_busy",

      reason: "active_execution_lease_exists",

      investigationId,

      expiresAt: "2026-09-07T11:04:00.000Z",

      attempt: 1,
    };
  },

  async getExecutionLease() {
    return {
      status: "execution_lease_found",

      lease: null,
    };
  },

  async heartbeatExecutionLease() {
    return {
      status: "execution_lease_not_renewed",
    };
  },

  async releaseExecutionLease() {
    return {
      status: "execution_lease_not_released",
    };
  },
};

console.log("\n===== DUPLICATE ACTIVE DELIVERY =====");

const duplicateResult = await processQueuedInvestigation({
  message: queueMessage,

  investigationRepository: duplicateRepository,

  executionLease: busyLease,

  now,

  createLeaseToken: () => "lease_duplicate_delivery",
});

console.dir(duplicateResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 7
 * Recover PREPARING_REVIEW.
 *
 * This models:
 *
 * Worker A:
 *   acquired lease
 *   moved investigation to PREPARING_REVIEW
 *   crashed
 *
 * Later:
 *   lease expired
 *   Worker B receives/retries
 *   acquires attempt 2
 *
 * PREPARING_REVIEW must remain PREPARING_REVIEW,
 * so no redundant lifecycle write is required.
 * ------------------------------------------------
 */

let resumedUpdateCalled = false;

const resumedRepository = {
  async claimActiveInvestigation() {
    return null;
  },

  async getInvestigation() {
    return {
      status: "investigation_found",

      investigation: createInvestigation("PREPARING_REVIEW"),
    };
  },

  async updateInvestigation() {
    resumedUpdateCalled = true;

    throw new Error("Resumed PREPARING_REVIEW should not rewrite lifecycle.");
  },
};

const resumedLease = {
  async acquireExecutionLease(input) {
    return {
      status: "execution_lease_acquired",

      reason: null,

      investigationId: input.investigationId,

      leaseToken: input.leaseToken,

      attempt: 2,

      acquiredAt: input.acquiredAt,

      expiresAt: input.expiresAt,
    };
  },

  async getExecutionLease() {
    return {
      status: "execution_lease_found",

      lease: null,
    };
  },

  async heartbeatExecutionLease() {
    return {
      status: "execution_lease_renewed",
    };
  },

  async releaseExecutionLease() {
    throw new Error("Recovered worker must retain the active lease.");
  },
};

console.log("\n===== PREPARING_REVIEW RECOVERY =====");

const resumedResult = await processQueuedInvestigation({
  message: queueMessage,

  investigationRepository: resumedRepository,

  executionLease: resumedLease,

  now,

  createLeaseToken: () => "lease_recovery_worker",
});

console.dir(resumedResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 8
 * Lease acquired, but PREPARING_REVIEW D1 update
 * fails.
 *
 * The service must release the lease.
 * ------------------------------------------------
 */

const releasedLeaseInputs = [];

const failingStateRepository = {
  async claimActiveInvestigation() {
    return null;
  },

  async getInvestigation() {
    return {
      status: "investigation_found",

      investigation: createInvestigation("QUEUED"),
    };
  },

  async updateInvestigation() {
    return {
      status: "investigation_update_failed",

      reason: "simulated_d1_failure",
    };
  },
};

const leaseForFailedState = {
  async acquireExecutionLease(input) {
    return {
      status: "execution_lease_acquired",

      reason: null,

      investigationId: input.investigationId,

      leaseToken: input.leaseToken,

      attempt: 1,

      acquiredAt: input.acquiredAt,

      expiresAt: input.expiresAt,
    };
  },

  async getExecutionLease() {
    return {
      status: "execution_lease_found",

      lease: null,
    };
  },

  async heartbeatExecutionLease() {
    return {
      status: "execution_lease_renewed",
    };
  },

  async releaseExecutionLease(input) {
    releasedLeaseInputs.push(input);

    return {
      status: "execution_lease_released",

      reason: null,

      investigationId: input.investigationId,

      leaseToken: input.leaseToken,

      releasedAt: input.releasedAt,
    };
  },
};

console.log("\n===== STATE UPDATE FAILURE / LEASE CLEANUP =====");

const stateFailureResult = await processQueuedInvestigation({
  message: queueMessage,

  investigationRepository: failingStateRepository,

  executionLease: leaseForFailedState,

  now,

  createLeaseToken: () => "lease_state_failure",
});

console.dir(stateFailureResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const tests = {
  missingDependenciesRejected:
    missingDependenciesResult.status === "queued_investigation_not_ready",

  invalidMessageRejected:
    invalidMessageResult.status === "queued_message_rejected" &&
    invalidMessageResult.reason === "unsupported_queue_message_version",

  missingInvestigationHandled:
    missingInvestigationResult.status === "queued_investigation_not_found",

  nonResumableStateBlocked:
    nonResumableResult.status === "queued_investigation_not_processable" &&
    nonResumableResult.lifecycleState === "CREATED",

  happyPathPrepared: happyResult.status === "queued_investigation_prepared",

  happyLifecycleStateCorrect: happyResult.lifecycleState === "PREPARING_REVIEW",

  happyNotResumed: happyResult.resumed === false,

  happyLeaseTokenReturned:
    happyResult.execution?.leaseToken === "lease_happy_path",

  happyAttemptIsOne: happyResult.execution?.attempt === 1,

  happyLeaseExpiryCorrect:
    happyResult.execution?.expiresAt === "2026-09-07T11:05:00.000Z",

  happyLeaseAcquisitionRecorded:
    happyAcquireInputs.length === 1 &&
    happyAcquireInputs[0].investigationId === investigationId &&
    happyAcquireInputs[0].leaseToken === "lease_happy_path",

  preparingReviewPersisted:
    happyUpdates.length === 1 &&
    happyUpdates[0].investigationId === investigationId &&
    happyUpdates[0].update.lifecycleState === "PREPARING_REVIEW",

  duplicateDeliveryBlocked:
    duplicateResult.status === "queued_investigation_already_active" &&
    duplicateResult.reason === "active_execution_lease_exists",

  duplicateDidNotUpdateState: duplicateUpdateCalled === false,

  resumedPreparationAccepted:
    resumedResult.status === "queued_investigation_prepared",

  resumedFlagCorrect: resumedResult.resumed === true,

  resumedAttemptIsTwo: resumedResult.execution?.attempt === 2,

  resumedStateNotRewritten: resumedUpdateCalled === false,

  failedStateTransitionSurfaced:
    stateFailureResult.status === "queued_investigation_state_failed",

  failedStateLeaseReleased: releasedLeaseInputs.length === 1,

  releasedCorrectLeaseToken:
    releasedLeaseInputs[0]?.leaseToken === "lease_state_failure",

  releasedCorrectInvestigation:
    releasedLeaseInputs[0]?.investigationId === investigationId,
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== PROCESS QUEUED INVESTIGATION TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Process queued investigation test failed.");
}

console.log("\n===== PROCESS QUEUED INVESTIGATION TEST PASSED =====");
