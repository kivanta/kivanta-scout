import { validateInvestigationQueue } from "./investigationQueue.js";

/*
 * TEST 1
 * Missing Queue.
 */

console.log("\n===== MISSING QUEUE =====");

console.dir(validateInvestigationQueue(null), {
  depth: null,
});

/*
 * TEST 2
 * Incomplete Queue.
 */

const incompleteQueue = {};

console.log("\n===== INCOMPLETE QUEUE =====");

console.dir(validateInvestigationQueue(incompleteQueue), {
  depth: null,
});

/*
 * TEST 3
 * Complete Queue contract.
 */

const completeQueue = {
  sendInvestigation: async () => null,
};

console.log("\n===== COMPLETE QUEUE =====");

console.dir(validateInvestigationQueue(completeQueue), {
  depth: null,
});
