/*
 * Investigation Repository Port
 *
 * This defines what the Scout application
 * needs from durable investigation storage.
 *
 * The application does NOT know whether the
 * implementation is Cloudflare D1, a test
 * repository, or something else.
 *
 * Cloudflare D1 will implement this contract
 * later.
 */

/*
 * Methods every investigation repository
 * implementation must provide.
 */
const requiredMethods = [
  "claimActiveInvestigation",
  "getInvestigation",
  "updateInvestigation",
];

/*
 * Validate that a repository adapter
 * satisfies the application contract.
 */
export function validateInvestigationRepository(repository) {
  if (!repository || typeof repository !== "object") {
    return {
      status: "repository_not_ready",
      reason: "repository_required",
      missingMethods: requiredMethods,
    };
  }

  const missingMethods = requiredMethods.filter(
    (method) => typeof repository[method] !== "function",
  );

  if (missingMethods.length > 0) {
    return {
      status: "repository_not_ready",
      reason: "repository_methods_missing",
      missingMethods: missingMethods,
    };
  }

  return {
    status: "repository_ready",
    reason: null,
    missingMethods: [],
  };
}

/*
 * Repository contract:
 *
 * claimActiveInvestigation(investigation)
 *
 * Must atomically attempt to claim the
 * investigation's review key.
 *
 * Later D1 behavior:
 *
 * - if no active investigation exists:
 *     create it
 *
 * - if the same review is already active:
 *     return the existing investigation
 *
 * This prevents duplicate concurrent work.
 *
 *
 * getInvestigation(investigationId)
 *
 * Returns the current durable record for one
 * opaque investigation ID.
 *
 *
 * updateInvestigation(investigationId, changes)
 *
 * Updates durable investigation state.
 *
 * Later we will add lease/version safeguards
 * before workers are allowed to write results.
 */
export const investigationRepositoryContract = Object.freeze({
  requiredMethods: [...requiredMethods],
});
