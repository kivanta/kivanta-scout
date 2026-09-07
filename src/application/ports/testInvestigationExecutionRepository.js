import { validateInvestigationExecutionRepository } from "./investigationExecutionRepository.js";

/*
 * ------------------------------------------------
 * TEST 1
 * Missing execution repository.
 * ------------------------------------------------
 */

console.log("\n===== MISSING EXECUTION REPOSITORY =====");

const missingRepositoryResult = validateInvestigationExecutionRepository(null);

console.dir(missingRepositoryResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 2
 * Incomplete execution repository.
 * ------------------------------------------------
 */

const incompleteRepository = {
  createExecution: async () => null,
};

console.log("\n===== INCOMPLETE EXECUTION REPOSITORY =====");

const incompleteRepositoryResult =
  validateInvestigationExecutionRepository(incompleteRepository);

console.dir(incompleteRepositoryResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * TEST 3
 * Complete execution repository contract.
 * ------------------------------------------------
 */

const completeRepository = {
  createExecution: async () => null,

  getExecution: async () => null,

  recordExecutionOutcome: async () => null,
};

console.log("\n===== COMPLETE EXECUTION REPOSITORY =====");

const completeRepositoryResult =
  validateInvestigationExecutionRepository(completeRepository);

console.dir(completeRepositoryResult, {
  depth: null,
});

/*
 * ------------------------------------------------
 * FINAL ASSERTIONS
 * ------------------------------------------------
 */

const tests = {
  missingRepositoryRejected:
    missingRepositoryResult.status === "execution_repository_not_ready" &&
    missingRepositoryResult.reason === "execution_repository_required",

  incompleteRepositoryRejected:
    incompleteRepositoryResult.status === "execution_repository_not_ready" &&
    incompleteRepositoryResult.reason ===
      "execution_repository_methods_missing",

  missingGetExecutionDetected:
    incompleteRepositoryResult.missingMethods.includes("getExecution"),

  missingRecordOutcomeDetected:
    incompleteRepositoryResult.missingMethods.includes(
      "recordExecutionOutcome",
    ),

  completeRepositoryAccepted:
    completeRepositoryResult.status === "execution_repository_ready",

  completeRepositoryHasNoMissingMethods:
    completeRepositoryResult.missingMethods.length === 0,
};

const allPassed = Object.values(tests).every(Boolean);

console.log("\n===== EXECUTION REPOSITORY PORT TEST =====");

console.dir(tests, {
  depth: null,
});

if (!allPassed) {
  throw new Error("Investigation execution repository port test failed.");
}

console.log("\n===== EXECUTION REPOSITORY PORT TEST PASSED =====");
