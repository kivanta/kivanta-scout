import { validateInvestigationExecutionLease } from "./investigationExecutionLease.js";

/*
 * ------------------------------------------------
 * TEST 1
 * Missing execution lease.
 * ------------------------------------------------
 */

console.log("\n===== MISSING EXECUTION LEASE =====");

const missingLeaseResult = validateInvestigationExecutionLease(null);

console.dir(missingLeaseResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 2
 * Incomplete execution lease.
 * ------------------------------------------------
 */

const incompleteExecutionLease = {
  acquireExecutionLease: async () => null,

  getExecutionLease: async () => null,
};

console.log("\n===== INCOMPLETE EXECUTION LEASE =====");

const incompleteLeaseResult = validateInvestigationExecutionLease(
  incompleteExecutionLease,
);

console.dir(incompleteLeaseResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 3
 * Complete execution lease contract.
 * ------------------------------------------------
 */

const completeExecutionLease = {
  acquireExecutionLease: async () => null,

  getExecutionLease: async () => null,

  heartbeatExecutionLease: async () => null,

  releaseExecutionLease: async () => null,
};

console.log("\n===== COMPLETE EXECUTION LEASE =====");

const completeLeaseResult = validateInvestigationExecutionLease(
  completeExecutionLease,
);

console.dir(completeLeaseResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const tests = {
  missingLeaseRejected:
    missingLeaseResult.status === "execution_lease_not_ready" &&
    missingLeaseResult.reason === "execution_lease_required",

  incompleteLeaseRejected:
    incompleteLeaseResult.status === "execution_lease_not_ready" &&
    incompleteLeaseResult.reason === "execution_lease_methods_missing",

  missingHeartbeatDetected: incompleteLeaseResult.missingMethods.includes(
    "heartbeatExecutionLease",
  ),

  missingReleaseDetected: incompleteLeaseResult.missingMethods.includes(
    "releaseExecutionLease",
  ),

  completeLeaseAccepted: completeLeaseResult.status === "execution_lease_ready",

  noMissingMethods: completeLeaseResult.missingMethods.length === 0,
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== EXECUTION LEASE PORT TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Investigation execution lease port test failed.");
}

console.log("\n===== EXECUTION LEASE PORT TEST PASSED =====");
