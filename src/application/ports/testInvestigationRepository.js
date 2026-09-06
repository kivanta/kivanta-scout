import { validateInvestigationRepository } from "./investigationRepository.js";

/*
 * TEST 1
 * Missing repository.
 */
console.log("\n===== MISSING REPOSITORY =====");

console.dir(validateInvestigationRepository(null), {
  depth: null,
});

/*
 * TEST 2
 * Incomplete repository.
 */
const incompleteRepository = {
  getInvestigation: async () => null,
};

console.log("\n===== INCOMPLETE REPOSITORY =====");

console.dir(validateInvestigationRepository(incompleteRepository), {
  depth: null,
});

/*
 * TEST 3
 * Complete repository contract.
 */
const completeRepository = {
  claimActiveInvestigation: async () => null,

  getInvestigation: async () => null,

  updateInvestigation: async () => null,
};

console.log("\n===== COMPLETE REPOSITORY =====");

console.dir(validateInvestigationRepository(completeRepository), {
  depth: null,
});
