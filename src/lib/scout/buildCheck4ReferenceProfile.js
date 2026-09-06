import { referenceRegistry } from "./referenceRegistry.js";

import { collectCheck1Evidence } from "./collectCheck1Evidence.js";
import { extractCheck1Observations } from "./extractCheck1Observations.js";
import { summarizeCheck1Observations } from "./summarizeCheck1Observations.js";

import { deriveCheck4BehaviorProfile } from "./deriveCheck4BehaviorProfile.js";

export async function buildCheck4ReferenceProfile({
  evidenceCollector = collectCheck1Evidence,
} = {}) {
  const registry = referenceRegistry.technocore;

  /*
   * Check 4 requires a configured,
   * immutable authoritative reference.
   */
  if (
    !registry?.sourceRepo ||
    !registry.sourceRepo.commitSha ||
    !Array.isArray(registry.repoSurfaces) ||
    registry.repoSurfaces.length === 0
  ) {
    return {
      status: "reference_profile_not_available",
      reason: "authoritative_reference_not_configured",
    };
  }

  const evidencePlan = {
    status: "evidence_plan_ready",
    paths: registry.repoSurfaces,
  };

  /*
   * IMPORTANT:
   *
   * We deliberately use the pinned commit SHA,
   * not the moving "main" branch.
   *
   * This keeps Technocore Reference 1.0
   * reproducible for historical Scout reviews.
   */
  const evidence = await evidenceCollector({
    owner: registry.sourceRepo.owner,
    repo: registry.sourceRepo.repo,
    branch: registry.sourceRepo.commitSha,
    evidencePlan: evidencePlan,
  });

  if (
    evidence.status !== "evidence_collected" &&
    evidence.status !== "evidence_partial"
  ) {
    return {
      status: "reference_profile_not_available",
      reason: "authoritative_reference_evidence_not_collected",
    };
  }

  const observations = extractCheck1Observations(evidence);

  const summary = summarizeCheck1Observations(observations);

  const profile = deriveCheck4BehaviorProfile(summary);

  if (profile.status !== "behavior_profile_ready") {
    return {
      status: "reference_profile_not_available",
      reason: "authoritative_behavior_not_established",
    };
  }

  return {
    status: "reference_profile_ready",

    authority: {
      registryVersion: registry.version,

      repositoryId: registry.sourceRepo.repositoryId,

      owner: registry.sourceRepo.owner,

      repo: registry.sourceRepo.repo,

      canonicalUrl: registry.sourceRepo.canonicalUrl,

      commitSha: registry.sourceRepo.commitSha,

      treeSha: registry.sourceRepo.treeSha,

      surfaces: registry.repoSurfaces,
    },

    profile: profile,
  };
}
