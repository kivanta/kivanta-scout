import { buildCheck3EvidencePlan } from "./buildCheck3EvidencePlan.js";
import { collectCheck3Evidence } from "./collectCheck3Evidence.js";
import { extractCheck3Observations } from "./extractCheck3Observations.js";
import { summarizeCheck3Observations } from "./summarizeCheck3Observations.js";
import { buildCheck3Result } from "./buildCheck3Result.js";

export async function runCheck3({
  owner,
  repo,
  branch,
  sourceAssessment,
  tree,
  python,
  technocoreEvidence,
  toolIdentity,
  evidenceCollector = collectCheck3Evidence,
}) {
  if (sourceAssessment.status !== "supported_source") {
    return {
      status: "NOT_RUN",
      title: "Where Does It Connect?",
      reason: "supported_source_required",
      evidence: [],
    };
  }

  const evidencePlan = buildCheck3EvidencePlan({
    tree: tree,
    python: python,
    technocoreEvidence: technocoreEvidence,
    toolIdentity: toolIdentity,
  });

  if (evidencePlan.status !== "evidence_plan_ready") {
    return {
      status: "UNKNOWN",
      title: "Where Does It Connect?",
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

  const observations = extractCheck3Observations(evidence);

  const summary = summarizeCheck3Observations(observations);

  return buildCheck3Result(summary);
}
