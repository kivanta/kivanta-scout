import { methodologyIdentity } from "../../lib/scout/methodologyIdentity.js";
import { referenceRegistry } from "../../lib/scout/referenceRegistry.js";
import { createRegistryDigest } from "../../lib/scout/createRegistryDigest.js";

/*
 * Freeze one Scout investigation target.
 *
 * From this point onward, the investigation
 * refers to exact immutable source snapshots.
 */
export async function freezeInvestigationTarget(
  prepared,
  {
    now = () => new Date().toISOString(),

    registryDigestCreator = createRegistryDigest,
  } = {},
) {
  /*
   * Only a successfully prepared supported
   * source may become an investigation target.
   */
  if (
    prepared?.status !== "source_ready" ||
    prepared?.methodologyEligible !== true
  ) {
    return {
      status: "target_not_frozen",
      reason: "source_ready_required",
      target: null,
    };
  }

  const sourceAssessment = prepared.sourceAssessment;

  const repository = sourceAssessment?.repository;

  /*
   * Candidate source must already contain
   * its immutable GitHub snapshot.
   */
  if (
    !repository?.repositoryId ||
    !repository?.commitSha ||
    !repository?.treeSha
  ) {
    return {
      status: "target_not_frozen",
      reason: "frozen_source_snapshot_not_available",
      target: null,
    };
  }

  const canonicalSource = prepared.canonicalSource;

  if (!canonicalSource?.owner || !canonicalSource?.repo) {
    return {
      status: "target_not_frozen",
      reason: "canonical_source_not_available",
      target: null,
    };
  }

  const technocoreReference = referenceRegistry.technocore;

  /*
   * The authoritative Technocore reference
   * must also be pinned.
   */
  if (
    !technocoreReference?.version ||
    !technocoreReference?.sourceRepo?.repositoryId ||
    !technocoreReference?.sourceRepo?.commitSha ||
    !technocoreReference?.sourceRepo?.treeSha
  ) {
    return {
      status: "target_not_frozen",
      reason: "reference_snapshot_not_available",
      target: null,
    };
  }

  /*
   * Fingerprint the exact reference registry
   * configuration used by this investigation.
   */
  let registryDigest;

  try {
    registryDigest = await registryDigestCreator(referenceRegistry);
  } catch {
    return {
      status: "target_not_frozen",
      reason: "reference_registry_digest_not_available",
      target: null,
    };
  }

  if (!registryDigest?.algorithm || !registryDigest?.value) {
    return {
      status: "target_not_frozen",
      reason: "reference_registry_digest_not_available",
      target: null,
    };
  }

  return {
    status: "target_frozen",
    reason: null,

    target: {
      frozenAt: now(),

      source: {
        repositoryId: repository.repositoryId,

        owner: canonicalSource.owner,

        repo: canonicalSource.repo,

        canonicalUrl: canonicalSource.canonicalUrl || null,

        defaultBranch: repository.defaultBranch || null,

        commitSha: repository.commitSha,

        treeSha: repository.treeSha,
      },

      methodology: {
        id: methodologyIdentity.id,

        version: methodologyIdentity.version,
      },

      technocoreReference: {
        registryVersion: technocoreReference.version,

        repositoryId: technocoreReference.sourceRepo.repositoryId,

        owner: technocoreReference.sourceRepo.owner,

        repo: technocoreReference.sourceRepo.repo,

        canonicalUrl: technocoreReference.sourceRepo.canonicalUrl,

        commitSha: technocoreReference.sourceRepo.commitSha,

        treeSha: technocoreReference.sourceRepo.treeSha,
      },

      /*
       * Fingerprint of the complete
       * reference registry configuration.
       */
      referenceRegistryDigest: {
        algorithm: registryDigest.algorithm,

        canonicalization: registryDigest.canonicalization,

        value: registryDigest.value,
      },
    },
  };
}
