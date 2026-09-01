import { buildCheck2EvidencePlan } from "./buildCheck2EvidencePlan.js";
import { collectCheck2Evidence } from "./collectCheck2Evidence.js";
import { extractCheck2Observations } from "./extractCheck2Observations.js";
import { summarizeCheck2Observations } from "./summarizeCheck2Observations.js";
import { buildCheck2Result } from "./buildCheck2Result.js";

export async function runCheck2({
  owner,
  repo,
  branch,
  sourceAssessment,
  tree,
  python,
  technocoreEvidence,
  toolIdentity,
  evidenceCollector = collectCheck2Evidence,
}) {
  if (sourceAssessment.status !== "supported_source") {
    return {
      status: "NOT_RUN",
      title: "Your Key, Password & Sensitive Information",
      reason: "supported_source_required",
      evidence: [],
    };
  }

  const evidencePlan = buildCheck2EvidencePlan({
    tree: tree,
    python: python,
    technocoreEvidence: technocoreEvidence,
    toolIdentity: toolIdentity,
  });

  if (evidencePlan.status !== "evidence_plan_ready") {
    return {
      status: "UNKNOWN",
      title: "Your Key, Password & Sensitive Information",
      reason: "evidence_plan_not_available",
      evidence: [],
    };
  }

  const evidence = await evidenceCollector({
    owner: owner,
    repo: repo,
    branch: branch,
    evidencePlan: evidencePlan,
  });

  const observations = extractCheck2Observations(evidence);

  const summary = summarizeCheck2Observations(observations);

  return buildCheck2Result(summary);
}
