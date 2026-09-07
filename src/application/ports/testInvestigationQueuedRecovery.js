/*
 * Investigation Queued Recovery Port Test
 *
 * Tests:
 *
 *   validateInvestigationQueuedRecovery()
 *
 *
 * We verify:
 *
 * 1. missing implementation is rejected
 * 2. invalid implementation type is rejected
 * 3. missing query method is rejected
 * 4. missing record method is rejected
 * 5. complete implementation is accepted
 * 6. contract exports both required methods
 * 7. contract locks QUEUED lifecycle
 * 8. contract locks DISPATCHED outbox state
 * 9. terminal execution states are excluded
 * 10. usable active lease is excluded
 * 11. current timestamp is required
 * 12. stale threshold is required
 * 13. successful recovery keeps outbox DISPATCHED
 * 14. original dispatched_at is preserved
 * 15. attempt count is incremented
 * 16. updated_at becomes the recovery cooldown clock
 */

import assert from "node:assert/strict";

import {
  validateInvestigationQueuedRecovery,
  investigationQueuedRecoveryContract,
} from "./investigationQueuedRecovery.js";

/*
 * =================================================
 * TEST 1
 * Missing implementation
 * =================================================
 */

console.log("\n===== MISSING QUEUED RECOVERY IMPLEMENTATION =====");

const missingImplementationResult = validateInvestigationQueuedRecovery();

console.dir(missingImplementationResult, {
  depth: null,
});

assert.equal(missingImplementationResult.status, "queued_recovery_not_ready");

assert.equal(missingImplementationResult.reason, "queued_recovery_required");

/*
 * =================================================
 * TEST 2
 * Invalid implementation type
 * =================================================
 */

console.log("\n===== INVALID QUEUED RECOVERY TYPE =====");

const invalidTypeResult = validateInvestigationQueuedRecovery("not-an-object");

console.dir(invalidTypeResult, {
  depth: null,
});

assert.equal(invalidTypeResult.status, "queued_recovery_not_ready");

assert.equal(invalidTypeResult.reason, "queued_recovery_required");

/*
 * =================================================
 * TEST 3
 * Missing query method
 * =================================================
 */

console.log("\n===== MISSING QUEUED RECOVERY QUERY METHOD =====");

const missingQueryMethodResult = validateInvestigationQueuedRecovery({
  markQueuedRecoveryDispatched() {},
});

console.dir(missingQueryMethodResult, {
  depth: null,
});

assert.equal(missingQueryMethodResult.status, "queued_recovery_not_ready");

assert.equal(
  missingQueryMethodResult.reason,
  "queued_recovery_methods_missing",
);

/*
 * =================================================
 * TEST 4
 * Missing durable-record method
 * =================================================
 */

console.log("\n===== MISSING QUEUED RECOVERY RECORD METHOD =====");

const missingRecordMethodResult = validateInvestigationQueuedRecovery({
  getRecoverableQueuedInvestigations() {},
});

console.dir(missingRecordMethodResult, {
  depth: null,
});

assert.equal(missingRecordMethodResult.status, "queued_recovery_not_ready");

assert.equal(
  missingRecordMethodResult.reason,
  "queued_recovery_methods_missing",
);

/*
 * =================================================
 * TEST 5
 * Valid implementation
 * =================================================
 */

console.log("\n===== VALID QUEUED RECOVERY IMPLEMENTATION =====");

const validImplementation = {
  async getRecoverableQueuedInvestigations() {
    return {
      status: "recoverable_queued_investigations_found",

      reason: null,

      investigations: [],

      count: 0,
    };
  },

  async markQueuedRecoveryDispatched() {
    return {
      status: "queued_recovery_dispatch_recorded",

      reason: null,

      outboxId: 1,

      dispatchState: "DISPATCHED",
    };
  },
};

const validImplementationResult =
  validateInvestigationQueuedRecovery(validImplementation);

console.dir(validImplementationResult, {
  depth: null,
});

assert.equal(validImplementationResult.status, "queued_recovery_ready");

assert.equal(validImplementationResult.reason, null);

/*
 * =================================================
 * FINAL CONTRACT ASSERTIONS
 * =================================================
 */

const tests = {
  /*
   * Validation
   */
  missingImplementationRejected:
    missingImplementationResult.status === "queued_recovery_not_ready" &&
    missingImplementationResult.reason === "queued_recovery_required",

  invalidTypeRejected:
    invalidTypeResult.status === "queued_recovery_not_ready" &&
    invalidTypeResult.reason === "queued_recovery_required",

  missingQueryMethodRejected:
    missingQueryMethodResult.status === "queued_recovery_not_ready" &&
    missingQueryMethodResult.reason === "queued_recovery_methods_missing",

  missingRecordMethodRejected:
    missingRecordMethodResult.status === "queued_recovery_not_ready" &&
    missingRecordMethodResult.reason === "queued_recovery_methods_missing",

  validImplementationAccepted:
    validImplementationResult.status === "queued_recovery_ready" &&
    validImplementationResult.reason === null,

  /*
   * Required methods
   */
  bothRequiredMethodsExported:
    JSON.stringify(investigationQueuedRecoveryContract.methods) ===
    JSON.stringify([
      "getRecoverableQueuedInvestigations",
      "markQueuedRecoveryDispatched",
    ]),

  /*
   * Recovery query contract
   */
  queuedLifecycleLocked:
    investigationQueuedRecoveryContract.recoverableQuery.lifecycleState ===
    "QUEUED",

  dispatchedOutboxLocked:
    investigationQueuedRecoveryContract.recoverableQuery.dispatchState ===
    "DISPATCHED",

  terminalExecutionsExcluded:
    JSON.stringify(
      investigationQueuedRecoveryContract.recoverableQuery
        .terminalExecutionStatuses,
    ) === JSON.stringify(["COMPLETE", "PARTIAL", "FAILED"]),

  usableLeaseExcluded:
    investigationQueuedRecoveryContract.recoverableQuery.usableLeaseExcluded ===
    true,

  currentTimestampRequired:
    investigationQueuedRecoveryContract.recoverableQuery
      .currentTimestampRequired === true,

  staleThresholdRequired:
    investigationQueuedRecoveryContract.recoverableQuery
      .staleThresholdRequired === true,

  /*
   * Recovery dispatch contract
   */
  recoveryKeepsDispatchedState:
    investigationQueuedRecoveryContract.recoveryDispatch
      .dispatchStateRemains === "DISPATCHED",

  originalDispatchTimestampPreserved:
    investigationQueuedRecoveryContract.recoveryDispatch
      .preserveOriginalDispatchedAt === true,

  recoveryIncrementsAttemptCount:
    investigationQueuedRecoveryContract.recoveryDispatch
      .incrementAttemptCount === true,

  recoveryRefreshesCooldownClock:
    investigationQueuedRecoveryContract.recoveryDispatch.refreshUpdatedAt ===
    true,
};

/*
 * =================================================
 * PASS / FAIL
 * =================================================
 */

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== INVESTIGATION QUEUED RECOVERY PORT TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Investigation queued recovery port test failed.");
}

console.log("\n===== INVESTIGATION QUEUED RECOVERY PORT TEST PASSED =====");
