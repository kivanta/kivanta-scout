import { buildCheck1EvidencePlan } from "./buildCheck1EvidencePlan.js";
import { collectCheck1Evidence } from "./collectCheck1Evidence.js";
import { extractCheck1Observations } from "./extractCheck1Observations.js";
import { summarizeCheck1Observations } from "./summarizeCheck1Observations.js";

import { deriveCheck4BehaviorProfile } from "./deriveCheck4BehaviorProfile.js";
import { buildCheck4ReferenceProfile } from "./buildCheck4ReferenceProfile.js";
import { compareCheck4BehaviorProfiles } from "./compareCheck4BehaviorProfiles.js";
import { buildCheck4Result } from "./buildCheck4Result.js";

export async function runCheck4({
  owner,
  repo,
  branch,
  sourceAssessment,
  tree,
  python,
  technocoreEvidence,
  toolIdentity,

  targetEvidenceCollector = collectCheck1Evidence,

  referenceProfileBuilder = buildCheck4ReferenceProfile,
}) {
  const title = "Does It Match the Official Technocore Reference?";

  if (sourceAssessment.status !== "supported_source") {
    return {
      status: "NOT_RUN",
      title: title,
      reason: "supported_source_required",
      evidence: [],
    };
  }

  const evidencePlan = buildCheck1EvidencePlan({
    tree: tree,
    python: python,
    technocoreEvidence: technocoreEvidence,
    toolIdentity: toolIdentity,
  });

  if (evidencePlan.status !== "evidence_plan_ready") {
    return {
      status: "UNKNOWN",
      title: title,
      reason: "target_behavior_evidence_not_available",
      evidence: [],
    };
  }

  const targetEvidence = await targetEvidenceCollector({
    owner: owner,
    repo: repo,
    branch: branch,
    evidencePlan: evidencePlan,
  });

  const targetObservations = extractCheck1Observations(targetEvidence);

  const targetSummary = summarizeCheck1Observations(targetObservations);

  const targetProfile = deriveCheck4BehaviorProfile(targetSummary);

  if (targetProfile.status !== "behavior_profile_ready") {
    return {
      status: "UNKNOWN",
      title: title,
      reason: "target_behavior_profile_not_established",
      evidence: [],
    };
  }

  const referenceResult = await referenceProfileBuilder();

  if (referenceResult.status !== "reference_profile_ready") {
    return {
      status: "UNKNOWN",
      title: title,
      reason: referenceResult.reason || "authoritative_reference_not_available",
      evidence: [],
    };
  }

  const comparison = compareCheck4BehaviorProfiles(
    targetProfile,
    referenceResult.profile,
  );

  return buildCheck4Result(comparison, referenceResult.authority);
}
