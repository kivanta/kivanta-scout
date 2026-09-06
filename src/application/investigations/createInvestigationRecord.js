/*
 * Create the durable identity for one
 * Scout investigation.
 *
 * This function does NOT write to D1 yet.
 * It builds the record that D1 will later store.
 */
export function createInvestigationRecord(
  frozenResult,
  {
    idFactory = () => globalThis.crypto.randomUUID(),

    now = () => new Date().toISOString(),
  } = {},
) {
  /*
   * An investigation may only be created
   * from a successfully frozen target.
   */
  if (frozenResult?.status !== "target_frozen" || !frozenResult?.target) {
    return {
      status: "investigation_not_created",
      reason: "frozen_target_required",
      investigation: null,
    };
  }

  const target = frozenResult.target;

  const source = target.source;
  const methodology = target.methodology;

  /*
   * These fields form Scout's exact
   * review identity.
   *
   * Same repository + same exact commit +
   * same methodology version = same review key.
   */
  if (
    !source?.repositoryId ||
    !source?.commitSha ||
    !methodology?.id ||
    !methodology?.version
  ) {
    return {
      status: "investigation_not_created",
      reason: "review_identity_not_available",
      investigation: null,
    };
  }

  const createdAt = now();

  const investigationId = idFactory();

  if (!investigationId) {
    return {
      status: "investigation_not_created",
      reason: "investigation_id_not_available",
      investigation: null,
    };
  }

  return {
    status: "investigation_created",
    reason: null,

    investigation: {
      /*
       * Opaque public/application identifier.
       *
       * It does not reveal repository details
       * or encode internal state.
       */
      investigationId: investigationId,

      createdAt: createdAt,

      updatedAt: createdAt,

      /*
       * Exact review key.
       *
       * This will later support D1 uniqueness
       * and joining duplicate active work.
       */
      reviewKey: {
        provider: "github",

        repositoryId: source.repositoryId,

        commitSha: source.commitSha,

        methodologyId: methodology.id,

        methodologyVersion: methodology.version,
      },

      /*
       * Keep the complete frozen target.
       *
       * Future workers must use this snapshot
       * rather than resolving a moving branch.
       */
      target: target,
    },
  };
}
