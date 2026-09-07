/*
 * Investigation Execution Recovery Port Test
 *
 * Tests:
 *
 *   validateInvestigationExecutionRecovery()
 *
 *
 * We verify:
 *
 * 1. missing recovery implementation is rejected
 * 2. non-object implementation is rejected
 * 3. missing required method is rejected
 * 4. valid implementation is accepted
 * 5. exported contract lists the required method
 */

import assert from "node:assert/strict";

import {
  validateInvestigationExecutionRecovery,
  investigationExecutionRecoveryContract,
} from "./investigationExecutionRecovery.js";

/*
 * =================================================
 * TEST 1
 * Missing implementation
 * =================================================
 */

console.log("\n===== MISSING EXECUTION RECOVERY =====");

const missingRecoveryResult = validateInvestigationExecutionRecovery();

console.dir(missingRecoveryResult, {
  depth: null,
});

assert.equal(missingRecoveryResult.status, "execution_recovery_not_ready");

assert.equal(missingRecoveryResult.reason, "execution_recovery_required");

assert.deepEqual(missingRecoveryResult.missingMethods, [
  "getRecoverableInvestigations",
]);

/*
 * =================================================
 * TEST 2
 * Invalid implementation type
 * =================================================
 */

console.log("\n===== INVALID EXECUTION RECOVERY TYPE =====");

const invalidRecoveryResult =
  validateInvestigationExecutionRecovery("not-an-object");

console.dir(invalidRecoveryResult, {
  depth: null,
});

assert.equal(invalidRecoveryResult.status, "execution_recovery_not_ready");

assert.equal(invalidRecoveryResult.reason, "execution_recovery_required");

assert.deepEqual(invalidRecoveryResult.missingMethods, [
  "getRecoverableInvestigations",
]);

/*
 * =================================================
 * TEST 3
 * Missing required method
 * =================================================
 */

console.log("\n===== MISSING REQUIRED METHOD =====");

const incompleteRecoveryResult = validateInvestigationExecutionRecovery({
  someOtherMethod() {},
});

console.dir(incompleteRecoveryResult, {
  depth: null,
});

assert.equal(incompleteRecoveryResult.status, "execution_recovery_not_ready");

assert.equal(
  incompleteRecoveryResult.reason,
  "execution_recovery_methods_missing",
);

assert.deepEqual(incompleteRecoveryResult.missingMethods, [
  "getRecoverableInvestigations",
]);

/*
 * =================================================
 * TEST 4
 * Valid implementation
 * =================================================
 */

console.log("\n===== VALID EXECUTION RECOVERY =====");

const validRecovery = {
  async getRecoverableInvestigations() {
    return {
      status: "recoverable_investigations_found",

      reason: null,

      investigations: [],

      count: 0,
    };
  },
};

const validRecoveryResult =
  validateInvestigationExecutionRecovery(validRecovery);

console.dir(validRecoveryResult, {
  depth: null,
});

assert.equal(validRecoveryResult.status, "execution_recovery_ready");

assert.equal(validRecoveryResult.reason, null);

assert.deepEqual(validRecoveryResult.missingMethods, []);

/*
 * =================================================
 * TEST 5
 * Contract export
 * =================================================
 */

console.log("\n===== RECOVERY CONTRACT =====");

console.dir(investigationExecutionRecoveryContract, {
  depth: null,
});

assert.deepEqual(investigationExecutionRecoveryContract.requiredMethods, [
  "getRecoverableInvestigations",
]);

/*
 * =================================================
 * FINAL
 * =================================================
 */

console.log("\n===== INVESTIGATION EXECUTION RECOVERY PORT TEST PASSED =====");

console.log({
  missingImplementationRejected: true,

  invalidTypeRejected: true,

  missingMethodRejected: true,

  validImplementationAccepted: true,

  contractExported: true,
});
