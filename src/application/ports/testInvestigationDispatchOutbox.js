import { validateInvestigationDispatchOutbox } from "./investigationDispatchOutbox.js";

/*
 * TEST 1
 * Missing outbox.
 */

console.log("\n===== MISSING OUTBOX =====");

console.dir(validateInvestigationDispatchOutbox(null), {
  depth: null,
});

/*
 * TEST 2
 * Incomplete outbox.
 */

const incompleteOutbox = {
  getPendingDispatches: async () => null,
};

console.log("\n===== INCOMPLETE OUTBOX =====");

console.dir(validateInvestigationDispatchOutbox(incompleteOutbox), {
  depth: null,
});

/*
 * TEST 3
 * Complete outbox contract.
 */

const completeOutbox = {
  getPendingDispatches: async () => null,

  markDispatchSucceeded: async () => null,

  markDispatchFailed: async () => null,
};

console.log("\n===== COMPLETE OUTBOX =====");

const completeResult = validateInvestigationDispatchOutbox(completeOutbox);

console.dir(completeResult, {
  depth: null,
});

/*
 * FINAL ASSERTION
 */

if (completeResult.status !== "dispatch_outbox_ready") {
  throw new Error("Investigation dispatch outbox contract test failed.");
}

console.log("\n===== INVESTIGATION DISPATCH OUTBOX PORT TEST PASSED =====");
